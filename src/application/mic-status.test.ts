import { describe, expect, it } from 'vitest'
import { micComFalha, type MicStatus } from './mic-controller'

describe('micComFalha', () => {
  it('considera falha os estados em que o microfone não está disponível', () => {
    for (const kind of ['denied', 'unsupported', 'no-device', 'interrupted', 'failed'] as const) expect(micComFalha(kind)).toBe(true)
  })

  it('não considera falha os estados normais, de bloqueio ou de desligado', () => {
    const normais: MicStatus['kind'][] = ['off', 'starting', 'silence', 'hearing', 'note', 'chord', 'noisy', 'no-audio', 'blocked']
    for (const kind of normais) expect(micComFalha(kind)).toBe(false)
  })
})
