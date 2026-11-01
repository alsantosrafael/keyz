import { describe, expect, it } from 'vitest'
import { type DrillResult, hardestNotes, isStreakMilestone, mergeBest, reflexLabel, starsFor } from '../../src'

describe('rating (novas regras da SPEC)', () => {
  it('estrelas pelos limiares 60/80/90 e tempo médio', () => {
    expect(starsFor(0.59, 1, 6)).toBe(0)
    expect(starsFor(0.6, 1, 6)).toBe(1)
    expect(starsFor(0.8, 5, 6)).toBe(2)
    expect(starsFor(0.9, 2.9, 6)).toBe(3)
    expect(starsFor(0.9, 3, 6)).toBe(2)
    expect(starsFor(1, null, 6)).toBe(2)
  })
  it('faixa de reflexo', () => {
    expect(reflexLabel(0.8)).toBe('Rápido')
    expect(reflexLabel(1)).toBeNull()
    expect(reflexLabel(null)).toBeNull()
  })
  it('marcos de sequência', () => {
    expect([4, 5, 10, 15, 20].map(isStreakMilestone)).toEqual([false, true, true, false, true])
  })
  it('notas mais difíceis', () => {
    const miss = (target: number): DrillResult => ({ target, outcome: { kind: 'timeout' }, responseTime: null })
    const ok = (target: number): DrillResult => ({ target, outcome: { kind: 'correct' }, responseTime: 1 })
    expect(hardestNotes([miss(62), miss(64), miss(62), ok(60), miss(65), miss(64), miss(62)])).toEqual([62, 64])
  })
  it('melhor marca', () => {
    expect(mergeBest({ stars: 2, bestStreak: 9 }, { stars: 1, bestStreak: 12 })).toEqual({ stars: 2, bestStreak: 12 })
  })
})
