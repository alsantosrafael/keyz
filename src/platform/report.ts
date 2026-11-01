import { z } from 'zod'
import type { Report } from '@keyz/shared'
import type { ReportPort, ReportResult } from '../application/ports'

const responseSchema = z.object({ ok: z.literal(true), number: z.number().nullable() }).or(z.object({ error: z.string() }))

/** Envia o relatório ao endpoint do próprio site (`functions/api/reportar.ts`); o token fica no servidor. */
export class WebReports implements ReportPort {
  async submit(report: Report): Promise<ReportResult> {
    try {
      const response = await fetch('/api/reportar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(report),
      })
      const parsed = responseSchema.safeParse(await response.json().catch(() => null))
      if (response.ok && parsed.success && 'ok' in parsed.data) return { ok: true, number: parsed.data.number }
      return { ok: false, message: parsed.success && 'error' in parsed.data ? parsed.data.error : 'Não foi possível enviar agora.' }
    } catch {
      return { ok: false, message: 'Sem conexão. Verifique a internet e tente de novo.' }
    }
  }
}
