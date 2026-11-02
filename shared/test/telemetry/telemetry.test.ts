import { describe, expect, it } from 'vitest'
import { clientEventSchema, sanitizeTelemetryText } from '../../src'

const base = { event: 'app.error', outcome: 'error', attrs: { kind: 'render', 'error.name': 'TypeError' } }

describe('clientEventSchema', () => {
  it('aceita um evento válido', () => {
    expect(clientEventSchema.safeParse(base).success).toBe(true)
  })

  it('rejeita evento fora do catálogo (inclusive o que é só do servidor)', () => {
    expect(clientEventSchema.safeParse({ ...base, event: 'report.submit' }).success).toBe(false)
    expect(clientEventSchema.safeParse({ ...base, event: 'session.summary' }).success).toBe(false)
  })

  it('rejeita outcome fora de error e rejected', () => {
    expect(clientEventSchema.safeParse({ ...base, outcome: 'ok' }).success).toBe(false)
  })

  it('rejeita atributo aninhado (só valores planos)', () => {
    expect(clientEventSchema.safeParse({ ...base, attrs: { github: { status: 502 } } }).success).toBe(false)
  })

  it('limita a 20 atributos e o texto a 200 caracteres', () => {
    const muitos = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i]))
    expect(clientEventSchema.safeParse({ ...base, attrs: muitos }).success).toBe(false)
    const longo = { ...base, attrs: { 'error.message': 'a'.repeat(201) } }
    expect(clientEventSchema.safeParse(longo).success).toBe(false)
    const no_limite = { ...base, attrs: { 'error.message': 'a'.repeat(200) } }
    expect(clientEventSchema.safeParse(no_limite).success).toBe(true)
  })

  it('descarta campos extras fora do formato', () => {
    const r = clientEventSchema.parse({ ...base, ts: '2026-11-02T00:00:00Z', service: 'web' })
    expect(Object.keys(r).sort()).toEqual(['attrs', 'event', 'outcome'])
  })
})

describe('sanitizeTelemetryText', () => {
  it('remove URLs, que podem carregar tokens', () => {
    expect(sanitizeTelemetryText('falha em https://api.github.com/x?token=abc agora')).toBe('falha em [url] agora')
  })

  it('remove sequências de 6 ou mais dígitos, mas mantém números curtos', () => {
    expect(sanitizeTelemetryText('id 12345678 caiu')).toBe('id [n] caiu')
    expect(sanitizeTelemetryText('status 401')).toBe('status 401')
  })

  it('colapsa espaços e trunca com reticências no máximo pedido', () => {
    const out = sanitizeTelemetryText('a   b\n\nc '.repeat(50), 20)
    expect(out.length).toBe(20)
    expect(out.endsWith('…')).toBe(true)
  })
})
