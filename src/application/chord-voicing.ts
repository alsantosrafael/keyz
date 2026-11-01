import { type Chord, chordOrderedPitchClasses } from '@keyz/shared'

/** Notas MIDI de um acorde numa faixa grave e fixa (uma oitava abaixo do Dó central), em ordem de empilhamento. */
export function chordVoicing(chord: Chord): number[] {
  let last = 60 + chord.root - 12
  return chordOrderedPitchClasses(chord).map((pc) => {
    while (last % 12 !== pc || last < 48) last += 1
    return last
  })
}
