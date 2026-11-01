import { type Note } from '../music/note'
import { type PitchClass } from '../music/pitch-class'
import { setEquals } from '../music/chord'
import { type PitchReading, readingNote } from './pitch-detector'

export interface DetectedNote {
  note: Note
  /** Desvio da afinação em cents (-50...50). */
  cents: number
  frequency: number
}

/**
 * Transforma leituras instáveis de altura (uma por quadro) em notas confiáveis:
 * uma nota só é reportada depois de aparecer em `requiredFrames` quadros seguidos.
 */
export class NoteStabilizer {
  private candidate: Note | null = null
  private count = 0

  constructor(
    public requiredFrames = 3,
    public minConfidence = 0.75,
  ) {}

  feed(reading: PitchReading | null): DetectedNote | null {
    const nearest = reading && reading.confidence >= this.minConfidence ? readingNote(reading) : null
    if (!reading || !nearest) {
      this.reset()
      return null
    }
    if (nearest.note === this.candidate) this.count += 1
    else {
      this.candidate = nearest.note
      this.count = 1
    }
    if (this.count < this.requiredFrames) return null
    return { note: nearest.note, cents: nearest.cents, frequency: reading.frequency }
  }

  reset(): void {
    this.candidate = null
    this.count = 0
  }
}

export interface ChromaReading {
  /** Energia de cada classe de nota (índice 0 = Dó), normalizada para o máximo = 1. */
  chroma: number[]
  /** Classes de nota fortes o bastante para contar como tocadas. */
  pitchClasses: Set<PitchClass>
  /** Energia bruta de cada classe, antes de normalizar. */
  energy: number[]
}

/** Confirma um conjunto de notas quando ele domina uma janela curta de quadros. */
export class PitchClassSetStabilizer {
  private recent: (Set<PitchClass> | null)[] = []

  constructor(
    public requiredFrames = 3,
    public windowFrames = 8,
  ) {}

  feed(reading: Pick<ChromaReading, 'pitchClasses'> | null): Set<PitchClass> | null {
    const notes = reading && reading.pitchClasses.size > 0 ? reading.pitchClasses : null
    this.recent.push(notes)
    if (this.recent.length > this.windowFrames) this.recent.splice(0, this.recent.length - this.windowFrames)
    const votes: { set: Set<PitchClass>; count: number }[] = []
    for (const set of this.recent) {
      if (!set) continue
      const entry = votes.find((v) => setEquals(v.set, set))
      if (entry) entry.count += 1
      else votes.push({ set, count: 1 })
    }
    let best: { set: Set<PitchClass>; count: number } | undefined
    for (const v of votes) if (!best || v.count > best.count) best = v
    return best && best.count >= this.requiredFrames ? best.set : null
  }

  reset(): void {
    this.recent = []
  }
}

/**
 * Separa a nota nova da nota que ainda soa. Na troca, a janela de análise ainda contém o som da
 * anterior por ~170 ms; as classes que já soavam viram "resíduo" no ataque, a menos que a energia
 * delas suba de novo (o mesmo som batido outra vez).
 */
export class RingFilter {
  ring = new Set<PitchClass>()
  private soundingBefore = new Set<PitchClass>()
  private energyBefore: number[] = new Array(12).fill(0)

  constructor(public riseRatio = 1.05) {}

  filter(reading: ChromaReading | null, attack: boolean): ChromaReading | null {
    if (!reading || reading.energy.length !== 12) {
      this.reset()
      return reading
    }
    if (attack) this.ring = new Set(this.soundingBefore)
    for (const pc of [...this.ring]) {
      if (reading.energy[pc] > this.energyBefore[pc] * this.riseRatio) this.ring.delete(pc)
    }
    const kept = new Set([...reading.pitchClasses].filter((p) => !this.ring.has(p)))
    this.soundingBefore = reading.pitchClasses
    this.energyBefore = reading.energy
    return { chroma: reading.chroma, pitchClasses: kept, energy: reading.energy }
  }

  reset(): void {
    this.ring = new Set()
    this.soundingBefore = new Set()
    this.energyBefore = new Array(12).fill(0)
  }
}
