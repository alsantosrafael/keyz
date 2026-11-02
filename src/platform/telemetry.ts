import type { TelemetrySink } from '../application/ports'

/** Envia um evento a `/api/eventos` com `keepalive`, para sobreviver ao fechamento da página. Falha é ignorada. */
export class FetchSink implements TelemetrySink {
  async send(corpo: string): Promise<void> {
    try {
      await fetch('/api/eventos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: corpo,
        keepalive: true,
      })
    } catch {
      /* sem rede: o evento se perde, sem efeito no app */
    }
  }
}

/** Sinais de privacidade do navegador: Global Privacy Control e Do Not Track. */
export function pessoaPediuSemRastreio(nav: Navigator = navigator): boolean {
  const gpc = (nav as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
  const dnt = nav.doNotTrack === '1'
  return gpc || dnt
}
