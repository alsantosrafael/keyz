import {
  ETAPA_ENTRADA,
  EVENTO,
  FONTE_ENTRADA,
  ORIGEM_ERRO,
  OUTCOME,
  sanitizeTelemetryText,
  type ClientEvent,
} from '@keyz/shared'
import type { TelemetryPort, TelemetrySink } from './ports'

/** Teto de envios por sessão, para caber no orçamento do plano free (ver docs/OBSERVABILIDADE.md). */
export const MAX_ENVIOS_POR_SESSAO = 5

type FonteEntrada = (typeof FONTE_ENTRADA)[keyof typeof FONTE_ENTRADA]
type EtapaEntrada = (typeof ETAPA_ENTRADA)[keyof typeof ETAPA_ENTRADA]
type OrigemErro = (typeof ORIGEM_ERRO)[keyof typeof ORIGEM_ERRO]

export interface ClientTelemetryOptions {
  sink: TelemetrySink
  /** Versão do app: vai junto de cada evento, em `attrs.version`. */
  version: string
}

/**
 * Telemetria do navegador. Cada `record` vira um envio (fire and forget), até o teto da sessão.
 * Não lança nunca: falha de telemetria não pode derrubar o app. Sem fila, sem retry, sem dedupe.
 */
export class ClientTelemetry implements TelemetryPort {
  private envios = 0

  constructor(private readonly o: ClientTelemetryOptions) {}

  record(evento: ClientEvent): void {
    try {
      if (this.envios >= MAX_ENVIOS_POR_SESSAO) return
      this.envios++
      const corpo: ClientEvent = { ...evento, attrs: { ...evento.attrs, version: this.o.version } }
      void this.o.sink.send(JSON.stringify(corpo)).catch(() => {})
    } catch {
      /* telemetria nunca quebra o app */
    }
  }
}

/** Usado quando a pessoa pediu para não ser rastreada (Sec-GPC ou Do Not Track): não guarda nem envia nada. */
export class SemTelemetria implements TelemetryPort {
  record(_evento: ClientEvent): void {}
}

/**
 * Falha de entrada (microfone ou MIDI). `etapa` diz em que momento falhou; `nome` é o nome do erro do navegador
 * (ex.: NotAllowedError), nunca o nome de um dispositivo.
 */
export function eventoDeEntrada(fonte: FonteEntrada, etapa: EtapaEntrada, nome: string, mensagem?: string): ClientEvent {
  const attrs: ClientEvent['attrs'] = { source: fonte, stage: etapa, 'error.name': sanitizeTelemetryText(nome, 60) }
  if (mensagem) attrs['error.message'] = sanitizeTelemetryText(mensagem, 200)
  return { event: EVENTO.inputFailure, outcome: OUTCOME.error, attrs }
}

/** Dado salvo que não passou no schema: o app cai no padrão. Registra a chave, nunca o valor. */
export function eventoDeArmazenamentoInvalido(chave: string): ClientEvent {
  return { event: EVENTO.storageInvalid, outcome: OUTCOME.rejected, attrs: { key: chave, action: 'reset_to_default' } }
}

/** Erro não tratado do navegador. Nome e mensagem sanitizados (sem URL, sem sequências longas de dígitos). */
export function eventoDeErro(origem: OrigemErro, erro: unknown): ClientEvent {
  const e = erro instanceof Error ? erro : null
  return {
    event: EVENTO.appError,
    outcome: OUTCOME.error,
    attrs: {
      kind: origem,
      'error.name': sanitizeTelemetryText(e?.name ?? 'desconhecido', 60),
      'error.message': sanitizeTelemetryText(e?.message ?? String(erro), 200),
    },
  }
}
