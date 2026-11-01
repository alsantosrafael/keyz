import { Suspense, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ChevronDown, Keyboard, Settings } from 'lucide-react'
import { KeyboardNav, PianoKeyboard } from '../../ui/PianoKeyboard'
import { IconButton } from '../../ui/controls'
import { getApp, useKeyStates, useSettings, useUi } from '../../state/app'
import { InputPill } from './InputPill'
import { MicPrompt } from './MicPrompt'
import { ModeBar } from './ModeBar'
import { SettingsSheet } from './SettingsSheet'
import { modeForPath } from './modes'
import { useComputerKeyboard } from './useComputerKeyboard'

/**
 * Casca do app: barra superior, área do modo (rola) e teclado fixo na base. Trocar de modo
 * preserva o teclado e a posição dele (o teclado vive aqui, fora das rotas).
 */
export function Layout() {
  const { pathname } = useLocation()
  const mode = modeForPath(pathname)
  const mainRef = useRef<HTMLElement>(null)
  const first = useRef(true)
  const states = useKeyStates((s) => s.states)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const { hub } = getApp()
  const setSettingsOpen = useUi((s) => s.setSettingsOpen)
  useComputerKeyboard()

  useEffect(() => {
    document.documentElement.dataset.mode = mode.id
    if (first.current) first.current = false
    else mainRef.current?.focus({ preventScroll: true }) // foco no conteúdo ao trocar de tela
  }, [mode.id])

  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto] bg-stage">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[1000] focus:rounded-control focus:bg-track focus:px-4 focus:py-2 focus:text-on-track">
        Pular para o conteúdo
      </a>
      <header className="z-20 flex items-center gap-3 border-b border-line bg-panel px-4 pt-[env(safe-area-inset-top)] md:px-6">
        <div className="flex min-h-14 items-center gap-2">
          <span aria-hidden className="grid size-8 place-items-center rounded-[9px] bg-track text-on-track">
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor"><rect x="3" y="4" width="4.5" height="16" rx="1" /><rect x="9.75" y="4" width="4.5" height="16" rx="1" /><rect x="16.5" y="4" width="4.5" height="16" rx="1" /></svg>
          </span>
          <span className="t-headline">Keyz</span>
        </div>
        <div className="mx-auto"><ModeBar variant="top" /></div>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <InputPill />
          <IconButton label="Ajustes" onClick={() => setSettingsOpen(true)}><Settings size={20} strokeWidth={1.75} aria-hidden /></IconButton>
        </div>
      </header>

      <main id="conteudo" ref={mainRef} tabIndex={-1} className="relative z-0 overflow-y-auto overscroll-contain px-4 py-3 outline-none sm:py-5 md:px-6 lg:px-8">
        <div className={mode.id === 'free' || mode.id === 'chords' ? 'mx-auto w-full max-w-[720px] lg:max-w-[1040px]' : 'mx-auto w-full max-w-[720px]'}>
          <Suspense fallback={<div aria-busy className="min-h-[320px]" />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <footer className="z-10 border-t border-line">
        {settings.showKeyboard ? (
          <>
            <div className="flex items-center bg-panel">
              <div className="min-w-0 flex-1"><KeyboardNav hub={hub} /></div>
              <IconButton label="Esconder o teclado" className="mr-1" onClick={() => update({ showKeyboard: false })}>
                <ChevronDown size={20} strokeWidth={1.75} aria-hidden />
              </IconButton>
            </div>
            <PianoKeyboard
              hub={hub}
              keyStates={states}
              zoom={settings.keyboardZoom}
              showNames={settings.showNoteNames}
              showShortcuts={settings.showShortcuts}
              accidental={settings.accidental}
              className="kb-h"
            />
          </>
        ) : (
          <div className="flex justify-center bg-panel py-1">
            <button type="button" onClick={() => update({ showKeyboard: true })} className="t-label inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-4 text-muted hover:text-ink">
              <Keyboard size={18} strokeWidth={1.75} aria-hidden /> Mostrar teclado
            </button>
          </div>
        )}
        <ModeBar variant="bottom" />
      </footer>
      <SettingsSheet />
      <MicPrompt />
    </div>
  )
}
