import { z } from 'zod'
import { REPORT_TYPE_IDS, reportType } from './catalog'

export const MAX_FIELD = 2000
export const MAX_TITLE = 80

/** Contexto técnico anexado automaticamente. Nunca inclui áudio nem dado pessoal. */
export const reportContextSchema = z.object({
  version: z.string().max(40),
  userAgent: z.string().max(300),
  mode: z.string().max(40),
  input: z.string().max(80),
  theme: z.string().max(20),
  viewport: z.string().max(20),
})
export type ReportContext = z.infer<typeof reportContextSchema>

export const reportSchema = z
  .object({
    type: z.enum(REPORT_TYPE_IDS),
    title: z.string().trim().min(1, 'Escreva um título curto.').max(MAX_TITLE),
    fields: z.record(z.string(), z.string().max(MAX_FIELD)),
    context: reportContextSchema,
    /** Contato opcional para retorno; o autor decide se informa. */
    contact: z.string().trim().max(120).default(''),
    /** Isca contra robôs: pessoas não veem este campo. */
    website: z.string().max(0).default(''),
  })
  .superRefine((r, ctx) => {
    const type = reportType(r.type)
    if (!type) return
    for (const f of type.fields) {
      if (f.required && !(r.fields[f.id] ?? '').trim()) ctx.addIssue({ code: 'custom', path: ['fields', f.id], message: `Preencha "${f.label}".` })
    }
    for (const id of Object.keys(r.fields)) {
      if (!type.fields.some((f) => f.id === id)) ctx.addIssue({ code: 'custom', path: ['fields', id], message: 'Campo desconhecido.' })
    }
  })
export type Report = z.infer<typeof reportSchema>

/** Neutraliza o que notificaria ou formataria algo fora do esperado no GitHub. */
export const sanitize = (text: string): string =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/(^|[^A-Za-z0-9_.-])@(?=[A-Za-z0-9_-])/g, '$1@\u200b') // sem menções (e-mail continua inteiro)
    .replace(/<!--/g, '&lt;!--') // sem comentário HTML escondido
    .trim()

export interface IssueDraft {
  title: string
  body: string
  labels: string[]
}

/** Monta a issue. Dado de fora entra só como texto, nunca como HTML. */
export function formatIssue(report: Report): IssueDraft {
  const type = reportType(report.type)!
  const lines: string[] = []
  for (const f of type.fields) {
    const value = sanitize(report.fields[f.id] ?? '')
    if (!value) continue
    lines.push(`### ${f.label}`, '', value, '')
  }
  const c = report.context
  lines.push(
    '### Contexto (enviado pelo app)',
    '',
    `- Versão: ${sanitize(c.version)}`,
    `- Modo: ${sanitize(c.mode)}`,
    `- Entrada: ${sanitize(c.input)}`,
    `- Tema: ${sanitize(c.theme)}`,
    `- Tela: ${sanitize(c.viewport)}`,
    `- Navegador: ${sanitize(c.userAgent)}`,
  )
  const contact = sanitize(report.contact)
  if (contact) lines.push('', '### Contato para retorno', '', contact)
  lines.push('', '_Aberta pelo formulário do app._')
  return {
    title: `${type.prefix}: ${sanitize(report.title).replace(/\s+/g, ' ')}`,
    body: lines.join('\n'),
    labels: [...type.labels, 'via-app'],
  }
}
