import { describe, expect, it } from 'vitest'
import type { MicFrame } from '@keyz/shared'
import { InputHub } from './input-hub'
import { MicController } from './mic-controller'
import { FakeTime } from './test-kit'
import type { MicStartResult, MicrophonePort } from './ports'

/** Microfone falso cujo `start` só termina quando o teste manda. */
function fakeMic() {
  const pending: Array<(r: MicStartResult) => void> = []
  let lost: (() => void) | null = null
  let frame: ((f: MicFrame) => void) | null = null
  const port = {
    supported: true,
    start: () => new Promise<MicStartResult>((resolve) => pending.push(resolve)),
    stop: () => {},
    onFrame: (fn: (f: MicFrame) => void) => ((frame = fn), () => {}),
    onLost: (fn: () => void) => ((lost = fn), () => {}),
    setSensitivity: () => {},
    recalibrate: () => {},
  } satisfies MicrophonePort
  return { port, pending, lost: () => lost?.(), frame: () => frame }
}

const ok = { ok: true as const, deviceName: 'Mic' }

describe('ciclo de vida do microfone', () => {
  it('desligar enquanto a permissão está pendente deixa o microfone desligado', async () => {
    const time = new FakeTime()
    const m = fakeMic()
    const ctrl = new MicController(new InputHub(time.clock), m.port, time.clock, time)
    const on = ctrl.setEnabled(true)
    await ctrl.setEnabled(false)
    m.pending[0](ok) // a permissão chega depois do "desligar"
    await on
    expect(ctrl.isEnabled).toBe(false)
    expect(ctrl.snapshot.status.kind).toBe('off')
  })

  it('ligar duas vezes não ouve duas vezes (uma só assinatura de quadros)', async () => {
    const time = new FakeTime()
    const hub = new InputHub(time.clock)
    const m = fakeMic()
    const ctrl = new MicController(hub, m.port, time.clock, time)
    const first = ctrl.setEnabled(true)
    const second = ctrl.setEnabled(true)
    m.pending[0](ok)
    m.pending[1](ok)
    await Promise.all([first, second])
    m.frame()?.({ level: 0.05, peak: 0.2, reading: null, stable: { note: 64, cents: 0, frequency: 330 }, spectrumNotes: [], chord: null, attack: false })
    // Uma única nota: nada de duplicata na tecla.
    expect(hub.activeNotes).toEqual([64])
  })

  it('dispositivo removido vira "no-device" e solta as notas', async () => {
    const time = new FakeTime()
    const m = fakeMic()
    const ctrl = new MicController(new InputHub(time.clock), m.port, time.clock, time)
    const on = ctrl.setEnabled(true)
    m.pending[0](ok)
    await on
    m.lost()
    expect(ctrl.snapshot.status).toEqual({ kind: 'no-device' })
    expect(ctrl.isEnabled).toBe(false)
  })
})
