import { CHORD_QUALITIES, type Chord, type ChordQuality, chordOrderedPitchClasses, chordPitchClasses, makeChord, setEquals } from '../music/chord'
import { type Accidental, type PitchClass, pitchClass } from '../music/pitch-class'

export interface RecognizedChord {
  chord: Chord
  /** 0 = posição fundamental, 1 = 1ª inversão (terça no baixo), 2 = 2ª inversão (quinta no baixo). */
  inversion: number
}

export const inversionName = (inversion: number): string =>
  inversion === 1 ? '1ª inversão' : inversion === 2 ? '2ª inversão' : inversion === 3 ? '3ª inversão' : 'posição fundamental'

/** Grafia mais comum de cada acorde (ex.: Eb maior, mas C# menor). */
export function preferredAccidental(root: PitchClass, quality: ChordQuality): Accidental {
  const flatRoots = quality === 'major' ? [1, 3, 8, 10] : [3, 10]
  return flatRoots.includes(root) ? 'flat' : 'sharp'
}

/** Identifica um acorde maior ou menor nas notas tocadas (oitavas dobradas são aceitas). */
export function recognizeChord(midiNotes: Iterable<number>): RecognizedChord | null {
  const notes = [...midiNotes]
  if (notes.length === 0) return null
  const bass = Math.min(...notes)
  const played = new Set(notes.map(pitchClass))
  for (const root of [...played].sort((a, b) => a - b)) {
    for (const quality of CHORD_QUALITIES) {
      const chord = makeChord(root, quality, preferredAccidental(root, quality))
      if (!setEquals(chordPitchClasses(chord), played)) continue
      const index = chordOrderedPitchClasses(chord).indexOf(pitchClass(bass))
      return { chord, inversion: Math.max(0, index) }
    }
  }
  return null
}
