import { describe, expect, it } from 'vitest'
import { type DrillConfig, type DrillResult, NoteDrill, drillPreset, notePool, isBlackKey } from '../../src'
import { SeededGenerator } from '../helpers'

const makeDrill = (config: DrillConfig = drillPreset('easy')) => new NoteDrill(config, new SeededGenerator(42).random)
const currentTarget = (d: NoteDrill) => (d.phase.kind === 'awaiting' ? d.phase.target : null)

describe('NoteDrillTests', () => {
  it('correctNoteAutoAdvancesAfterPause', () => {
    const drill = makeDrill()
    drill.start(0)
    const target = currentTarget(drill)!
    drill.noteOn(target, 2)
    const result: DrillResult = { target, outcome: { kind: 'correct' }, responseTime: 2 }
    expect(drill.phase).toEqual({ kind: 'showingResult', result, nextAt: 3.5 })
    expect(drill.stats.correct).toBe(1)
    expect(drill.stats.streak).toBe(1)
    drill.tick(3.4)
    expect(currentTarget(drill)).toBeNull()
    drill.tick(3.5)
    expect(currentTarget(drill)).not.toBe(target)
    expect(currentTarget(drill)).not.toBeNull()
  })
  it('wrongNoteIsReported', () => {
    const drill = makeDrill()
    drill.start(0)
    const target = currentTarget(drill)!
    drill.noteOn(target + 1, 1)
    if (drill.phase.kind !== 'showingResult') throw new Error('esperava resultado')
    expect(drill.phase.result.outcome).toEqual({ kind: 'wrong', played: target + 1 })
    expect(drill.stats.wrong).toBe(1)
    expect(drill.stats.streak).toBe(0)
  })
  it('timeoutWhenNothingIsPlayed', () => {
    const drill = makeDrill()
    drill.start(0)
    const target = currentTarget(drill)!
    drill.tick(10)
    expect(drill.phase).toEqual({ kind: 'showingResult', result: { target, outcome: { kind: 'timeout' }, responseTime: null }, nextAt: 11.5 })
    expect(drill.stats.timeouts).toBe(1)
  })
  it('lateNoteCountsAsTimeout', () => {
    const drill = makeDrill()
    drill.start(0)
    const target = currentTarget(drill)!
    drill.noteOn(target, 10.5)
    expect(drill.stats.timeouts).toBe(1)
    expect(drill.stats.correct).toBe(0)
  })
  it('manualAdvanceWaitsForUser', () => {
    const drill = makeDrill({ ...drillPreset('easy'), autoAdvance: false })
    drill.start(0)
    const target = currentTarget(drill)!
    drill.noteOn(target, 1)
    drill.tick(100)
    expect(drill.phase.kind === 'showingResult' && drill.phase.nextAt === null).toBe(true)
    drill.advance(100)
    expect(currentTarget(drill)).not.toBeNull()
  })
  it('anyOctaveWhenNotMatchingOctave', () => {
    const drill = makeDrill({ ...drillPreset('easy'), matchOctave: false })
    drill.start(0)
    const target = currentTarget(drill)!
    drill.noteOn(target + 12, 1)
    expect(drill.stats.correct).toBe(1)
  })
  it('finishesAfterConfiguredRounds', () => {
    const drill = makeDrill({ ...drillPreset('easy'), rounds: 2 })
    drill.start(0)
    drill.tick(10)
    drill.tick(11.5)
    drill.tick(21.5)
    drill.tick(23)
    expect(drill.phase.kind).toBe('finished')
    expect(drill.stats.attempts).toBe(2)
  })
  it('targetsStayInsidePool', () => {
    const config = drillPreset('medium')
    const drill = makeDrill(config)
    let now = 0
    drill.start(now)
    for (let i = 0; i < 15; i++) {
      const target = currentTarget(drill)
      if (target !== null) {
        expect(notePool(config)).toContain(target)
        drill.noteOn(target, now)
      }
      now += 2
      drill.tick(now)
    }
  })
  it('presetsGetHarderWithDifficulty', () => {
    const easy = drillPreset('easy')
    const medium = drillPreset('medium')
    const advanced = drillPreset('advanced')
    expect(easy.timePerNote).toBeGreaterThan(medium.timePerNote)
    expect(medium.timePerNote).toBeGreaterThan(advanced.timePerNote)
    expect(notePool(easy).length).toBeLessThan(notePool(medium).length)
    expect(notePool(medium).length).toBeLessThan(notePool(advanced).length)
    expect(notePool(easy).every((n) => !isBlackKey(n))).toBe(true)
    const pro = drillPreset('professional')
    expect(advanced.timePerNote).toBeGreaterThan(pro.timePerNote)
    expect(notePool(advanced).length).toBeLessThan(notePool(pro).length)
    expect(pro.promptStyle).toBe('staff')
  })
})
