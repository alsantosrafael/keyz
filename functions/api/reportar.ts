import { formatIssue, reportSchema } from '../../shared/src/reports'
import { EVENTO, MOTIVO, OUTCOME, sanitizeTelemetryText } from '../../shared/src/telemetry'
import { registrar } from '../_lib/log'

interface Env {
  /** Token fine-grained, só com permissão de Issues neste repositório (segredo do Cloudflare). */
  GITHUB_TOKEN?: string
  /** `dono/repositório`. */
  GITHUB_REPO?: string
  /** Injetado pelo Cloudflare Pages no deploy. */
  CF_PAGES_COMMIT_SHA?: string
}

type Motivo = (typeof MOTIVO)[keyof typeof MOTIVO]

const MAX_BODY = 16_000
const MENSAGEM_FALHA = 'Não foi possível registrar agora. Tente de novo mais tarde.'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  })

/** Recusa com uma linha de log: motivo e status. Nunca o corpo nem o conteúdo do relatório. 5xx é erro; 4xx, aviso. */
function recusar(deploy: string | undefined, motivo: Motivo, status: number, mensagem: string, extra: Record<string, unknown> = {}): Response {
  const erro = status >= 500
  registrar(
    { evento: EVENTO.reportSubmit, outcome: erro ? OUTCOME.error : OUTCOME.rejected, motivo, status, deploy, ...extra },
    erro ? 'error' : 'log',
  )
  return json({ error: mensagem }, status)
}

/**
 * Recebe o relatório do app e cria a issue no GitHub. O token nunca vai ao navegador.
 * Defesas: só POST do mesmo site, corpo limitado, validação com o schema do catálogo, isca contra robôs.
 * Não limita requisições por conta própria: ver docs/SEGURANCA.md §1.5.
 * Observabilidade: uma linha `report.submit` por requisição (ver docs/OBSERVABILIDADE.md).
 */
export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const deploy = env.CF_PAGES_COMMIT_SHA?.slice(0, 7)
  try {
    return await tratar(request, env, deploy)
  } catch (erro) {
    registrar(
      { evento: EVENTO.reportSubmit, outcome: OUTCOME.error, status: 500, deploy, erro: erro instanceof Error ? erro.name : 'desconhecido' },
      'error',
    )
    throw erro
  }
}

async function tratar(request: Request, env: Env, deploy: string | undefined): Promise<Response> {
  if (request.method !== 'POST') return recusar(deploy, MOTIVO.method, 405, 'Método não permitido.')
  if (request.headers.get('origin') !== new URL(request.url).origin) return recusar(deploy, MOTIVO.origin, 403, 'Origem não permitida.')
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return recusar(deploy, MOTIVO.config, 503, 'Envio indisponível no momento.')

  const raw = await request.text()
  if (raw.length > MAX_BODY) return recusar(deploy, MOTIVO.tooLarge, 413, 'Relatório grande demais.')

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return recusar(deploy, MOTIVO.badJson, 400, 'Corpo inválido.')
  }
  // Isca preenchida: não diz ao robô o motivo; só registra.
  if (typeof data === 'object' && data !== null && 'website' in data && (data as { website: unknown }).website) {
    return recusar(deploy, MOTIVO.honeypot, 400, 'Relatório inválido.')
  }

  const parsed = reportSchema.safeParse(data)
  if (!parsed.success) {
    const primeiro = parsed.error.issues[0]
    // Só o nome do campo de topo (vem do schema), nunca o valor.
    return recusar(deploy, MOTIVO.schema, 400, primeiro?.message ?? 'Relatório inválido.', { campo: String(primeiro?.path[0] ?? 'raiz') })
  }

  const relatorio = parsed.data
  const issue = formatIssue(relatorio)
  let response: Response
  try {
    response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'keyz-reportar',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify(issue),
    })
  } catch (erro) {
    registrar(
      { evento: EVENTO.reportSubmit, outcome: OUTCOME.error, status: 502, deploy, github_erro: erro instanceof Error ? erro.name : 'desconhecido' },
      'error',
    )
    return json({ error: MENSAGEM_FALHA }, 502)
  }

  if (!response.ok) {
    // Corpo de erro do GitHub ajuda no diagnóstico (422, 403 por rate limit). O token nunca volta.
    const corpo = await response.text().catch(() => '')
    registrar(
      {
        evento: EVENTO.reportSubmit,
        outcome: OUTCOME.error,
        status: 502,
        deploy,
        github_status: response.status,
        github_mensagem: sanitizeTelemetryText(corpo, 160),
      },
      'error',
    )
    return json({ error: MENSAGEM_FALHA }, 502)
  }

  const created = (await response.json()) as { number?: number }
  registrar({ evento: EVENTO.reportSubmit, outcome: OUTCOME.ok, status: 200, deploy, issue: created.number ?? null, type: relatorio.type })
  return json({ ok: true, number: created.number ?? null })
}
