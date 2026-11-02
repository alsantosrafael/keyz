import { describe, expect, it } from 'vitest'
import type { TelemetrySink } from './ports'
import type { ClientEvent } from '@keyz/shared'
import { ClientTelemetry, MAX_ENVIOS_POR_SESSAO, SemTelemetria, eventoDeArmazenamentoInvalido, eventoDeEntrada, eventoDeErro } from './telemetry'

/** Espera as promessas pendentes (o envio é assíncrono). */
const turno = () => new Promise((r) => setTimeout(r, 0))

function montar(sink?: TelemetrySink) {
  const envios: Array<{ event: string; outcome: string; attrs: Record<string, any> }> = []
  const padrao: TelemetrySink = {
    send: async (corpo) => {
      envios.push(JSON.parse(corpo))
    },
  }
  const telemetria = new ClientTelemetry({ sink: sink ?? padrao, version: '0.4.0' })
  return { telemetria, envios }
}

const erro = (n: number): ClientEvent => ({ event: 'app.error', outcome: 'error', attrs: { kind: 'render', 'error.name': `E${n}` } })

describe('ClientTelemetry', () => {
  it('envia o evento com a versão em attrs, no formato { event, outcome, attrs }', async () => {
    const { telemetria, envios } = montar()
    telemetria.record(erro(1))
    await turno()
    expect(envios).toEqual([{ event: 'app.error', outcome: 'error', attrs: { kind: 'render', 'error.name': 'E1', version: '0.4.0' } }])
  })

  it(`teto de ${MAX_ENVIOS_POR_SESSAO} envios por sessão`, async () => {
    const { telemetria, envios } = montar()
    for (let i = 0; i < MAX_ENVIOS_POR_SESSAO + 3; i++) telemetria.record(erro(i))
    await turno()
    expect(envios).toHaveLength(MAX_ENVIOS_POR_SESSAO)
  })

  it('record não lança nem quando o sink falha de forma síncrona ou rejeita', async () => {
    const lancaSincrono: TelemetrySink = { send: () => { throw new Error('boom') } }
    const rejeita: TelemetrySink = { send: () => Promise.reject(new Error('rede')) }
    expect(() => montar(lancaSincrono).telemetria.record(erro(1))).not.toThrow()
    expect(() => montar(rejeita).telemetria.record(erro(1))).not.toThrow()
    await turno()
  })

  it('SemTelemetria (GPC/DNT) aceita o registro e não faz nada', () => {
    expect(() => new SemTelemetria().record(erro(1))).not.toThrow()
  })
})

describe('eventos construídos a partir de erros e falhas', () => {
  it('eventoDeErro não contém URL nem sequências longas de dígitos na mensagem', () => {
    const e = new Error('falhou em https://x.test/?token=abc com id 12345678')
    const ev = eventoDeErro('window_error', e)
    expect(ev.attrs['error.message']).toBe('falhou em [url] com id [n]')
    expect(JSON.stringify(ev)).not.toContain('token=abc')
  })

  it('eventoDeErro não tem fingerprint nem stack', () => {
    const e = new TypeError('x')
    e.stack = 'TypeError: x\n    at foo (https://keyz.test/assets/index-abc.js:10:5)'
    const ev = eventoDeErro('render', e)
    expect(ev).toEqual({ event: 'app.error', outcome: 'error', attrs: { kind: 'render', 'error.name': 'TypeError', 'error.message': 'x' } })
  })

  it('eventoDeErro aceita valores que não são Error', () => {
    expect(eventoDeErro('unhandled_rejection', 'texto solto').attrs['error.message']).toBe('texto solto')
  })

  it('falha de entrada registra fonte, etapa e nome do erro, nunca o nome do dispositivo', () => {
    expect(eventoDeEntrada('midi', 'request', 'NotAllowedError')).toEqual({
      event: 'input.failure',
      outcome: 'error',
      attrs: { source: 'midi', stage: 'request', 'error.name': 'NotAllowedError' },
    })
  })

  it('armazenamento inválido registra a chave, nunca o valor', () => {
    expect(eventoDeArmazenamentoInvalido('keyz.settings')).toEqual({
      event: 'storage.invalid',
      outcome: 'rejected',
      attrs: { key: 'keyz.settings', action: 'reset_to_default' },
    })
  })
})
