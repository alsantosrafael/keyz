import { CHORD_QUALITIES, type Chord, type ChordQuality, chordEquals, makeChord } from '../music/chord'
import { type Accidental, isBlackKey } from '../music/pitch-class'

export type Random = () => number

export const randomElement = <T>(items: readonly T[], random: Random): T | undefined =>
  items.length === 0 ? undefined : items[Math.min(items.length - 1, Math.floor(random() * items.length))]

export class ChordGenerator {
  private last: Chord | null = null

  constructor(
    public qualities: ChordQuality[] = [...CHORD_QUALITIES],
    private readonly random: Random = Math.random,
  ) {}

  /** Todos os acordes possíveis: 12 raízes, com grafia em sustenido ou bemol nas notas pretas. */
  get pool(): Chord[] {
    const chords: Chord[] = []
    for (let value = 0; value < 12; value++) {
      const accidentals: Accidental[] = isBlackKey(value) ? ['sharp', 'flat'] : ['sharp']
      for (const quality of this.qualities) for (const accidental of accidentals) chords.push(makeChord(value, quality, accidental))
    }
    return chords
  }

  /** Sorteia um acorde, evitando repetir o anterior. */
  next(): Chord | null {
    const candidates = this.pool.filter((c) => !chordEquals(c, this.last))
    const chord = randomElement(candidates, this.random)
    if (!chord) return null
    this.last = chord
    return chord
  }
}
