import { type PitchClass, pitchClass } from '../music/pitch-class'
import { ChromaAnalyzer } from './chroma'
import { PitchDetector, type PitchReading, readingNote } from './pitch-detector'
import { type DetectedNote, NoteStabilizer, PitchClassSetStabilizer, RingFilter } from './stabilizers'

export interface MicFrame {
  /** Volume do quadro (RMS, 0...1). */
  level: number
  /** Maior amostra do quadro; zero absoluto indica áudio bloqueado pelo sistema. */
  peak: number
  reading: PitchReading | null
  /** Nota confirmada pelo estabilizador. */
  stable: DetectedNote | null
  /** Classes de nota vistas no espectro neste quadro (sem confirmação). */
  spectrumNotes: PitchClass[]
  /** Duas ou mais notas confirmadas em vários quadros: um acorde. */
  chord: PitchClass[] | null
  /** Houve um novo ataque (tecla tocada de novo). */
  attack: boolean
}

/** Sensibilidade 0 → piso de 12× o ruído; 1 → 4× (`12 - 8 * s`). */
export const snrForSensitivity = (sensitivity: number): number => 12 - 8 * Math.min(Math.max(sensitivity, 0), 1)

/** Uma análise a cada 10 ms de áudio novo. */
export const HOP_SECONDS = 0.01
const MIN_FRAMES_BETWEEN_ATTACKS = 8

/**
 * Caminho do microfone (porta do `MicrophoneInput.swift`): junta blocos de áudio em janelas,
 * analisa a cada 10 ms e estabiliza. Puro: roda no Web Worker e nos testes.
 */
export class MicPipeline {
  private readonly detector: PitchDetector
  private readonly chroma: ChromaAnalyzer
  private readonly windowSize: number
  private readonly hopSize: number
  private readonly samples: Float32Array
  private filled = 0
  private newSamples = 0
  private readonly stabilizer = new NoteStabilizer(3)
  private readonly chordStabilizer = new PitchClassSetStabilizer(5)
  private readonly ringFilter = new RingFilter()
  private envelope = 0
  private framesSinceAttack = Number.MAX_SAFE_INTEGER
  private calibrationFrames = 0

  constructor(
    readonly sampleRate: number,
    sensitivity = 0.5,
  ) {
    this.detector = new PitchDetector({ sampleRate, minFrequency: 27.5 })
    this.chroma = new ChromaAnalyzer({ sampleRate, snr: snrForSensitivity(sensitivity) })
    this.windowSize = Math.max(this.detector.recommendedBufferSize, this.chroma.size)
    this.hopSize = Math.floor(sampleRate * HOP_SECONDS)
    this.samples = new Float32Array(this.windowSize)
  }

  setSensitivity(value: number): void {
    this.chroma.snr = snrForSensitivity(value)
  }

  /** Aprende o ruído de fundo de novo (~1,5 s de silêncio). */
  recalibrate(): void {
    this.chroma.resetNoiseFloor()
    this.calibrationFrames = 150
  }

  reset(): void {
    this.filled = 0
    this.newSamples = 0
    this.stabilizer.reset()
    this.chordStabilizer.reset()
    this.ringFilter.reset()
    this.envelope = 0
    this.framesSinceAttack = Number.MAX_SAFE_INTEGER
  }

  /** Recebe um bloco de áudio. Devolve um quadro a cada `hopSize` amostras novas (o último, se houver vários). */
  push(chunk: Float32Array): MicFrame | null {
    const n = chunk.length
    if (n >= this.windowSize) {
      this.samples.set(chunk.subarray(n - this.windowSize))
      this.filled = this.windowSize
    } else {
      this.samples.copyWithin(0, n)
      this.samples.set(chunk, this.windowSize - n)
      this.filled = Math.min(this.windowSize, this.filled + n)
    }
    this.newSamples += n
    if (this.filled < this.windowSize || this.newSamples < this.hopSize) return null
    const recentCount = Math.min(this.newSamples, this.windowSize)
    this.newSamples = 0
    return this.process(recentCount)
  }

  private process(recentCount: number): MicFrame {
    const samples = this.samples
    const recent = samples.subarray(this.windowSize - recentCount)
    let sq = 0
    let peak = 0
    for (let i = 0; i < recent.length; i++) {
      sq += recent[i] * recent[i]
      peak = Math.max(peak, Math.abs(recent[i]))
    }
    const level = Math.sqrt(sq / Math.max(recent.length, 1))

    // Volume bem acima do envelope recente = nova tecla, mesmo com a anterior ainda soando.
    this.framesSinceAttack = this.framesSinceAttack === Number.MAX_SAFE_INTEGER ? this.framesSinceAttack : this.framesSinceAttack + 1
    const attack = level > 0.01 && level > this.envelope * 1.5 && this.framesSinceAttack >= MIN_FRAMES_BETWEEN_ATTACKS
    this.envelope = Math.max(level, this.envelope * 0.9)
    if (attack) {
      this.framesSinceAttack = 0
      this.stabilizer.reset()
      this.chordStabilizer.reset()
    }

    // O YIN usa só o trecho final; a análise de espectro usa a janela maior.
    const reading = this.detector.detect(samples.subarray(this.windowSize - this.detector.recommendedBufferSize))
    const calibrating = this.calibrationFrames > 0
    if (calibrating) this.calibrationFrames -= 1
    const spectrum = this.ringFilter.filter(this.chroma.analyze(samples), attack)
    const nearest = reading ? readingNote(reading) : null
    const ringingPitch = nearest ? this.ringFilter.ring.has(pitchClass(nearest.note)) : false
    const stable = calibrating ? null : this.stabilizer.feed(ringingPitch ? null : reading)
    const confirmed = calibrating ? null : this.chordStabilizer.feed(spectrum)
    const chord = confirmed && confirmed.size >= 2 ? [...confirmed].sort((a, b) => a - b) : null

    return {
      level,
      peak,
      reading,
      stable,
      spectrumNotes: calibrating || !spectrum ? [] : [...spectrum.pitchClasses].sort((a, b) => a - b),
      chord,
      attack,
    }
  }
}
