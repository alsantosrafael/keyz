import { describe, expect, it } from 'vitest'
import {
  LAST_STEP, TUTORIAL_STEPS, advanceTutorial, completeTutorial, defaultOnboarding, dismissPrompt, markTipSeen,
  parseOnboarding, restartTutorial, resumeTutorial, shouldPrompt,
} from '../../src'

describe('tutorial de acordes (passos)', () => {
  it('começa ouvindo Dó maior e termina no passo de conclusão', () => {
    expect(TUTORIAL_STEPS[0]).toMatchObject({ id: 'listen', kind: 'listen' })
    expect(TUTORIAL_STEPS[LAST_STEP]).toMatchObject({ id: 'done', kind: 'done', chord: null })
  })

  it('os passos de montar são acordes de Dó maior e Lá menor', () => {
    const play = TUTORIAL_STEPS.filter((s) => s.kind === 'play')
    expect(play.map((s) => [s.chord?.root, s.chord?.quality])).toEqual([[0, 'major'], [9, 'minor']])
  })
})

describe('progresso do onboarding', () => {
  it('dado inválido vira o padrão, sem quebrar', () => {
    expect(parseOnboarding('lixo')).toEqual(defaultOnboarding)
    expect(parseOnboarding({ status: 'bogus', step: 99 })).toEqual(defaultOnboarding)
  })

  it('convite aparece só para quem nunca começou e não dispensou', () => {
    expect(shouldPrompt(defaultOnboarding)).toBe(true)
    expect(shouldPrompt(dismissPrompt(defaultOnboarding))).toBe(false)
    expect(shouldPrompt(resumeTutorial(defaultOnboarding))).toBe(false)
  })

  it('retomar mantém o passo; reiniciar volta ao início', () => {
    const paused = { ...defaultOnboarding, status: 'started' as const, step: 2 }
    expect(resumeTutorial(paused).step).toBe(2)
    expect(restartTutorial({ ...paused, status: 'completed' })).toMatchObject({ status: 'started', step: 0 })
  })

  it('avançar para no último passo, sem passar do fim', () => {
    let p = resumeTutorial(defaultOnboarding)
    for (let i = 0; i < 10; i++) p = advanceTutorial(p)
    expect(p.step).toBe(LAST_STEP)
  })

  it('completar a qualquer momento encerra e marca as dicas dos outros modos', () => {
    const p = completeTutorial(resumeTutorial(defaultOnboarding))
    expect(p.status).toBe('completed')
    expect(p.tipsSeen).toEqual(['desafio', 'entrada'])
    expect(shouldPrompt(p)).toBe(false)
  })

  it('dica de modo não se repete', () => {
    const once = markTipSeen(defaultOnboarding, 'desafio')
    expect(markTipSeen(once, 'desafio')).toBe(once)
  })
})
