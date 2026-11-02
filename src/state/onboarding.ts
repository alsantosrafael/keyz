import { create } from 'zustand'
import {
  type Chord, STORAGE_KEYS, TUTORIAL_STEPS, type OnboardingProgress, type TipMode, chordEquals, completeTutorial,
  defaultOnboarding, parseOnboarding, resumeTutorial, restartTutorial, advanceTutorial, dismissPrompt, markTipSeen, onboardingValido,
} from '@keyz/shared'
import { type TutorialFeedback, type TutorialSession, eventoDeArmazenamentoInvalido, services } from '../application'

/**
 * Progresso do tutorial (localStorage, por navegador). Persistido a cada mudança: quem sai no
 * meio volta ao mesmo passo. Nada aqui decide regra de acorde; isso fica em `application`.
 */
interface OnboardingState {
  progress: OnboardingProgress
  /** Tutorial aberto nesta visita (não persiste: ao voltar, o usuário decide retomar). */
  tutorialOpen: boolean
  load: () => void
  apply: (fn: (p: OnboardingProgress) => OnboardingProgress) => void
  setOpen: (open: boolean) => void
}

const persist = (p: OnboardingProgress) => {
  try {
    services().storage.write(STORAGE_KEYS.onboarding, p)
  } catch {
    /* sem armazenamento: segue só em memória */
  }
}

export const useOnboarding = create<OnboardingState>((set, get) => ({
  progress: defaultOnboarding,
  tutorialOpen: false,
  load: () => {
    try {
      const salvo = services().storage.read(STORAGE_KEYS.onboarding)
      if (salvo !== undefined && !onboardingValido(salvo)) services().telemetry.record(eventoDeArmazenamentoInvalido(STORAGE_KEYS.onboarding))
      set({ progress: parseOnboarding(salvo) })
    } catch {
      /* sem serviços (testes de UI): padrão */
    }
  },
  apply: (fn) => {
    const progress = fn(get().progress)
    set({ progress })
    persist(progress)
  },
  setOpen: (tutorialOpen) => set({ tutorialOpen }),
}))

export const useTutorialFeedback = create<{ snap: TutorialFeedback | null }>(() => ({ snap: null }))

/** Ações do tutorial: uma por intenção do usuário. */
export const tutorialActions = {
  start: () => {
    useOnboarding.getState().apply(resumeTutorial)
    useOnboarding.getState().setOpen(true)
  },
  restart: () => {
    useOnboarding.getState().apply(restartTutorial)
    useOnboarding.getState().setOpen(true)
  },
  resume: () => useOnboarding.getState().setOpen(true),
  /** Fecha sem perder o progresso. */
  saveAndLeave: () => useOnboarding.getState().setOpen(false),
  /** Passa para o próximo passo: pelo acorde montado ou por "Pular passo". */
  nextStep: () => useOnboarding.getState().apply(advanceTutorial),
  complete: () => {
    useOnboarding.getState().apply(completeTutorial)
    useOnboarding.getState().setOpen(false)
  },
  dismissPrompt: () => useOnboarding.getState().apply(dismissPrompt),
  tipSeen: (mode: TipMode) => useOnboarding.getState().apply((p) => markTipSeen(p, mode)),
}

/**
 * Liga o tutorial à sessão de julgamento: só há um acorde a julgar quando o tutorial está
 * aberto num passo `play`. Trocar de passo reinicia a pegada; passar avança o progresso.
 */
export function bindOnboarding(session: TutorialSession): void {
  session.changes.subscribe((snap) => useTutorialFeedback.setState({ snap }))
  useTutorialFeedback.setState({ snap: session.snapshot })
  let initialized = false
  let last: Chord | null = null
  const sync = () => {
    const { progress, tutorialOpen } = useOnboarding.getState()
    const step = TUTORIAL_STEPS[progress.step]
    const next = tutorialOpen && step?.kind === 'play' ? step.chord : null
    if (initialized && (last === next || chordEquals(last, next))) return
    initialized = true
    last = next
    session.setChord(next)
  }
  useOnboarding.subscribe(sync)
  sync()
}
