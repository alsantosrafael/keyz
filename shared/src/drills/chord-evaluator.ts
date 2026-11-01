import { type Chord, chordPitchClasses } from '../music/chord'
import { type PitchClass, pitchClass } from '../music/pitch-class'

export interface ChordEvaluation {
  missing: Set<PitchClass>
  extra: Set<PitchClass>
  isCorrect: boolean
}

/** Compara as notas MIDI tocadas com o acorde esperado, ignorando oitava e inversão. */
export function evaluateChord(played: Iterable<number>, chord: Chord): ChordEvaluation {
  const playedPcs = new Set([...played].map(pitchClass))
  const expected = chordPitchClasses(chord)
  const missing = new Set([...expected].filter((p) => !playedPcs.has(p)))
  const extra = new Set([...playedPcs].filter((p) => !expected.has(p)))
  return { missing, extra, isCorrect: missing.size === 0 && extra.size === 0 }
}
