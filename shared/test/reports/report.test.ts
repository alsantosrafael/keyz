import { describe, expect, it } from 'vitest'
import { REPORT_TYPES, formatIssue, reportSchema, sanitize } from '../../src'

const context = { version: '0.3.0', userAgent: 'Mozilla/5.0', mode: 'acordes', input: 'microfone', theme: 'dark', viewport: '390x844' }
const valid = { type: 'bug', title: 'Tecla trava', fields: { 'o-que': 'Travou ao tocar Dó' }, context }

describe('relatório', () => {
  it('aceita um relatório válido', () => {
    expect(reportSchema.safeParse(valid).success).toBe(true)
  })

  it('exige os campos obrigatórios do tipo', () => {
    const r = reportSchema.safeParse({ ...valid, fields: {} })
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toContain('O que aconteceu')
  })

  it('recusa tipo desconhecido, campo desconhecido e título vazio', () => {
    expect(reportSchema.safeParse({ ...valid, type: 'xyz' }).success).toBe(false)
    expect(reportSchema.safeParse({ ...valid, fields: { ...valid.fields, extra: 'x' } }).success).toBe(false)
    expect(reportSchema.safeParse({ ...valid, title: '  ' }).success).toBe(false)
  })

  it('recusa quando a isca está preenchida', () => {
    expect(reportSchema.safeParse({ ...valid, website: 'http://spam' }).success).toBe(false)
  })

  it('limita o tamanho dos campos', () => {
    expect(reportSchema.safeParse({ ...valid, fields: { 'o-que': 'x'.repeat(2001) } }).success).toBe(false)
  })

  it('todo tipo tem ao menos um campo obrigatório e ids únicos', () => {
    for (const t of REPORT_TYPES) {
      expect(t.fields.some((f) => f.required)).toBe(true)
      expect(new Set(t.fields.map((f) => f.id)).size).toBe(t.fields.length)
    }
  })

  it('neutraliza menções e comentários HTML', () => {
    expect(sanitize('oi @alguem <!-- x -->')).not.toContain('@alguem')
    expect(sanitize('<!-- x')).not.toContain('<!--')
  })

  it('monta título, corpo e rótulos', () => {
    const draft = formatIssue(reportSchema.parse({ ...valid, contact: 'a@b.com' }))
    expect(draft.title).toBe('Bug: Tecla trava')
    expect(draft.labels).toEqual(['bug', 'via-app'])
    expect(draft.body).toContain('### O que aconteceu')
    expect(draft.body).toContain('Versão: 0.3.0')
    expect(draft.body).toContain('a@b.com')
  })

  it('o título não aceita quebra de linha para forjar estrutura', () => {
    const draft = formatIssue(reportSchema.parse({ ...valid, title: 'a\n\n## b' }))
    expect(draft.title).not.toContain('\n')
  })
})
