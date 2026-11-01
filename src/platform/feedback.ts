import { getAudioContext, getFeedbackBus } from './audio'
import type { Cue, FeedbackPort } from '../application/ports'

interface Tone { f: number; at: number; dur: number; type?: OscillatorType; gain?: number }

const CUES: Record<Cue, Tone[]> = {
  correct: [{ f: 1318.5, at: 0, dur: 0.09, type: 'triangle' }, { f: 1760, at: 0.06, dur: 0.12, type: 'triangle' }],
  wrong: [{ f: 196, at: 0, dur: 0.18, type: 'sine', gain: 0.8 }],
  timeout: [{ f: 294, at: 0, dur: 0.16, type: 'sine', gain: 0.6 }],
  star: [{ f: 659.3, at: 0, dur: 0.14, type: 'triangle' }],
  tick: [{ f: 880, at: 0, dur: 0.05, type: 'square', gain: 0.35 }],
  go: [{ f: 1318.5, at: 0, dur: 0.2, type: 'square', gain: 0.4 }],
  milestone: [{ f: 988, at: 0, dur: 0.08, type: 'triangle' }, { f: 1319, at: 0.07, dur: 0.08, type: 'triangle' }, { f: 1568, at: 0.14, dur: 0.12, type: 'triangle' }],
}

/** Sons curtos de jogo (≤ 300 ms), com volume próprio. Só tocam depois do primeiro gesto. */
export class WebFeedback implements FeedbackPort {
  private enabled = true
  setEnabled(on: boolean): void {
    this.enabled = on
  }
  cue(kind: Cue, step = 0): void {
    if (!this.enabled) return
    const ctx = getAudioContext()
    if (ctx.state !== 'running') {
      // Safari pode interromper o contexto (ligação, troca de aba): tenta retomar para o próximo cue.
      void ctx.resume().catch(() => {})
      return
    }
    const t0 = ctx.currentTime
    for (const tone of CUES[kind]) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = tone.type ?? 'sine'
      // `star` sobe um grau a cada estrela.
      osc.frequency.value = tone.f * (kind === 'star' ? Math.pow(2, (step * 4) / 12) : 1)
      const peak = 0.12 * (tone.gain ?? 1)
      g.gain.setValueAtTime(0, t0 + tone.at)
      g.gain.linearRampToValueAtTime(peak, t0 + tone.at + 0.005)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.at + tone.dur)
      osc.connect(g).connect(getFeedbackBus())
      osc.start(t0 + tone.at)
      osc.stop(t0 + tone.at + tone.dur + 0.02)
    }
  }
}
