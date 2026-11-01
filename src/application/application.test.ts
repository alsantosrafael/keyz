import { describe, expect, it } from 'vitest'
import type { MicFrame } from '@keyz/shared'
import { ChordSession } from './chord-session'
import { DrillSession } from './drill-session'
import { FreeSession } from './free-session'
import { InputHub, computerKeyLabel, computerKeyOffset } from './input-hub'
import { MicController } from './mic-controller'
import { fakeServices } from './test-kit'

describe('InputHub', () => {
  it('a nota só solta quando todas as fontes soltam', () => {
    const hub = new InputHub(() => 0)
    const events: string[] = []
    hub.events.subscribe((e) => events.push(`${e.type}:${e.note}`))
    hub.press(60, 'screen')
    hub.press(60, 'midi')
    hub.release(60, 'screen')
    expect(hub.isActive(60)).toBe(true)
    hub.release(60, 'midi')
    expect(hub.activeNotes).toEqual([])
    expect(events).toEqual(['on:60', 'on:60', 'off:60'])
  })
  it('latch: um toque liga, outro desliga', () => {
    const hub = new InputHub()
    hub.latch = true
    hub.tap(64, 'screen', true)
    hub.tap(64, 'screen', false)
    expect(hub.isActive(64)).toBe(true)
    hub.tap(64, 'screen', true)
    expect(hub.isActive(64)).toBe(false)
  })
  it('mapa do teclado do computador', () => {
    expect(computerKeyOffset('KeyA')).toBe(0)
    expect(computerKeyOffset('KeyW')).toBe(1)
    expect(computerKeyOffset('KeyL')).toBe(14)
    expect(computerKeyOffset('KeyQ')).toBeNull()
    expect(computerKeyLabel(0)).toBe('A')
    expect(computerKeyLabel(1)).toBe('W')
  })
})

describe('FreeSession', () => {
  it('mantém a última nota após soltar e reconhece acorde', () => {
    const hub = new InputHub(() => 0)
    const free = new FreeSession(hub, () => 0)
    hub.press(60, 'screen')
    expect(free.snapshot.shown).toMatchObject({ kind: 'note', name: 'Dó', octave: '4' })
    hub.release(60, 'screen')
    expect(free.snapshot.shown).toMatchObject({ kind: 'note', name: 'Dó' })
    expect(free.snapshot.held).toBe(true)
    hub.press(60, 'screen'); hub.press(64, 'screen'); hub.press(67, 'screen')
    expect(free.snapshot.shown).toMatchObject({ kind: 'chord', name: 'C maior', inversion: 'posição fundamental' })
    expect(free.snapshot.history.length).toBe(2)
    hub.releaseAll()
    free.clear()
    expect(free.snapshot.shown).toBeNull()
  })
  it('notas sem acorde reconhecido aparecem em ordem, sem erro', () => {
    const hub = new InputHub(() => 0)
    const free = new FreeSession(hub, () => 0)
    hub.press(60, 'screen'); hub.press(61, 'screen')
    expect(free.snapshot.shown).toMatchObject({ kind: 'notes' })
  })
})

describe('ChordSession', () => {
  it('acorde correto fecha o anel, soa e avança sozinho', () => {
    const { services, time, log } = fakeServices()
    const hub = new InputHub(time.clock)
    const session = new ChordSession(hub, services)
    const chord = session.snapshot.chord!
    const midis = session.chordMidis(chord)
    midis.forEach((m) => hub.press(m, 'screen'))
    expect(session.snapshot.matched).toBe(3)
    expect(session.snapshot.state).toBe('awaiting')
    time.advance(400)
    expect(session.snapshot.state).toBe('correct')
    expect(log).toContain('cue:correct')
    expect(session.snapshot.correct).toBe(1)
    hub.releaseAll()
    time.advance(1300)
    expect(session.snapshot.round).toBe(2)
    expect(session.snapshot.state).toBe('awaiting')
  })
  it('acorde errado mostra o que falta e conta só a primeira tentativa', () => {
    const { services, time } = fakeServices()
    const hub = new InputHub(time.clock)
    const session = new ChordSession(hub, services)
    const midis = session.chordMidis(session.snapshot.chord!)
    hub.press(midis[0], 'screen'); hub.press(midis[1], 'screen'); hub.press(midis[2] + 1, 'screen')
    time.advance(400)
    expect(session.snapshot.state).toBe('wrong')
    expect(session.snapshot.evaluation!.missing.size).toBe(1)
    expect(session.snapshot.attempts).toBe(1)
    expect(session.snapshot.correct).toBe(0)
  })
  it('depois de 10 rodadas termina com resumo', () => {
    const { services, time } = fakeServices()
    const hub = new InputHub(time.clock)
    const session = new ChordSession(hub, services)
    for (let i = 0; i < 10; i++) {
      session.chordMidis(session.snapshot.chord!).forEach((m) => hub.press(m, 'screen'))
      time.advance(400)
      hub.releaseAll()
      time.advance(1300)
    }
    expect(session.snapshot.finished).toBe(true)
    expect(session.snapshot.correct).toBe(10)
    expect(session.snapshot.stars).toBe(3)
  })
})

describe('DrillSession', () => {
  function setup() {
    const f = fakeServices()
    const hub = new InputHub(f.time.clock)
    const session = new DrillSession(hub, f.services)
    return { ...f, hub, session }
  }
  const startRound = (s: ReturnType<typeof setup>) => {
    s.session.play()
    expect(s.session.snapshot.screen).toBe('countdown')
    expect(s.session.snapshot.count).toBe(3)
    s.time.advance(4100)
    expect(s.session.snapshot.screen).toBe('round')
  }

  it('contagem 3-2-1-Já leva à rodada', () => {
    const s = setup()
    s.session.play()
    const seen: (number | null)[] = [s.session.snapshot.count]
    s.session.changes.subscribe((snap) => seen.push(snap.count))
    s.time.advance(4100)
    expect(seen).toContain(2)
    expect(seen).toContain(1)
    expect(seen).toContain(0)
    expect(s.session.snapshot.screen).toBe('round')
    expect(s.session.snapshot.target).not.toBeNull()
  })

  it('acerto: resultado, sequência e avanço automático', () => {
    const s = setup()
    startRound(s)
    const target = s.session.snapshot.target!
    s.time.advance(800)
    s.hub.press(target, 'screen')
    expect(s.session.snapshot.screen).toBe('result')
    expect(s.session.snapshot.result?.outcome.kind).toBe('correct')
    expect(s.session.snapshot.streak).toBe(1)
    expect(s.session.snapshot.reflex).toBe('Rápido')
    expect(s.session.snapshot.announce).toMatch(/^Acertou, .+, 0,[89] segundo$/)
    s.hub.releaseAll()
    s.time.advance(1600)
    expect(s.session.snapshot.screen).toBe('round')
    expect(s.session.snapshot.index).toBe(2)
  })

  it('erro mostra a resposta e fica pelo menos 1,2 s mesmo no automático', () => {
    const s = setup()
    startRound(s)
    const target = s.session.snapshot.target!
    s.hub.press(target === 60 ? 62 : 60, 'screen')
    expect(s.session.snapshot.result?.outcome.kind).toBe('wrong')
    expect(s.session.snapshot.resultText).toMatch(/^Era .+\. Você tocou /)
    s.hub.releaseAll()
    s.time.advance(1100)
    expect(s.session.snapshot.screen).toBe('result')
    s.time.advance(500)
    expect(s.session.snapshot.screen).toBe('round')
  })

  it('pular o resultado avança de imediato', () => {
    const s = setup()
    startRound(s)
    s.hub.press(s.session.snapshot.target! + 1, 'screen')
    s.session.skipResult()
    expect(s.session.snapshot.screen).toBe('round')
  })

  it('tempo esgotado', () => {
    const s = setup()
    startRound(s)
    s.time.advance(10100)
    expect(s.session.snapshot.result?.outcome.kind).toBe('timeout')
    expect(s.session.snapshot.resultText).toMatch(/^Tempo esgotado\. Era /)
  })

  it('pausa congela o tempo e retoma com contagem de 1 s', () => {
    const s = setup()
    startRound(s)
    s.time.advance(2000)
    s.session.pause()
    expect(s.session.snapshot.paused).toBe(true)
    s.time.advance(30000)
    expect(s.session.snapshot.screen).toBe('round')
    s.hub.press(s.session.snapshot.target!, 'screen')
    expect(s.session.snapshot.screen).toBe('round') // ignorado na pausa
    s.session.resume()
    expect(s.session.snapshot.resuming).toBe(true)
    s.time.advance(1100)
    expect(s.session.snapshot.paused).toBe(false)
    expect(s.session.timeLeft()).toBeCloseTo(8, 0)
  })

  it('sessão completa vai ao resumo com estrelas e guarda a melhor marca', () => {
    const s = setup()
    s.session.customize({ rounds: 3 })
    startRound(s)
    for (let i = 0; i < 3; i++) {
      s.time.advance(500)
      s.hub.press(s.session.snapshot.target!, 'screen')
      s.hub.releaseAll()
      s.time.advance(1600)
    }
    expect(s.session.snapshot.screen).toBe('summary')
    expect(s.session.snapshot.summary).toMatchObject({ stars: 3, accuracy: 1, bestStreak: 3, newBest: true })
    expect(s.session.snapshot.best.easy).toEqual({ stars: 3, bestStreak: 3 })
    const again = new DrillSession(s.hub, s.services)
    expect(again.snapshot.best.easy).toEqual({ stars: 3, bestStreak: 3 })
    expect(again.snapshot.config.rounds).toBe(3) // última configuração guardada
  })

  it('treinar notas difíceis usa só as notas que erraram', () => {
    const s = setup()
    s.session.customize({ rounds: 2 })
    startRound(s)
    const missed: number[] = []
    for (let i = 0; i < 2; i++) {
      missed.push(s.session.snapshot.target!)
      s.time.advance(10100)
      s.time.advance(1600)
    }
    expect(s.session.snapshot.screen).toBe('summary')
    s.session.practiceHard()
    s.time.advance(4100)
    expect(missed).toContain(s.session.snapshot.target)
    expect(s.session.snapshot.practiceNotes).not.toBeNull()
  })

  it('"Mais tempo" multiplica o tempo da nota', () => {
    const f = fakeServices()
    const hub = new InputHub(f.time.clock)
    const session = new DrillSession(hub, f.services, () => 1.5)
    session.play()
    f.time.advance(4100)
    expect(session.snapshot.duration).toBe(15)
  })
})

describe('MicController', () => {
  const frame = (over: Partial<MicFrame>): MicFrame => ({
    level: 0.05, peak: 0.2, reading: null, stable: null, spectrumNotes: [], chord: null, attack: false, calibration: null, ...over,
  })
  function setup() {
    const f = fakeServices()
    const hub = new InputHub(f.time.clock)
    let cb: ((f: MicFrame) => void) | null = null
    const mic = {
      supported: true,
      start: async () => ({ ok: true as const, deviceName: 'Mic' }),
      stop: () => {},
      onFrame: (fn: (f: MicFrame) => void) => ((cb = fn), () => {}),
      setSensitivity: () => {},
      recalibrate: () => {},
    }
    const ctrl = new MicController(hub, mic, f.time.clock, f.time)
    return { ...f, hub, ctrl, send: (x: MicFrame) => cb!(x) }
  }
  it('nota estável vira tecla e solta após 150 ms sem evidência', async () => {
    const s = setup()
    await s.ctrl.setEnabled(true)
    s.send(frame({ stable: { note: 64, cents: 3, frequency: 330 } }))
    expect(s.hub.activeNotes).toEqual([64])
    expect(s.hub.active.get(64)).toBe('mic')
    s.time.advance(100)
    s.send(frame({}))
    expect(s.hub.activeNotes).toEqual([64])
    s.time.advance(100)
    s.send(frame({}))
    expect(s.hub.activeNotes).toEqual([])
  })
  it('calibração de ruído mostra progresso e resultado', async () => {
    const s = setup()
    await s.ctrl.setEnabled(true)
    expect(s.ctrl.snapshot.calibration).toEqual({ kind: 'idle' })
    s.ctrl.recalibrate()
    expect(s.ctrl.snapshot.calibration).toEqual({ kind: 'running', progress: 0 })
    s.send(frame({ calibration: { progress: 0.5, noiseLevel: 0.003 } }))
    expect(s.ctrl.snapshot.calibration).toEqual({ kind: 'running', progress: 0.5 })
    s.send(frame({ calibration: { progress: 1, noiseLevel: 0.003 } }))
    expect(s.ctrl.snapshot.calibration).toEqual({ kind: 'done', level: 'quiet' })
    s.ctrl.recalibrate()
    s.send(frame({ calibration: { progress: 1, noiseLevel: 0.05 } }))
    expect(s.ctrl.snapshot.calibration).toEqual({ kind: 'done', level: 'loud' })
  })
  it('acorde confirmado vai para a oitava do Dó central', async () => {
    const s = setup()
    await s.ctrl.setEnabled(true)
    s.send(frame({ chord: [0, 4, 7] }))
    expect(s.hub.activeNotes).toEqual([60, 64, 67])
  })
  it('modo sem acordes ignora o conjunto e usa a nota do YIN', async () => {
    const s = setup()
    s.ctrl.chords = false
    await s.ctrl.setEnabled(true)
    s.send(frame({ chord: [0, 4, 7], spectrumNotes: [0, 4, 7], stable: { note: 48, cents: 0, frequency: 130 } }))
    expect(s.hub.activeNotes).toEqual([48])
  })
  it('desligar solta as notas', async () => {
    const s = setup()
    await s.ctrl.setEnabled(true)
    s.send(frame({ stable: { note: 64, cents: 0, frequency: 330 } }))
    await s.ctrl.setEnabled(false)
    expect(s.hub.activeNotes).toEqual([])
    expect(s.ctrl.snapshot.status.kind).toBe('off')
  })
})
