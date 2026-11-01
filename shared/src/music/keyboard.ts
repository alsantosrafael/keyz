import { type Note, notePitchClass } from './note'
import { isBlackKey } from './pitch-class'

export interface KeyboardKey {
  note: Note
  isBlack: boolean
  /** Brancas: posição entre as brancas. Pretas: posição da branca à esquerda. */
  whiteIndex: number
}

/** Teclas de `lowest` a `highest`, inclusive. */
export function keyboardKeys(lowest: Note, highest: Note): KeyboardKey[] {
  if (lowest > highest) return []
  let whiteCount = 0
  const keys: KeyboardKey[] = []
  for (let midi = lowest; midi <= highest; midi++) {
    if (isBlackKey(notePitchClass(midi))) {
      keys.push({ note: midi, isBlack: true, whiteIndex: Math.max(0, whiteCount - 1) })
    } else {
      keys.push({ note: midi, isBlack: false, whiteIndex: whiteCount })
      whiteCount += 1
    }
  }
  return keys
}
