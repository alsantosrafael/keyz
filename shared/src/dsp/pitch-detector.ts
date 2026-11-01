import { type Note, nearestNote } from '../music/note'

export interface PitchReading {
  frequency: number
  /** 0...1; quanto maior, mais periódico (limpo) o sinal. */
  confidence: number
}

export const readingNote = (r: PitchReading): { note: Note; cents: number } | null => nearestNote(r.frequency)

export interface PitchDetectorOptions {
  sampleRate: number
  minFrequency?: number
  maxFrequency?: number
  /** Limiar do YIN: menor = mais rígido. */
  threshold?: number
  /** Abaixo deste RMS o sinal é tratado como silêncio. */
  silenceRMS?: number
}

/** Detector de altura monofônico (algoritmo YIN). Serve para uma nota por vez. */
export class PitchDetector {
  readonly sampleRate: number
  readonly minFrequency: number
  readonly maxFrequency: number
  readonly threshold: number
  readonly silenceRMS: number

  constructor(o: PitchDetectorOptions) {
    this.sampleRate = o.sampleRate
    this.minFrequency = o.minFrequency ?? 27.5
    this.maxFrequency = o.maxFrequency ?? 4200
    this.threshold = o.threshold ?? 0.15
    this.silenceRMS = o.silenceRMS ?? 0.002
  }

  /** Menor quantidade de amostras para enxergar `minFrequency`: dois períodos. */
  get recommendedBufferSize(): number {
    return Math.ceil((2 * this.sampleRate) / this.minFrequency)
  }

  detect(samples: ArrayLike<number>): PitchReading | null {
    const n = samples.length
    const window = Math.floor(n / 2)
    const tauMin = Math.max(2, Math.floor(this.sampleRate / this.maxFrequency))
    const tauMax = Math.min(window - 1, Math.floor(this.sampleRate / this.minFrequency))
    if (!(tauMax > tauMin)) return null

    let energy = 0
    for (let i = 0; i < n; i++) energy += samples[i] * samples[i]
    if (Math.sqrt(energy / n) < this.silenceRMS) return null

    // Função de diferença e média cumulativa normalizada.
    const normalized = new Float64Array(tauMax + 1).fill(1)
    let fixedEnergy = 0
    for (let j = 0; j < window; j++) fixedEnergy += samples[j] * samples[j]
    let shiftedEnergy = fixedEnergy
    let runningSum = 0
    for (let tau = 1; tau <= tauMax; tau++) {
      const leaving = samples[tau - 1]
      const entering = samples[tau + window - 1]
      shiftedEnergy += entering * entering - leaving * leaving
      let cross = 0
      for (let j = 0; j < window; j++) cross += samples[j] * samples[j + tau]
      const difference = Math.max(0, fixedEnergy + shiftedEnergy - 2 * cross)
      runningSum += difference
      normalized[tau] = runningSum > 0 ? (difference * tau) / runningSum : 1
    }

    // Primeiro vale abaixo do limiar; se não houver, usa o mínimo global.
    let chosen: number | null = null
    let tau = tauMin
    while (tau <= tauMax) {
      if (normalized[tau] < this.threshold) {
        while (tau + 1 <= tauMax && normalized[tau + 1] < normalized[tau]) tau++
        chosen = tau
        break
      }
      tau++
    }
    if (chosen === null) {
      let best = tauMin
      for (let t = tauMin; t <= tauMax; t++) if (normalized[t] < normalized[best]) best = t
      if (normalized[best] < 0.35) {
        // O mínimo global costuma cair num múltiplo do período (uma oitava abaixo):
        // usa o primeiro vale quase tão fundo quanto ele.
        const limit = normalized[best] + 0.1
        chosen = best
        for (let t = tauMin; t <= best; t++) {
          if (normalized[t] > limit) continue
          const before = normalized[t - 1]
          const after = t < tauMax ? normalized[t + 1] : Infinity
          if (normalized[t] <= before && normalized[t] <= after) {
            chosen = t
            break
          }
        }
      }
    }
    if (chosen === null) return null
    const period = chosen

    // Interpolação parabólica para precisão sub-amostra.
    let refined = period
    if (period > 1 && period < tauMax) {
      const a = normalized[period - 1]
      const b = normalized[period]
      const c = normalized[period + 1]
      const denominator = a - 2 * b + c
      if (denominator !== 0) refined += (a - c) / (2 * denominator)
    }
    if (!(refined > 0)) return null
    return { frequency: this.sampleRate / refined, confidence: Math.max(0, Math.min(1, 1 - normalized[period])) }
  }
}
