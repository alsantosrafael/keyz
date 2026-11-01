import { type Note, noteOctave, notePitchClass } from './note'
import { type Accidental, spelling } from './pitch-class'

export type Clef = 'treble' | 'bass'

/** Onde desenhar uma nota na pauta. */
export interface StaffPlacement {
  clef: Clef
  /** Passos diatônicos acima da linha de baixo: 0 = 1ª linha, 1 = 1º espaço ... 8 = 5ª linha. */
  step: number
  accidental: Accidental | null
  /** Linhas suplementares (abaixo se `step < 0`, acima se `step > 8`). */
  ledgerLines: number
}

/** Dó central (C4) e acima vão na clave de sol; abaixo, na clave de fá. */
export function staffPlacement(note: Note, preferred: Accidental = 'sharp'): StaffPlacement {
  const spelled = spelling(notePitchClass(note), preferred)
  const diatonic = noteOctave(note) * 7 + spelled.letter
  const clef: Clef = note >= 60 ? 'treble' : 'bass'
  // Linha de baixo: E4 na clave de sol, G2 na clave de fá.
  const bottomLine = clef === 'treble' ? 4 * 7 + 2 : 2 * 7 + 4
  const step = diatonic - bottomLine
  const ledgerLines = step < 0 ? Math.trunc(-step / 2) : step > 8 ? Math.trunc((step - 8) / 2) : 0
  return { clef, step, accidental: spelled.accidental, ledgerLines }
}
