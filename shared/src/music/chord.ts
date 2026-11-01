import { type Accidental, type PitchClass, pitchClass, pitchClassName, transposed } from './pitch-class'

export type ChordQuality = 'major' | 'minor'
export const CHORD_QUALITIES: readonly ChordQuality[] = ['major', 'minor']

const INTERVALS: Record<ChordQuality, number[]> = { major: [0, 4, 7], minor: [0, 3, 7] }
const QUALITY_NAME: Record<ChordQuality, string> = { major: 'maior', minor: 'menor' }

export interface Chord {
  root: PitchClass
  quality: ChordQuality
  accidental: Accidental
}

export const makeChord = (root: PitchClass, quality: ChordQuality, accidental: Accidental = 'sharp'): Chord => ({
  root: pitchClass(root),
  quality,
  accidental,
})

export const chordPitchClasses = (c: Chord): Set<PitchClass> => new Set(chordOrderedPitchClasses(c))

/** Notas do acorde em ordem de empilhamento (fundamental, terça, quinta). */
export const chordOrderedPitchClasses = (c: Chord): PitchClass[] => INTERVALS[c.quality].map((i) => transposed(c.root, i))

/** Ex.: "Db maior", "F# menor". */
export const chordDisplayName = (c: Chord): string => `${pitchClassName(c.root, c.accidental)} ${QUALITY_NAME[c.quality]}`

export const chordEquals = (a: Chord | null | undefined, b: Chord | null | undefined): boolean =>
  !!a && !!b && a.root === b.root && a.quality === b.quality && a.accidental === b.accidental

export const setEquals = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean =>
  a.size === b.size && [...a].every((x) => b.has(x))
