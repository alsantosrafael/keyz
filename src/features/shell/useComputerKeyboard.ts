import { useEffect } from 'react'
import { baseNoteForOctave, computerKeyOffset } from '../../application'
import { getApp, useUi } from '../../state/app'

/** Teclado do computador → InputHub (A–L brancas, W E T Y U O P pretas; Z e X mudam a oitava). */
export function useComputerKeyboard(): void {
  useEffect(() => {
    const { hub } = getApp()
    const held = new Map<string, number>()
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) && (el as HTMLInputElement).type !== 'range' && (el as HTMLInputElement).type !== 'checkbox'
    }
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector('dialog[open]')) return
      if (e.code === 'KeyZ' || e.code === 'KeyX') {
        if (!e.repeat) useUi.getState().shiftOctave(e.code === 'KeyZ' ? -1 : 1)
        return
      }
      const offset = computerKeyOffset(e.code)
      if (offset === null || e.repeat) return
      const note = baseNoteForOctave(useUi.getState().octave) + offset
      if (note < 21 || note > 108) return
      e.preventDefault()
      held.set(e.code, note)
      hub.tap(note, 'computer', true)
    }
    const up = (e: KeyboardEvent) => {
      const note = held.get(e.code)
      if (note === undefined) return
      held.delete(e.code)
      hub.tap(note, 'computer', false)
    }
    const blur = () => {
      held.clear()
      hub.releaseSource('computer')
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      blur()
    }
  }, [])
}
