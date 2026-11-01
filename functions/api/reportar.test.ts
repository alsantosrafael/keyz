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

afterEach(() => vi.unstubAllGlobals())

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
})
