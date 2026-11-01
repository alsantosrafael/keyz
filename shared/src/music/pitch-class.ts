/** Uma das 12 classes de nota (0 = Dó ... 11 = Si), independente de oitava. */
export type PitchClass = number
export type Accidental = 'sharp' | 'flat'

export const pitchClass = (value: number): PitchClass => ((Math.trunc(value) % 12) + 12) % 12

export const transposed = (pc: PitchClass, semitones: number): PitchClass => pitchClass(pc + semitones)

const BLACK = new Set([1, 3, 6, 8, 10])
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const SHARP_LETTERS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
const FLAT_LETTERS = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]
const SOLFEGE = ['Dó', 'Ré', 'Mi', 'Fá', 'Sol', 'Lá', 'Si']

export const isBlackKey = (pc: PitchClass): boolean => BLACK.has(pitchClass(pc))

export function pitchClassName(pc: PitchClass, preferring: Accidental = 'sharp'): string {
  return (preferring === 'sharp' ? SHARP_NAMES : FLAT_NAMES)[pitchClass(pc)]
}

/** Letra (0 = C ... 6 = B) e alteração usadas para escrever a nota na partitura. */
export function spelling(pc: PitchClass, preferring: Accidental = 'sharp'): { letter: number; accidental: Accidental | null } {
  const v = pitchClass(pc)
  return preferring === 'sharp'
    ? { letter: SHARP_LETTERS[v], accidental: isBlackKey(v) ? 'sharp' : null }
    : { letter: FLAT_LETTERS[v], accidental: isBlackKey(v) ? 'flat' : null }
}

/** Nome em solfejo, ex.: "Ré♭", "Fá♯". */
export function solfegeName(pc: PitchClass, preferring: Accidental = 'sharp'): string {
  const s = spelling(pc, preferring)
  const base = SOLFEGE[s.letter]
  return s.accidental === 'sharp' ? `${base}♯` : s.accidental === 'flat' ? `${base}♭` : base
}
