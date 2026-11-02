import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from './eventos'

const origem = 'https://keyz.test'
const evento = (over: Record<string, unknown> = {}) => ({
  event: 'app.error',
  outcome: 'error',
  attrs: { kind: 'render', 'error.name': 'TypeError', version: '0.4.0' },
  ...over,
})

const call = (body: unknown, init: { method?: string; origin?: string | null } = {}) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.origin !== null) headers.origin = init.origin ?? origem
  return onRequest({
    request: new Request(`${origem}/api/eventos`, {
      method: init.method ?? 'POST',
      headers,
      body: init.method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    env: {},
  })
}

const linhas = (spy: { mock: { calls: unknown[][] } }): Array<Record<string, any>> => spy.mock.calls.map((c) => JSON.parse(c[0] as string))

afterEach(() => vi.restoreAllMocks())

describe('POST /api/eventos', () => {
  it('aceita um evento válido com 204 e registra como erro, com os atributos na mesma linha', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await call(evento())
    expect(res.status).toBe(204)
    expect(log).not.toHaveBeenCalled()
    const [linha] = linhas(err)
    expect(linha).toMatchObject({ evento: 'app.error', outcome: 'error', kind: 'render', 'error.name': 'TypeError', version: '0.4.0' })
    expect(typeof linha.ts).toBe('string')
  })

  it('outcome rejected sai como aviso (console.log), não como erro', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await call({ event: 'storage.invalid', outcome: 'rejected', attrs: { key: 'keyz.settings' } })
    expect(res.status).toBe(204)
    expect(err).not.toHaveBeenCalled()
    expect(linhas(log)[0]).toMatchObject({ evento: 'storage.invalid', outcome: 'rejected', key: 'keyz.settings' })
  })

  it('só aceita POST do mesmo site e corpo até 8 KB, com linha de recusa', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect((await call(evento(), { method: 'GET' })).status).toBe(405)
    expect((await call(evento(), { origin: 'https://outro.site' })).status).toBe(403)
    expect((await call(evento(), { origin: null })).status).toBe(403)
    expect((await call('x'.repeat(9000))).status).toBe(413)
    expect(linhas(log).map((e) => [e.evento, e.motivo, e.status])).toEqual([
      ['client.rejected', 'method', 405],
      ['client.rejected', 'origin', 403],
      ['client.rejected', 'origin', 403],
      ['client.rejected', 'too_large', 413],
    ])
  })

  it('recusa JSON inválido e evento fora do schema (inclusive lote, que não é mais aceito)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect((await call('{não é json')).status).toBe(400)
    expect((await call(evento({ event: 'inventado' }))).status).toBe(400)
    expect((await call({ eventos: [evento()] })).status).toBe(400)
    expect(linhas(log).map((e) => e.motivo)).toEqual(['bad_json', 'schema', 'schema'])
  })

  it('não aceita evento do servidor enviado pelo cliente (report.submit)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await call(evento({ event: 'report.submit', outcome: 'ok' }))).status).toBe(400)
    expect([...linhas(log), ...linhas(err)].some((e) => e.evento === 'report.submit')).toBe(false)
  })

  it('atributos do cliente não sobrescrevem o campo fixo do evento', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await call(evento({ attrs: { evento: 'falso', outcome: 'ok', kind: 'render' } }))
    expect(linhas(err)[0]).toMatchObject({ evento: 'app.error', outcome: 'error' })
  })
})
