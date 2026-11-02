import pacote from '../../package.json'

/** Versão do app, da mesma fonte (`package.json`) que o navegador usa em `__APP_VERSION__`. Nada a atualizar à mão. */
const VERSAO = pacote.version

/**
 * Ponto único de registro do servidor: uma linha JSON no `console` (vai para o tail do Pages).
 * Sem amostragem. Nunca passe token, corpo de requisição ou conteúdo de relatório.
 */
export function registrar(evento: Record<string, unknown>, nivel: 'log' | 'error' = 'log'): void {
  console[nivel](JSON.stringify({ ts: new Date().toISOString(), versao: VERSAO, ...evento }))
}
