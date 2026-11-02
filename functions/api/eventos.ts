import { EVENTO, MOTIVO, OUTCOME, clientEventSchema } from '../../shared/src/telemetry'
import { registrar } from '../_lib/log'

interface Env {
  CF_PAGES_COMMIT_SHA?: string
}

/** Limite do corpo, em bytes UTF-8. Um evento cabe com folga. */
const MAX_BODY = 8192

type Motivo = (typeof MOTIVO)[keyof typeof MOTIVO]

/** Recusa com uma linha de log (motivo e status). Nunca ecoa o corpo. */
function recusar(deploy: string | undefined, motivo: Motivo, status: number): Response {
  registrar({ evento: EVENTO.clientRejected, motivo, status, deploy })
  return new Response(JSON.stringify({ error: 'Não foi possível registrar.' }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

/**
 * Recebe UM evento técnico do navegador (`{ event, outcome, attrs }`), valida com Zod e registra uma linha.
 * Erros técnicos apenas, nunca áudio, notas ou texto digitado. Sem chamada externa: custa só a invocação da Function.
 */
export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const deploy = env.CF_PAGES_COMMIT_SHA?.slice(0, 7)
  if (request.method !== 'POST') return recusar(deploy, MOTIVO.method, 405)
  if (request.headers.get('origin') !== new URL(request.url).origin) return recusar(deploy, MOTIVO.origin, 403)

  const raw = await request.text()
  if (new TextEncoder().encode(raw).length > MAX_BODY) return recusar(deploy, MOTIVO.tooLarge, 413)

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return recusar(deploy, MOTIVO.badJson, 400)
  }
  const parsed = clientEventSchema.safeParse(data)
  if (!parsed.success) return recusar(deploy, MOTIVO.schema, 400)

  const { event, outcome, attrs } = parsed.data
  // Atributos vêm antes: não podem sobrescrever os campos fixos do registro.
  registrar({ ...attrs, evento: event, outcome, deploy }, outcome === OUTCOME.error ? 'error' : 'log')
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
}
