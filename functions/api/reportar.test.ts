import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from './reportar'

const context = { version: '0.3.0', userAgent: 'UA', mode: 'Livre', input: 'tela/teclado', theme: 'dark', viewport: '390x844' }
const report = { type: 'bug', title: 'Tecla trava', fields: { 'o-que': 'Travou' }, context }
const env = { GITHUB_TOKEN: 'segredo', GITHUB_REPO: 'dono/repo' }

const call = (body: unknown, init: { method?: string; origin?: string | null; env?: typeof env | object } = {}) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.origin !== null) headers.origin = init.origin ?? 'https://keyz.test'
  return onRequest({
    request: new Request('https://keyz.test/api/reportar', { method: init.method ?? 'POST', headers, body: init.method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }),
    env: (init.env ?? env) as typeof env,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('POST /api/reportar', () => {
  it('cria a issue e devolve o número, sem expor o token', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ number: 42 }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await call(report)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, number: 42 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/dono/repo/issues')
    expect(JSON.parse(init.body as string).title).toBe('Bug: Tecla trava')
  })

  it('só aceita POST do mesmo site', async () => {
    vi.stubGlobal('fetch', vi.fn())
    expect((await call(report, { method: 'GET' })).status).toBe(405)
    expect((await call(report, { origin: 'https://outro.site' })).status).toBe(403)
    expect((await call(report, { origin: null })).status).toBe(403)
  })

  it('recusa relatório inválido, isca preenchida e corpo gigante sem chamar o GitHub', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await call({ ...report, fields: {} })).status).toBe(400)
    expect((await call({ ...report, website: 'spam' })).status).toBe(400)
    expect((await call('{não é json')).status).toBe(400)
    expect((await call('x'.repeat(20_000))).status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sem segredo configurado, responde indisponível', async () => {
    vi.stubGlobal('fetch', vi.fn())
    expect((await call(report, { env: {} })).status).toBe(503)
  })

  it('falha do GitHub vira mensagem genérica, sem detalhe interno', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad credentials', { status: 401 })))
    const res = await call(report)
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('credentials')
  })

  describe('log (uma linha por requisição)', () => {
    const linhas = (spy: { mock: { calls: unknown[][] } }): Array<Record<string, any>> => spy.mock.calls.map((c) => JSON.parse(c[0] as string))

    it('falha do GitHub registra erro com status e mensagem sanitizada, sem token nem título', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad credentials', { status: 401 })))
      await call(report)
      expect(err).toHaveBeenCalledTimes(1)
      const [linha] = linhas(err)
      expect(linha).toMatchObject({ evento: 'report.submit', outcome: 'error', status: 502, github_status: 401, github_mensagem: 'Bad credentials' })
      expect(typeof linha.ts).toBe('string')
      expect(JSON.stringify(linha)).not.toContain('segredo')
      expect(JSON.stringify(linha)).not.toContain('Tecla trava')
    })

    it('falha de rede até o GitHub registra erro com o nome do erro', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down') }))
      const res = await call(report)
      expect(res.status).toBe(502)
      expect(err).toHaveBeenCalledTimes(1)
      expect(linhas(err)[0]).toMatchObject({ evento: 'report.submit', outcome: 'error', status: 502, github_erro: 'TypeError' })
    })

    it('rejeição registra uma linha de aviso com o motivo, sem o conteúdo do relatório', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.stubGlobal('fetch', vi.fn())
      await call(report, { origin: 'https://outro.site' })
      await call({ ...report, website: 'spam' })
      expect(linhas(log).map((e) => [e.evento, e.outcome, e.motivo, e.status])).toEqual([
        ['report.submit', 'rejected', 'origin', 403],
        ['report.submit', 'rejected', 'honeypot', 400],
      ])
      expect(err).not.toHaveBeenCalled()
      expect(JSON.stringify(linhas(log))).not.toContain('Tecla trava')
    })

    it('configuração ausente registra erro (503 é falha do servidor)', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.stubGlobal('fetch', vi.fn())
      await call(report, { env: {} })
      expect(linhas(err)[0]).toMatchObject({ evento: 'report.submit', outcome: 'error', motivo: 'config', status: 503 })
    })

    it('sucesso registra uma linha com o número da issue e o tipo, sem erro', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ number: 7 }), { status: 201 })))
      await call(report)
      expect(err).not.toHaveBeenCalled()
      expect(linhas(log)).toHaveLength(1)
      expect(linhas(log)[0]).toMatchObject({ evento: 'report.submit', outcome: 'ok', status: 200, issue: 7, type: 'bug' })
      expect(JSON.stringify(linhas(log))).not.toContain('Tecla trava')
    })
  })
})
