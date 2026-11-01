import { type Accidental, type PitchClass, pitchClass, pitchClassName, solfegeName as pcSolfege } from './pitch-class'

/** Uma nota com oitava é o seu número MIDI. Dó central = 60 (C4). */
export type Note = number

export const notePitchClass = (midi: Note): PitchClass => pitchClass(midi)
export const noteOctave = (midi: Note): number => Math.floor(midi / 12) - 1
export const noteFrequency = (midi: Note): number => 440 * Math.pow(2, (midi - 69) / 12)

/** Ex.: "C#4", "Bb3". */
export const noteName = (midi: Note, preferring: Accidental = 'sharp'): string =>
  `${pitchClassName(midi, preferring)}${noteOctave(midi)}`

/** Ex.: "Fá♯4". */
export const noteSolfege = (midi: Note, preferring: Accidental = 'sharp'): string =>
  `${pcSolfege(midi, preferring)}${noteOctave(midi)}`

/** Arredonda metade para longe do zero, como o `rounded()` do Swift. */
export const roundHalfAway = (x: number): number => (x < 0 ? -Math.round(-x) : Math.round(x))

/** Nota mais próxima de uma frequência, com o desvio em cents (-50...50). */
export function nearestNote(frequency: number): { note: Note; cents: number } | null {
  if (!(frequency > 0) || !Number.isFinite(frequency)) return null
  const exact = 69 + 12 * Math.log2(frequency / 440)
  const rounded = roundHalfAway(exact)
  return { note: rounded, cents: (exact - rounded) * 100 }
}

/** Rótulo falado/lido: "Fá♯ 4" (com espaço, como na SPEC). */
export const noteLabel = (midi: Note, preferring: Accidental = 'sharp'): string => `${pcSolfege(midi, preferring)} ${noteOctave(midi)}`
