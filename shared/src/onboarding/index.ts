import { z } from 'zod'
import { type Chord, makeChord } from '../music/chord'

/**
 * Tutorial de Acordes: o primeiro passo ensina o que é um acorde; os seguintes pedem para
 * montá-lo. Acorde é a coisa mais básica do app, então o tutorial fica nele. Os outros modos
 * ganham só um exemplo no último passo.
 */
export type TutorialKind = 'listen' | 'play' | 'done'
export interface TutorialStep {
  id: 'listen' | 'major' | 'minor' | 'done'
  kind: TutorialKind
  /** Acorde a montar (só nos passos `play`); `listen` toca o mesmo acorde sem julgar. */
  chord: Chord | null
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'listen', kind: 'listen', chord: makeChord(0, 'major') },
  { id: 'major', kind: 'play', chord: makeChord(0, 'major') },
  { id: 'minor', kind: 'play', chord: makeChord(9, 'minor') },
  { id: 'done', kind: 'done', chord: null },
]
export const LAST_STEP = TUTORIAL_STEPS.length - 1

/** Modos com dica de uma linha na primeira visita (Livre já tem o cartão de boas-vindas). */
export const TIP_MODES = ['desafio', 'entrada'] as const
export type TipMode = (typeof TIP_MODES)[number]

export const onboardingSchema = z.object({
  /** `new`: nunca começou. `started`: pausado no passo `step`. `completed`: concluído ou marcado. */
  status: z.enum(['new', 'started', 'completed']).default('new'),
  step: z.number().int().min(0).max(LAST_STEP).default(0),
  /** "Agora não" no convite: não aparece de novo sozinho (continua em Ajustes › Aprender). */
  promptDismissed: z.boolean().default(false),
  tipsSeen: z.array(z.enum(TIP_MODES)).default([]),
})
export type OnboardingProgress = z.infer<typeof onboardingSchema>
export const defaultOnboarding: OnboardingProgress = onboardingSchema.parse({})

/** Diz se o dado salvo passa no schema (sem trocá-lo pelo padrão). Usado para registrar dado inválido. */
export const onboardingValido = (raw: unknown): boolean => onboardingSchema.safeParse(raw).success

/** Dado inválido no armazenamento cai no padrão, sem quebrar a tela. */
export function parseOnboarding(raw: unknown): OnboardingProgress {
  const result = onboardingSchema.safeParse(raw)
  return result.success ? result.data : defaultOnboarding
}

// ---------- transições puras (sem efeitos; quem persiste é a camada de estado) ----------

/** Convite do primeiro uso: aparece só enquanto nunca começou e não foi dispensado. */
export const shouldPrompt = (p: OnboardingProgress): boolean => p.status === 'new' && !p.promptDismissed

/** Retoma de onde parou (sem reiniciar). */
export const resumeTutorial = (p: OnboardingProgress): OnboardingProgress => ({
  ...p,
  status: 'started',
  promptDismissed: true,
})

/** Começa do zero (usado por "Rever tutorial"). */
export const restartTutorial = (p: OnboardingProgress): OnboardingProgress => ({
  ...p,
  status: 'started',
  step: 0,
  promptDismissed: true,
})

/** Avança um passo; no último, fica nele até `completeTutorial`. */
export const advanceTutorial = (p: OnboardingProgress): OnboardingProgress => ({
  ...p,
  step: Math.min(p.step + 1, LAST_STEP),
})

/** Completar a qualquer momento: encerra o tutorial e marca as dicas como vistas (o último passo já mostra os exemplos). */
export const completeTutorial = (p: OnboardingProgress): OnboardingProgress => ({
  ...p,
  status: 'completed',
  step: LAST_STEP,
  promptDismissed: true,
  tipsSeen: [...TIP_MODES],
})

export const dismissPrompt = (p: OnboardingProgress): OnboardingProgress => ({ ...p, promptDismissed: true })

export const markTipSeen = (p: OnboardingProgress, mode: TipMode): OnboardingProgress =>
  p.tipsSeen.includes(mode) ? p : { ...p, tipsSeen: [...p.tipsSeen, mode] }
