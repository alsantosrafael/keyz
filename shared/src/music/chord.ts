import { type Accidental, type PitchClass, pitchClass, pitchClassName, solfegeName, transposed } from './pitch-class'

export type ChordQuality =
  | 'major' | 'minor'
  | 'dominant7' | 'major7' | 'minor7' | 'dominant9' | 'add9' | 'sus2' | 'sus4' | 'diminished' | 'augmented'
  | 'major6' | 'minor6' | 'minorMajor7' | 'halfDiminished' | 'diminished7' | 'major9' | 'minor9'
  | 'dominant7flat9' | 'dominant7sharp9' | 'dominant7sus4'
/** Os tipos do modo Acordes, do Livre e do reconhecimento: só tríades maiores e menores. */
export const CHORD_QUALITIES: readonly ChordQuality[] = ['major', 'minor']
/** Desafio avançado, além de maior e menor: sétimas, sus2, sus4, diminuto e aumentado. */
export const ADVANCED_CHORD_QUALITIES: readonly ChordQuality[] = [
  'dominant7', 'major7', 'minor7', 'sus2', 'sus4', 'diminished', 'augmented',
]
/** Desafio profissional, além do avançado: sextas, nonas, add9, alterados, meio-diminuto e diminuto com sétima. */
export const PROFESSIONAL_CHORD_QUALITIES: readonly ChordQuality[] = [
  'add9', 'major6', 'minor6', 'minorMajor7', 'halfDiminished', 'diminished7', 'dominant7sus4',
  'dominant9', 'major9', 'minor9', 'dominant7flat9', 'dominant7sharp9',
]

const INTERVALS: Record<ChordQuality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dominant7: [0, 4, 7, 10],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dominant9: [0, 4, 7, 10, 14],
  add9: [0, 4, 7, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  major6: [0, 4, 7, 9],
  minor6: [0, 3, 7, 9],
  minorMajor7: [0, 3, 7, 11],
  halfDiminished: [0, 3, 6, 10],
  diminished7: [0, 3, 6, 9],
  major9: [0, 4, 7, 11, 14],
  minor9: [0, 3, 7, 10, 14],
  dominant7flat9: [0, 4, 7, 10, 13],
  dominant7sharp9: [0, 4, 7, 10, 15],
  dominant7sus4: [0, 5, 7, 10],
}
const QUALITY_NAME: Record<ChordQuality, string> = {
  major: 'maior',
  minor: 'menor',
  dominant7: 'com sétima',
  major7: 'com sétima maior',
  minor7: 'menor com sétima',
  dominant9: 'com nona',
  add9: 'add9',
  sus2: 'sus2',
  sus4: 'sus4',
  diminished: 'diminuto',
  augmented: 'aumentado',
  major6: 'com sexta',
  minor6: 'menor com sexta',
  minorMajor7: 'menor com sétima maior',
  halfDiminished: 'meio-diminuto',
  diminished7: 'diminuto com sétima',
  major9: 'com nona maior',
  minor9: 'menor com nona',
  dominant7flat9: 'com sétima e nona menor',
  dominant7sharp9: 'com sétima e nona aumentada',
  dominant7sus4: 'com sétima sus4',
}

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

/** Notas do acorde em ordem de empilhamento (fundamental, terça, quinta, sétima ou nona). */
export const chordOrderedPitchClasses = (c: Chord): PitchClass[] => INTERVALS[c.quality].map((i) => transposed(c.root, i))

/** Ex.: "Db maior", "F# menor". */
export const chordDisplayName = (c: Chord): string => `${pitchClassName(c.root, c.accidental)} ${QUALITY_NAME[c.quality]}`

const QUALITY_SYMBOL: Record<ChordQuality, string> = {
  major: '', minor: 'm', dominant7: '7', major7: 'maj7', minor7: 'm7', dominant9: '9', add9: 'add9', sus2: 'sus2', sus4: 'sus4', diminished: 'dim', augmented: 'aug',
  major6: '6', minor6: 'm6', minorMajor7: 'm(maj7)', halfDiminished: 'm7b5', diminished7: 'dim7', major9: 'maj9', minor9: 'm9',
  dominant7flat9: '7b9', dominant7sharp9: '7#9', dominant7sus4: '7sus4',
}

/** Cifra: "G", "Am", "G7", "Cmaj7", "Cadd9". */
export const chordSymbol = (c: Chord): string => `${pitchClassName(c.root, c.accidental)}${QUALITY_SYMBOL[c.quality]}`

/** Só a parte da qualidade por extenso: "maior", "com sétima", "add9". */
export const chordQualityName = (c: Chord): string => QUALITY_NAME[c.quality]

/** Raiz em solfejo: "Sol", "Si♭". */
export const chordRootSolfege = (c: Chord): string => solfegeName(c.root, c.accidental)

/** Nome por extenso com a cifra: "Sol com sétima (G7)". */
export const chordFullName = (c: Chord): string => `${chordRootSolfege(c)} ${QUALITY_NAME[c.quality]} (${chordSymbol(c)})`

export const chordEquals = (a: Chord | null | undefined, b: Chord | null | undefined): boolean =>
  !!a && !!b && a.root === b.root && a.quality === b.quality && a.accidental === b.accidental

export const setEquals = <T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean =>
  a.size === b.size && [...a].every((x) => b.has(x))
