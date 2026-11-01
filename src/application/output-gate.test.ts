import { describe, expect, it } from 'vitest'
import type { MicFrame } from '@keyz/shared'
import { InputHub } from './input-hub'
import { MicController } from './mic-controller'
import { OutputGate } from './output-gate'
import { gateFeedback, gatePiano } from './gated-ports'
import { FakeTime, fakeServices } from './test-kit'

const frame = (over: Partial<MicFrame>): MicFrame => ({
  level: 0.05, peak: 0.2, reading: null, stable: null, spectrumNotes: [], chord: null, attack: false, calibration: null, ...over,
})

function setup() {
  const time = new FakeTime()
  const hub = new InputHub(time.clock)
  const gate = new OutputGate(time.clock)
  let cb: ((f: MicFrame) => void) | null = null
  const mic = {
    supported: true,
    start: async () => ({ ok: true as const, deviceName: 'Mic' }),
    stop: () => {},
    onFrame: (fn: (f: MicFrame) => void) => ((cb = fn), () => {}),
    setSensitivity: () => {},
    recalibrate: () => {},
  }
  const ctrl = new MicController(hub, mic, time.clock, time, gate)
  return { time, hub, gate, ctrl, send: (x: MicFrame) => cb!(x) }
}

describe('portão de saída: o microfone não ouve o próprio app', () => {
  it('um cue de feedback fecha o portão por um instante; o microfone volta depois', async () => {
    const s = setup()
    await s.ctrl.setEnabled(true)
    const { services, log } = fakeServices(s.time)
    const feedback = gateFeedback(services.feedback, s.gate)
    feedback.cue('correct')
    expect(log).toContain('cue:correct')
    s.send(frame({ stable: { note: 64, cents: 0, frequency: 330 } }))
    expect(s.hub.activeNotes).toEqual([]) // som do app: nada de nota
    s.time.advance(1000)
    s.send(frame({ stable: { note: 64, cents: 0, frequency: 330 } }))
    expect(s.hub.activeNotes).toEqual([64])
  })

  it('o laço do tutorial: o acorde que o app toca não conta como o acorde do aluno', async () => {
    const s = setup()
    await s.ctrl.setEnabled(true)
    const { services } = fakeServices(s.time)
    const piano = gatePiano(services.piano, s.gate)
    piano.chord([60, 64, 67])
    s.send(frame({ chord: [0, 4, 7] }))
    expect(s.hub.activeNotes).toEqual([])
    s.time.advance(1500)
    s.send(frame({ chord: [0, 4, 7] }))
    expect(s.hub.activeNotes).toEqual([60, 64, 67])
  })

  it('nota do app presa (piano) silencia o microfone até soltar, mais a cauda', async () => {
    const s = setup()
    await s.ctrl.setEnabled(true)
    const piano = gatePiano(fakeServices(s.time).services.piano, s.gate)
    piano.noteOn(60)
    s.send(frame({ stable: { note: 64, cents: 0, frequency: 330 } }))
    expect(s.hub.activeNotes).toEqual([])
    piano.noteOff(60)
    s.time.advance(300) // ainda na cauda de 600 ms
    s.send(frame({ stable: { note: 64, cents: 0, frequency: 330 } }))
    expect(s.hub.activeNotes).toEqual([])
    s.time.advance(700)
    s.send(frame({ stable: { note: 64, cents: 0, frequency: 330 } }))
    expect(s.hub.activeNotes).toEqual([64])
  })

  it('nota presa sem noteOff não silencia o microfone para sempre', () => {
    const s = setup()
    s.gate.noteOn(60)
    expect(s.gate.busy).toBe(true)
    s.time.advance(10_500)
    expect(s.gate.busy).toBe(false)
  })

  it('sem portão (testes e uso sem saída de áudio), o comportamento é o de antes', async () => {
    const time = new FakeTime()
    const hub = new InputHub(time.clock)
    let cb: ((f: MicFrame) => void) | null = null
    const mic = {
      supported: true,
      start: async () => ({ ok: true as const, deviceName: 'Mic' }),
      stop: () => {},
      onFrame: (fn: (f: MicFrame) => void) => ((cb = fn), () => {}),
      setSensitivity: () => {},
      recalibrate: () => {},
    }
    const ctrl = new MicController(hub, mic, time.clock, time)
    await ctrl.setEnabled(true)
    cb!(frame({ stable: { note: 64, cents: 0, frequency: 330 } }))
    expect(hub.activeNotes).toEqual([64])
  })
})
