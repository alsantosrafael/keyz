import { useEffect } from 'react'
import { type KeyVisual, getApp, useKeyStates } from '../../state/app'

/** Publica o estado visual das teclas do modo atual; limpa ao sair. */
export function usePublishKeyStates(states: ReadonlyMap<number, KeyVisual>): void {
  useEffect(() => {
    useKeyStates.getState().set(states)
  }, [states])
  useEffect(() => () => useKeyStates.getState().set(new Map()), [])
}

/** Só o Desafio desliga acordes no microfone (um harmônico forte não pode virar segunda nota). */
export function useMicChords(on: boolean): void {
  useEffect(() => {
    const { mic } = getApp()
    mic.chords = on
    return () => {
      mic.chords = true
    }
  }, [on])
}

export const fmtSeconds = (s: number): string => s.toFixed(1).replace('.', ',')
