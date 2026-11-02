import { z } from 'zod'

/**
 * Nomes e valores fixos da telemetria. Use sempre a constante, nunca o texto digitado à mão:
 * o compilador acusa typo, e o schema do navegador sai daqui.
 */
export const EVENTO = {
  appError: 'app.error',
  inputFailure: 'input.failure',
  storageInvalid: 'storage.invalid',
  reportSubmit: 'report.submit',
  clientRejected: 'client.rejected',
} as const

export const OUTCOME = { ok: 'ok', error: 'error', rejected: 'rejected' } as const

/** Motivo de recusa de uma requisição (aparece no log como `motivo`). */
export const MOTIVO = {
  method: 'method',
  origin: 'origin',
  config: 'config',
  tooLarge: 'too_large',
  badJson: 'bad_json',
  honeypot: 'honeypot',
  schema: 'schema',
} as const

export const ORIGEM_ERRO = { render: 'render', windowError: 'window_error', unhandledRejection: 'unhandled_rejection' } as const
export const FONTE_ENTRADA = { mic: 'mic', midi: 'midi' } as const
export const ETAPA_ENTRADA = { request: 'request', worker: 'worker', trackEnded: 'track_ended' } as const

/** Eventos que o navegador pode enviar. `report.submit` e `client.rejected` são só do servidor. */
const EVENTOS_DO_NAVEGADOR = [EVENTO.appError, EVENTO.inputFailure, EVENTO.storageInvalid] as const

/** Máximo de atributos por evento e de caracteres por valor de texto. */
const MAX_ATTRS = 20
const MAX_ATTR_TEXT = 200

const valorAtributo = z.union([z.string().max(MAX_ATTR_TEXT), z.number().finite(), z.boolean()])

/**
 * Evento do navegador: `{ event, outcome, attrs }`, com atributos planos.
 * Valida na borda (`functions/api/eventos.ts`). Campos extras são descartados pelo Zod.
 */
export const clientEventSchema = z.object({
  event: z.enum(EVENTOS_DO_NAVEGADOR),
  outcome: z.enum([OUTCOME.error, OUTCOME.rejected]),
  attrs: z
    .record(z.string().max(40), valorAtributo)
    .refine((a) => Object.keys(a).length <= MAX_ATTRS, { message: `Máximo de ${MAX_ATTRS} atributos.` }),
})
export type ClientEvent = z.infer<typeof clientEventSchema>

/**
 * Sanitiza texto livre antes de sair do aparelho ou do servidor: remove URLs (podem trazer tokens),
 * sequências de 6 ou mais dígitos (podem ser IDs), colapsa espaços e corta com reticências.
 * Nunca usar para conteúdo musical ou de usuário.
 */
export function sanitizeTelemetryText(texto: string, max = MAX_ATTR_TEXT): string {
  const limpo = texto
    .replace(/\b(?:https?|wss?|blob|data):\S*/gi, '[url]')
    .replace(/\d{6,}/g, '[n]')
    .replace(/\s+/g, ' ')
    .trim()
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo
}
