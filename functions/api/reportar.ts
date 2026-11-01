import { formatIssue, reportSchema } from '../../shared/src/reports'

interface Env {
  /** Token fine-grained, só com permissão de Issues neste repositório (segredo do Cloudflare). */
  GITHUB_TOKEN?: string
  /** `dono/repositório`. */
  GITHUB_REPO?: string
}

const MAX_BODY = 16_000
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })

/**
 * Recebe o relatório do app e cria a issue no GitHub. O token nunca vai ao navegador.
 * Defesas: só POST do mesmo site, corpo limitado, validação com o schema do catálogo, isca contra
 * robôs. Não limita requisições por conta própria: ver docs/SEGURANCA.md 1.5 (limite de taxa e Turnstile).
 */
export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Origem não permitida.' }, 403)
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return json({ error: 'Envio indisponível no momento.' }, 503)

  const raw = await request.text()
  if (raw.length > MAX_BODY) return json({ error: 'Relatório grande demais.' }, 413)
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return json({ error: 'Corpo inválido.' }, 400)
  }
  const parsed = reportSchema.safeParse(data)
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Relatório inválido.' }, 400)

  const issue = formatIssue(parsed.data)
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
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
  if (!response.ok) return json({ error: 'Não foi possível registrar agora. Tente de novo mais tarde.' }, 502)
  const created = (await response.json()) as { number?: number }
  return json({ ok: true, number: created.number ?? null })
}
