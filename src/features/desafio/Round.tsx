import { useEffect, useMemo, useRef } from 'react'
import { Check, Clock, Pause, Play, SkipForward, Volume2, VolumeX, X } from 'lucide-react'
import { chordQualityName, chordRootSolfege, chordSymbol, inversionName, pitchClass, solfegeName } from '@keyz/shared'
import { StaffCard, type StaffNote } from '../../ui/StaffCard'
import { Countdown, type RingState, TimeRing } from '../../ui/TimeRing'
import { Button, IconButton } from '../../ui/controls'
import { cn } from '../../ui/cn'
import { type KeyVisual, getApp, useDrill, useSettings, useUi } from '../../state/app'
import { Hud } from '../common/Hud'
import { fmtSeconds, usePublishKeyStates } from '../common/hooks'

/** Rodada e resultado: o resultado aparece no lugar da nota-alvo, sem trocar de tela. */
export function Round() {
  const { drill } = getApp()
  const s = useDrill((x) => x)
  const { settings, update } = useSettings()
  const reveal = useUi((x) => x.reveal)
  const acc = s.config.accidental
  const showResult = s.screen === 'result' && s.result
  const isChords = s.content === 'chords'
  const outcome = s.result?.outcome.kind

  // Garante que o alvo caiba na janela do teclado (nas telas estreitas a janela mostra poucas teclas).
  useEffect(() => {
    if (s.target !== null && s.screen === 'round') reveal(s.target)
    document.getElementById('conteudo')?.scrollTo({ top: 0 })
  }, [s.target, s.roundKey, s.screen, reveal])

  const keyStates = useMemo(() => {
    const m = new Map<number, KeyVisual>()
    if (s.target === null) return m
    if (s.screen === 'round' && s.hint) for (const n of s.targetNotes) m.set(n, 'target')
    if (showResult) {
      if (outcome === 'correct') for (const n of s.targetNotes) m.set(n, 'correct')
      else {
        for (const n of s.targetNotes) m.set(n, 'ghost')
        if (isChords) {
          // Notas tocadas que não fazem parte do acorde ficam em erro.
          const members = new Set(s.targetNotes.map(pitchClass))
          for (const n of s.playedNotes) if (!members.has(pitchClass(n))) m.set(n, 'wrong')
        } else if (s.result?.outcome.kind === 'wrong') m.set(s.result.outcome.played, 'wrong')
      }
    }
    return m
  }, [s.target, s.targetNotes, s.playedNotes, isChords, s.screen, s.hint, s.result, showResult, outcome])
  usePublishKeyStates(keyStates)

  const staff = useMemo<StaffNote[]>(() => {
    if (s.target === null) return []
    if (!showResult) return s.targetNotes.map((midi) => ({ midi, role: 'target' as const }))
    if (outcome === 'correct') return s.targetNotes.map((midi) => ({ midi, role: 'correct' as const }))
    const notes: StaffNote[] = s.targetNotes.map((midi) => ({ midi, role: 'ghost' as const }))
    if (isChords) {
      const members = new Set(s.targetNotes.map(pitchClass))
      for (const midi of s.playedNotes) if (!members.has(pitchClass(midi))) notes.push({ midi, role: 'wrong' })
    } else if (s.result?.outcome.kind === 'wrong') notes.push({ midi: s.result.outcome.played, role: 'wrong' })
    return notes
  }, [s.target, s.targetNotes, s.playedNotes, isChords, showResult, outcome, s.result])

  // Espaço, Esc pausam; Enter pula o resultado.
  const resumeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      const el = e.target as HTMLElement
      const interactive = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(el.tagName)
      if (e.key === 'Escape' || (e.key === ' ' && !interactive)) {
        e.preventDefault()
        drill.togglePause()
      } else if (e.key === 'Enter' && !interactive) drill.skipResult()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drill])
  useEffect(() => {
    if (s.paused && !s.resuming) resumeRef.current?.focus()
  }, [s.paused, s.resuming])

  const style = s.config.promptStyle
  // Acorde: o anel já mostra a resposta no resultado; a frase diz só o que falta (evita três linhas atrás do teclado).
  const shownResult = !isChords ? s.resultText : outcome === 'wrong' ? s.resultText.replace(/^Era .*?\. /, '') : outcome === 'timeout' ? 'Tempo esgotado' : s.resultText
  // Acorde: raiz em solfejo grande; embaixo a qualidade, a cifra e, se pedida, a inversão.
  const targetName = s.chord ? chordRootSolfege(s.chord) : s.target === null ? '' : solfegeName(pitchClass(s.target), acc)
  const ringState: RingState = showResult ? (outcome === 'correct' ? 'correct' : outcome === 'timeout' ? 'timeout' : 'wrong') : 'running'
  const ResultIcon = outcome === 'correct' ? Check : outcome === 'timeout' ? Clock : X
  const resultColor = outcome === 'correct' ? 'text-success' : outcome === 'timeout' ? 'text-warning' : 'text-failure'

  return (
    <div className="relative flex flex-col gap-3">
      <h1 className="sr-only">Desafio</h1>
      <Hud
        index={s.index}
        total={s.total}
        streak={s.streak}
        milestone={s.milestone}
        right={
          <>
            <IconButton label={settings.feedbackSounds ? 'Desligar sons do jogo' : 'Ligar sons do jogo'} aria-pressed={settings.feedbackSounds} onClick={() => update({ feedbackSounds: !settings.feedbackSounds })}>
              {settings.feedbackSounds ? <Volume2 size={20} strokeWidth={1.75} aria-hidden /> : <VolumeX size={20} strokeWidth={1.75} aria-hidden />}
            </IconButton>
            <IconButton label="Pausar" onClick={() => drill.pause()}><Pause size={20} strokeWidth={1.75} aria-hidden /></IconButton>
          </>
        }
      />

      <div className={cn(outcome === 'wrong' && 'k-shake')} key={s.resultSeq} onClick={() => drill.skipResult()}>
        <TimeRing duration={s.duration} elapsed={s.elapsed} roundKey={s.roundKey} paused={s.paused} state={ringState}>
          {style !== 'staff' || showResult ? (
            <div key={`${s.roundKey}-${s.screen}`} className="k-note-in flex flex-col items-center">
              {/* Acorde: raiz menor e o resto em linhas curtas, para nunca passar da largura do anel. */}
              <div className="t-display" style={isChords ? { fontSize: 'clamp(40px, 11vw, 56px)' } : undefined}>{targetName}</div>
              {isChords && s.chord ? (
                <div className="flex max-w-[7.5rem] flex-col items-center text-center">
                  <span className="t-label leading-tight text-muted">{chordQualityName(s.chord)}</span>
                  <span className="t-readout">{chordSymbol(s.chord)}</span>
                  {s.inversion > 0 && <span className="t-label leading-tight text-muted">{inversionName(s.inversion)}</span>}
                </div>
              ) : (
                <div className="t-readout text-muted">{s.target !== null ? `oitava ${Math.floor(s.target / 12) - 1}` : ''}</div>
              )}
            </div>
          ) : (
            <div className="t-display text-faint" aria-hidden>?</div>
          )}
          <div className="mt-1 min-h-7">
            {showResult ? (
              s.reflex && <span className="t-label rounded-full bg-gold px-2 py-0.5 font-semibold text-on-warning">{s.reflex}</span>
            ) : <Countdown getTimeLeft={() => drill.timeLeft()} paused={s.paused} />}
          </div>
          {outcome === 'correct' && <span key={s.resultSeq} aria-hidden className="k-rise t-title absolute -top-1 text-success">+1</span>}
        </TimeRing>
      </div>

      <div className="min-h-[52px] text-center" onClick={() => drill.skipResult()}>
        {showResult && (
          <p className={cn('k-note-in t-headline inline-flex items-center justify-center gap-2', resultColor)}>
            <ResultIcon size={22} strokeWidth={2} aria-hidden /> {shownResult}
            {outcome === 'correct' && s.result?.responseTime != null && <span className="t-readout text-muted">· {fmtSeconds(s.result.responseTime)} s</span>}
          </p>
        )}
      </div>

      {(style !== 'name' || showResult) && <StaffCard notes={staff} accidental={acc} />}
      {showResult && s.config.autoAdvance === false && (
        <Button variant="primary" className="mx-auto" onClick={() => drill.skipResult()}><SkipForward size={18} strokeWidth={1.75} aria-hidden /> Próxima</Button>
      )}

      {s.paused && (
        <div className="absolute -inset-4 z-30 grid place-items-center rounded-card bg-scrim backdrop-blur-[6px]" role="dialog" aria-label="Jogo pausado">
          {s.resuming ? (
            <div className="t-display" aria-live="polite">1</div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="t-title">Pausado</p>
              <Button ref={resumeRef} variant="primary" onClick={() => drill.resume()}><Play size={18} strokeWidth={1.75} fill="currentColor" aria-hidden /> Retomar</Button>
              <Button variant="ghost" onClick={() => drill.backToLobby()}>Sair do jogo</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
