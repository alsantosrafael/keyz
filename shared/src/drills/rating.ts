import { type Note } from '../music/note'
import { type DrillResult } from './note-drill'

export type Stars = 0 | 1 | 2 | 3

/**
 * Estrelas ao fim da sessão (SPEC): 1 com ≥60% de acerto, 2 com ≥80%,
 * 3 com ≥90% e tempo médio abaixo de metade do tempo da nota.
 */
export function starsFor(accuracy: number, averageResponseTime: number | null, timePerNote: number): Stars {
  if (accuracy >= 0.9 && averageResponseTime !== null && averageResponseTime < timePerNote / 2) return 3
  if (accuracy >= 0.8) return 2
  if (accuracy >= 0.6) return 1
  return 0
}

export type Reflex = 'fast' | 'normal' | 'slow'

/** Faixa de reflexo: <1 s é "Rápido"; de 1 a 2,5 s nada; depois disso nenhum rótulo. */
export function reflexLabel(responseTime: number | null): 'Rápido' | null {
  return responseTime !== null && responseTime < 1 ? 'Rápido' : null
}

/** Marcos de sequência com destaque no HUD. */
export const STREAK_MILESTONES = [5, 10, 20] as const
export const isStreakMilestone = (streak: number): boolean => (STREAK_MILESTONES as readonly number[]).includes(streak)

/** As notas com mais erros (erro ou tempo esgotado) da sessão, da pior para a melhor. */
export function hardestNotes(history: readonly DrillResult[], limit = 2): Note[] {
  const misses = new Map<Note, number>()
  for (const r of history) if (r.outcome.kind !== 'correct') misses.set(r.target, (misses.get(r.target) ?? 0) + 1)
  return [...misses.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, limit).map(([n]) => n)
}

export interface BestMark {
  stars: Stars
  bestStreak: number
}

export const mergeBest = (a: BestMark | undefined, b: BestMark): BestMark => ({
  stars: Math.max(a?.stars ?? 0, b.stars) as Stars,
  bestStreak: Math.max(a?.bestStreak ?? 0, b.bestStreak),
})
