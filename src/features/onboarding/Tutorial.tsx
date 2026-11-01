import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, SkipForward, Volume2, X } from 'lucide-react'
import {
  TUTORIAL_STEPS, chordOrderedPitchClasses, pitchClass, solfegeName,
} from '@keyz/shared'
import { chordVoicing, chordNoteNames, services } from '../../application'
import { TimeRing } from '../../ui/TimeRing'
import { Button, IconButton } from '../../ui/controls'
import { LiveRegion } from '../../ui/LiveRegion'
import { cn } from '../../ui/cn'
import { type KeyVisual, useSettings, useUi } from '../../state/app'
import { useOnboarding, tutorialActions, useTutorialFeedback } from '../../state/onboarding'
import { usePublishKeyStates } from '../common/hooks'

const SPRING = { type: 'spring', stiffness: 260, damping: 30 } as const
const EASE = [0.22, 1, 0.36, 1] as const

/**
 * Tutorial de Acordes, uma prática curta com o teclado real: ouvir, montar, montar outro, concluir.
 * Cada passo avança pela ação do usuário (ou sozinho, no passo de escuta). Pode ser guardado e
 * retomado, ou completado a qualquer momento.
 */
export function Tutorial() {
  const progress = useOnboarding((s) => s.progress)
  const fb = useTutorialFeedback((s) => s.snap)
  const accidental = useSettings((s) => s.settings.accidental)
  const reduce = useReducedMotion()
  const [demoLit, setDemoLit] = useState(false)
  const [replay, setReplay] = useState(0)
  const step = TUTORIAL_STEPS[progress.step] ?? TUTORIAL_STEPS[0]
  const chord = step.chord
  const total = TUTORIAL_STEPS.length

  // Montado = aberto. Sair da tela pausa o tutorial (o progresso já está salvo) e impede que o
  // motor de acordes julgue as teclas em outro modo.
  useEffect(() => {
    useOnboarding.getState().setOpen(true)
    useUi.getState().reveal(60) // Dó central: o tutorial começa no teclado certo
    return () => useOnboarding.getState().setOpen(false)
  }, [])

  // Passo de escuta: toca o acorde, acende as teclas e segue sozinho. "Ouvir de novo" reinicia.
  useEffect(() => {
    if (step.kind !== 'listen' || !chord) return
    const demo = chordVoicing(chord).map((m) => m + 12)
    setDemoLit(false)
    const piano = window.setTimeout(() => {
      setDemoLit(true)
      services().piano.chord(demo)
    }, 350)
    const next = window.setTimeout(() => tutorialActions.nextStep(), 3200)
    return () => {
      window.clearTimeout(piano)
      window.clearTimeout(next)
    }
  }, [step.id, replay]) // eslint-disable-line react-hooks/exhaustive-deps

  const keyStates = useMemo(() => {
    const m = new Map<number, KeyVisual>()
    if (step.kind === 'listen' && chord && demoLit) {
      for (const n of chordVoicing(chord).map((x) => x + 12)) m.set(n, 'chord-member')
    }
    if (step.kind === 'play' && chord && fb) {
      const expected = new Set(chordOrderedPitchClasses(chord))
      for (const n of fb.played) {
        if (!expected.has(pitchClass(n))) m.set(n, 'wrong')
        else m.set(n, fb.state === 'correct' ? 'correct' : 'chord-member')
      }
    }
    return m
  }, [step, chord, demoLit, fb])
  usePublishKeyStates(keyStates)

  const names = chord ? chordNoteNames(chord) : []
  const correct = fb?.state === 'correct'
  const ringState = correct ? 'correct' : 'running'

  return (
    <motion.section
      aria-labelledby="tutorial-titulo"
      className="flex flex-col gap-4 rounded-card border border-line bg-panel p-4 sm:p-5"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.12 } : SPRING}
    >
      <header className="flex items-center justify-between gap-3">
        <ol aria-label={`Passo ${progress.step + 1} de ${total}`} className="flex items-center gap-1.5">
          {TUTORIAL_STEPS.map((s, i) => (
            <li key={s.id} aria-current={i === progress.step ? 'step' : undefined} className="relative h-1.5 w-7 overflow-hidden rounded-full bg-line-strong">
              <motion.span
                aria-hidden
                className="absolute inset-0 origin-left bg-track"
                initial={false}
                animate={{ scaleX: i <= progress.step ? 1 : 0 }}
                transition={reduce ? { duration: 0 } : SPRING}
              />
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-1">
          <Button variant="ghost" className="min-h-11 whitespace-nowrap px-3" onClick={tutorialActions.complete}>Completar</Button>
          <IconButton label="Guardar e sair (o progresso fica salvo)" onClick={tutorialActions.saveAndLeave}>
            <X size={20} strokeWidth={1.75} aria-hidden />
          </IconButton>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step.id}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: -18 }}
          transition={reduce ? { duration: 0.12 } : { duration: 0.24, ease: EASE }}
          className="flex flex-col items-center gap-4 text-center"
        >
          {step.kind === 'listen' && chord && (
            <>
              <h2 id="tutorial-titulo" className="t-title">Um acorde são notas tocadas juntas</h2>
              <Chord name={solfegeName(chord.root, accidental)} quality="maior" compact />
              <p className="max-w-[46ch] text-muted">Dó, Mi e Sol soando ao mesmo tempo formam Dó maior.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setReplay((n) => n + 1)}>
                  <Volume2 size={18} strokeWidth={1.75} aria-hidden /> Ouvir de novo
                </Button>
                <Button variant="ghost" onClick={tutorialActions.nextStep}>
                  <SkipForward size={18} strokeWidth={1.75} aria-hidden /> Pular
                </Button>
              </div>
            </>
          )}

          {step.kind === 'play' && chord && (
            <>
              <h2 id="tutorial-titulo" className="t-title">{step.id === 'major' ? 'Monte Dó maior' : 'Agora, Lá menor'}</h2>
              <div className="w-[min(168px,50vw)]">
                <TimeRing
                  duration={1}
                  elapsed={0}
                  roundKey={step.id}
                  paused={false}
                  state={ringState}
                  progress={fb && fb.total ? fb.matched / fb.total : 0}
                >
                  <Chord name={solfegeName(chord.root, accidental)} quality={chord.quality === 'minor' ? 'menor' : 'maior'} compact />
                </TimeRing>
              </div>
              <p className="text-muted">Segure {names.join(', ').replace(/, ([^,]*)$/, ' e $1')} ao mesmo tempo.</p>
              <div className="min-h-7" aria-live="off">
                {correct ? (
                  <motion.span
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={reduce ? { duration: 0.12 } : SPRING}
                    className="t-label inline-flex items-center gap-1 text-success"
                  >
                    <Check size={18} strokeWidth={2} aria-hidden /> Acertou
                  </motion.span>
                ) : fb?.state === 'wrong' ? (
                  <motion.span
                    initial={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={reduce ? { duration: 0.12 } : SPRING}
                    className={cn('t-label inline-flex items-center gap-1 text-failure')}
                  >
                    <X size={18} strokeWidth={2} aria-hidden /> {fb.hint}. Tente de novo.
                  </motion.span>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="ghost" onClick={tutorialActions.nextStep}>
                  <SkipForward size={18} strokeWidth={1.75} aria-hidden /> Pular passo
                </Button>
              </div>
            </>
          )}

          {step.kind === 'done' && (
            <>
              <h2 id="tutorial-titulo" className="t-title">Você tocou dois acordes</h2>
              <p className="max-w-[46ch] text-muted">Os outros modos, em um exemplo cada:</p>
              <ul className="grid w-full max-w-[46ch] gap-2 text-left">
                <li className="rounded-control border border-line bg-raised p-3">
                  <span className="t-label text-drill">Desafio</span>
                  <span className="block text-muted">Aparece uma nota. Toque ela antes do tempo acabar.</span>
                </li>
                <li className="rounded-control border border-line bg-raised p-3">
                  <span className="t-label text-free">Livre</span>
                  <span className="block text-muted">Toque qualquer tecla e veja o nome e a pauta.</span>
                </li>
                <li className="rounded-control border border-line bg-raised p-3">
                  <span className="t-label text-input">Entrada</span>
                  <span className="block text-muted">Conecte um teclado MIDI ou ative o microfone.</span>
                </li>
              </ul>
              <Button variant="primary" onClick={tutorialActions.complete}>Concluir tutorial</Button>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <LiveRegion text={fb?.announce ?? ''} />
    </motion.section>
  )
}

/** Nome do acorde em destaque (mesma tipografia do Acordes). */
function Chord({ name, quality, compact }: { name: string; quality: string; compact?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span className={cn('t-title min-h-9 text-center', compact ? 'text-[32px] sm:text-[36px]' : 'text-[40px] sm:text-[48px]')} style={{ fontFamily: 'var(--font-rounded)' }}>
        {name}
      </span>
      <span className="t-headline text-muted">{quality}</span>
    </div>
  )
}
