import { nearestNote } from '../music/note'
import { type PitchClass, pitchClass } from '../music/pitch-class'
import { FFT } from './fft'
import { type ChromaReading } from './stabilizers'

export type { ChromaReading }

export interface ChromaOptions {
  sampleRate: number
  size?: number
  minFrequency?: number
  maxFrequency?: number
  peakThreshold?: number
  noteThreshold?: number
  silenceRMS?: number
  snr?: number
}

interface Peak {
  frequency: number
  magnitude: number
  pitchClass: PitchClass
}

/**
 * Detecta várias notas simultâneas (acordes) pelo espectro do áudio.
 *
 * Acha os picos da FFT, converte cada um em nota e descarta os que são harmônicos de uma nota
 * mais grave. A oitava se perde: o resultado é o conjunto de classes de nota.
 */
export class ChromaAnalyzer {
  static readonly maxNotes = 5

  readonly sampleRate: number
  readonly size: number
  minFrequency: number
  maxFrequency: number
  /** Fração do pico mais forte abaixo da qual um pico é ignorado. */
  peakThreshold: number
  /** Fração da classe mais forte a partir da qual uma classe de nota conta como tocada. */
  noteThreshold: number
  silenceRMS: number
  /** Quantas vezes um pico precisa estar acima do ruído de fundo da sua faixa para contar. */
  snr: number

  private readonly fft: FFT
  private readonly window: Float64Array
  private readonly magnitudes: Float64Array
  /** Ruído de fundo por faixa de frequência, aprendido dos quadros em que um pico não se destaca. */
  private noiseFloor: Float64Array
  /** Em calibração o piso é a média simples dos quadros (o usuário está em silêncio). */
  private calibrating = false
  private calibrationCount = 0

  constructor(o: ChromaOptions) {
    this.sampleRate = o.sampleRate
    this.size = o.size ?? 8192
    this.minFrequency = o.minFrequency ?? 60
    this.maxFrequency = o.maxFrequency ?? 2500
    this.peakThreshold = o.peakThreshold ?? 0.05
    this.noteThreshold = o.noteThreshold ?? 0.3
    this.silenceRMS = o.silenceRMS ?? 0.005
    this.snr = o.snr ?? 5
    this.fft = new FFT(this.size)
    this.window = new Float64Array(this.size)
    // Hann (vDSP.hanningDenormalized, janela completa).
    for (let i = 0; i < this.size; i++) this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / this.size))
    this.magnitudes = new Float64Array(this.size / 2)
    this.noiseFloor = new Float64Array(this.size / 2)
  }

  /** Analisa as últimas `size` amostras (amostras a mais no início são ignoradas). */
  analyze(samples: ArrayLike<number>): ChromaReading | null {
    if (samples.length < this.size) return null
    const offset = samples.length - this.size
    const frame = new Float64Array(this.size)
    let sum = 0
    for (let i = 0; i < this.size; i++) {
      const v = samples[offset + i]
      frame[i] = v
      sum += v * v
    }
    // O piso aprende também nos quadros silenciosos: é o que faz o ruído da sala virar referência.
    const magnitudes = this.spectrum(frame)
    this.updateNoiseFloor(magnitudes)
    if (Math.sqrt(sum / this.size) < this.silenceRMS) return null

    const peaks = this.findPeaks(magnitudes)
    if (peaks.length === 0) return null

    let chroma = new Array<number>(12).fill(0)
    peaks.forEach((peak, index) => {
      let weight = peak.magnitude
      // Harmônico de uma nota mais grave com outra classe de nota? Provavelmente não foi tocado.
      for (let l = 0; l < index; l++) {
        const lower = peaks[l]
        if (lower.pitchClass === peak.pitchClass) continue
        const ratio = peak.frequency / lower.frequency
        const harmonic = Math.round(ratio)
        if (harmonic >= 2 && harmonic <= 8 && Math.abs(ratio - harmonic) / harmonic < 0.025) {
          weight *= 0.1
          break
        }
      }
      chroma[peak.pitchClass] += weight
    })

    const strongest = Math.max(...chroma)
    if (!(strongest > 0)) return null
    const raw = chroma
    chroma = chroma.map((c) => c / strongest)
    const notes = new Set<PitchClass>()
    for (let i = 0; i < 12; i++) if (chroma[i] >= this.noteThreshold) notes.add(i)
    // Energia espalhada por muitas classes de nota é ruído, não música.
    if (notes.size > ChromaAnalyzer.maxNotes) return null
    return { chroma, pitchClasses: notes, energy: raw }
  }

  /** Esquece o ruído aprendido; o piso volta a ser aprendido a partir dos próximos quadros. */
  resetNoiseFloor(): void {
    this.noiseFloor.fill(0)
  }

  /**
   * Começa a calibrar: esquece o piso e passa a aprender a média de cada faixa, sem o teto de
   * `snr` do aprendizado lento (que travava o piso em 5% do primeiro quadro).
   */
  beginCalibration(): void {
    this.noiseFloor.fill(0)
    this.calibrationCount = 0
    this.calibrating = true
  }

  /** Volta ao aprendizado lento, partindo do piso calibrado. */
  endCalibration(): void {
    this.calibrating = false
  }

  private spectrum(frame: Float64Array): Float64Array {
    for (let i = 0; i < this.size; i++) frame[i] *= this.window[i]
    this.fft.forward(frame)
    const { re, im } = this.fft
    for (let i = 0; i < this.magnitudes.length; i++) this.magnitudes[i] = Math.hypot(re[i], im[i])
    this.magnitudes[0] = 0
    return this.magnitudes
  }

  /**
   * Média lenta por faixa, atualizada só onde o espectro está perto do piso: uma nota tocada não
   * infla o piso. Sobe devagar para um ruído novo (porta, ventilador) não virar nota para sempre.
   */
  private updateNoiseFloor(magnitudes: Float64Array): void {
    const floor = this.noiseFloor
    if (this.calibrating) {
      this.calibrationCount += 1
      for (let bin = 0; bin < magnitudes.length; bin++) floor[bin] += (magnitudes[bin] - floor[bin]) / this.calibrationCount
      return
    }
    for (let bin = 0; bin < magnitudes.length; bin++) {
      if (floor[bin] === 0 || magnitudes[bin] < floor[bin] * this.snr) floor[bin] = floor[bin] * 0.95 + magnitudes[bin] * 0.05
      else floor[bin] *= 1.002
    }
  }

  private findPeaks(m: Float64Array): Peak[] {
    const binWidth = this.sampleRate / this.size
    const low = Math.max(2, Math.floor(this.minFrequency / binWidth))
    const high = Math.min(m.length - 3, Math.floor(this.maxFrequency / binWidth))
    if (!(high > low)) return []
    let strongest = 0
    for (let b = low; b <= high; b++) if (m[b] > strongest) strongest = m[b]
    if (!(strongest > 0)) return []
    const floor = strongest * this.peakThreshold

    const peaks: Peak[] = []
    for (let bin = low; bin <= high; bin++) {
      const value = m[bin]
      if (
        value < floor || value < this.noiseFloor[bin] * this.snr ||
        !(value > m[bin - 1]) || !(value >= m[bin + 1]) || !(value > m[bin - 2]) || !(value >= m[bin + 2])
      ) continue
      // Interpolação parabólica (em log) para a frequência exata do pico.
      const a = Math.log(Math.max(m[bin - 1], 1e-12))
      const b = Math.log(value)
      const c = Math.log(Math.max(m[bin + 1], 1e-12))
      const denominator = a - 2 * b + c
      const offset = denominator === 0 ? 0 : (0.5 * (a - c)) / denominator
      const frequency = (bin + offset) * binWidth
      const nearest = nearestNote(frequency)
      if (!nearest || Math.abs(nearest.cents) > 40) continue
      peaks.push({ frequency, magnitude: value, pitchClass: pitchClass(nearest.note) })
    }
    return peaks
  }
}
