import { type Chord, chordOrderedPitchClasses } from '@keyz/shared'

/** Notas MIDI de um acorde numa faixa grave e fixa (uma oitava abaixo do Dó central), da mais grave para a mais aguda. */
export function chordVoicing(chord: Chord, inversion = 0): number[] {
  let last = 60 + chord.root - 12
  const notes = chordOrderedPitchClasses(chord).map((pc) => {
    while (last % 12 !== pc || last < 48) last += 1
    return last
  })
  // Inversão: as primeiras notas sobem uma oitava, e a do baixo passa a ser a escolhida.
  return notes.map((n, i) => (i < inversion ? n + 12 : n)).sort((a, b) => a - b)
}
