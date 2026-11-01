import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, Undo2 } from 'lucide-react'
import { TUTORIAL_STEPS, shouldPrompt } from '@keyz/shared'
import { Button } from '../../ui/controls'
import { useOnboarding, tutorialActions } from '../../state/onboarding'

const SPRING = { type: 'spring', stiffness: 260, damping: 30 } as const

/** Convite do primeiro uso: uma faixa discreta, sem bloquear o teclado. "Agora não" fica salvo. */
export function TutorialPrompt() {
  const progress = useOnboarding((s) => s.progress)
  const open = useOnboarding((s) => s.tutorialOpen)
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const show = !open && shouldPrompt(progress)

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.aside
          key="convite"
          aria-label="Convite para o tutorial"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={reduce ? { duration: 0.12 } : SPRING}
          className="mb-3 flex flex-wrap items-center gap-3 rounded-card border border-line bg-raised p-3 sm:p-4"
        >
          <GraduationCap size={22} strokeWidth={1.75} aria-hidden className="text-track" />
          <p className="min-w-0 flex-1 basis-56">
            <span className="t-label block">Primeira vez no Keyz?</span>
            <span className="text-muted">Aprenda o primeiro acorde em um minuto, tocando.</span>
          </p>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="primary" onClick={() => {
              tutorialActions.start()
              navigate('/acordes')
            }}>
              Começar
            </Button>
            <Button variant="ghost" onClick={tutorialActions.dismissPrompt}>Agora não</Button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

/** Tutorial pausado: um lembrete discreto no Acordes, nunca um convite de novo. */
export function ResumeTutorial() {
  const progress = useOnboarding((s) => s.progress)
  const open = useOnboarding((s) => s.tutorialOpen)
  if (open || progress.status !== 'started') return null
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-panel px-4 py-2">
      <p className="t-label flex items-center gap-2 text-muted">
        <Undo2 size={18} strokeWidth={1.75} aria-hidden />
        Tutorial pausado no passo {progress.step + 1} de {TUTORIAL_STEPS.length}
      </p>
      <Button variant="ghost" onClick={tutorialActions.resume}>Continuar</Button>
    </div>
  )
}
