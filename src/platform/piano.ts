import { getAudioContext, getPianoBus, resumeAudio } from './audio'
import { noteFrequency } from '@keyz/shared'
import type { PianoPort } from '../application/ports'

interface Voice {
  gain: GainNode
  oscs: OscillatorNode[]
  stopTimer: number | undefined
}

const PARTIALS = [1, 0.55, 0.32, 0.2, 0.12, 0.07]
const MAX_VOICES = 24

/** Piano sintetizado (aditivo com decaimento). O som por samples (smplr) fica como evolução (ver SPEC). */
export class SynthPiano implements PianoPort {
  private voices = new Map<number, Voice>()
  private volume = 0.8
  private enabled = true

  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) for (const n of [...this.voices.keys()]) this.noteOff(n)
  }
  setVolume(v: number): void {
    this.volume = v
  }
  resume(): Promise<void> {
    return resumeAudio()
  }

  noteOn(midi: number, velocity = 0.8): void {
    if (!this.enabled) return
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    this.stop(midi, 0.02)
    if (this.voices.size >= MAX_VOICES) this.stop(this.voices.keys().next().value as number, 0.05)
    const f0 = noteFrequency(midi)
    const t = ctx.currentTime
    const peak = Math.min(1, velocity) * this.volume * 0.22
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.006)
    // Graves decaem mais devagar que agudos.
    const decay = Math.max(0.6, 3.2 - (midi - 36) * 0.03)
    gain.gain.setTargetAtTime(peak * 0.35, t + 0.006, 0.18)
    gain.gain.setTargetAtTime(0.0001, t + 0.35, decay / 2.4)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = Math.min(9000, f0 * 9)
    gain.connect(filter).connect(getPianoBus())
    const oscs = PARTIALS.map((amp, i) => {
      const n = i + 1
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = f0 * n * Math.sqrt(1 + 0.0004 * n * n)
      const g = ctx.createGain()
      g.gain.value = amp
      osc.connect(g).connect(gain)
      osc.start(t)
      return osc
    })
    this.voices.set(midi, { gain, oscs, stopTimer: undefined })
  }

  noteOff(midi: number): void {
    this.stop(midi, 0.22)
  }

  chord(midis: number[]): void {
    midis.forEach((m, i) => window.setTimeout(() => this.noteOn(m, 0.7), i * 18))
    window.setTimeout(() => midis.forEach((m) => this.noteOff(m)), 900)
  }

  private stop(midi: number, release: number): void {
    const v = this.voices.get(midi)
    if (!v) return
    this.voices.delete(midi)
    const ctx = getAudioContext()
    const t = ctx.currentTime
    v.gain.gain.cancelScheduledValues(t)
    v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), t)
    v.gain.gain.exponentialRampToValueAtTime(0.0001, t + release)
    for (const o of v.oscs) o.stop(t + release + 0.02)
  }
}
