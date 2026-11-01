import { describe, expect, it } from 'vitest'
import { ChromaAnalyzer, HeldNotes, PitchClassSetStabilizer, RingFilter, noteFrequency, pitchClass } from '../../src'
import { SeededGenerator } from '../helpers'

const weak = [0.4, 1, 0.8, 0.5, 0.35, 0.2, 0.15, 0.1]
const sampleRate = 48_000

describe('HeldNotesTests', () => {
  it('keepsNotesThatDroppedOutWhileHeld', () => {
    const held = new HeldNotes()
    held.update([60, 64, 67])
    expect(held.update([60, 64])).toEqual(new Set([60, 64, 67]))
    expect(held.update([60])).toEqual(new Set([60, 64, 67]))
  })
  it('resetsWhenHandLeavesTheKeys', () => {
    const held = new HeldNotes()
    held.update([60, 64, 67])
    expect(held.update([])).toEqual(new Set())
    expect(held.update([57])).toEqual(new Set([57]))
  })
  it('discardedNotesDoNotComeBackUntilReleased', () => {
    const held = new HeldNotes()
    held.update([60, 64, 66])
    held.discard([pitchClass(66)])
    expect(held.update([60, 64, 66])).toEqual(new Set([60, 64]))
    expect(held.update([60, 64, 67])).toEqual(new Set([60, 64, 67]))
    expect(held.update([])).toEqual(new Set())
    expect(held.update([66])).toEqual(new Set([66]))
  })
  it.each([[[60, 64, 67]], [[57, 60, 64]], [[55, 59, 62]]])('unionOfDecayingChordIsTheFullChord %j', (midis) => {
    const g = new SeededGenerator(99)
    const count = Math.floor(1.5 * sampleRate)
    const audio = new Float32Array(count)
    for (let index = 0; index < count; index++) {
      const t = index / sampleRate
      const decay = Math.exp(-1.5 * t)
      let value = 0
      for (const midi of midis) {
        const f0 = noteFrequency(midi)
        weak.forEach((a, order) => (value += a * decay * Math.sin(2 * Math.PI * f0 * (order + 1) * t)))
      }
      audio[index] = Math.fround(0.05 * value) + Math.fround(g.noise() * 0.01)
    }
    const analyzer = new ChromaAnalyzer({ sampleRate })
    const stabilizer = new PitchClassSetStabilizer(5)
    const held = new HeldNotes()
    for (let index = 0; index + 8192 <= audio.length; index += 480) {
      const confirmed = stabilizer.feed(analyzer.analyze(audio.subarray(index, index + 8192)))
      if (confirmed) held.update([...confirmed].map((p) => 60 + p))
    }
    const expected = new Set(midis.map((m) => pitchClass(m)))
    expect(new Set([...held.notes].map((n) => n % 12))).toEqual(expected)
  })
})

function sequence(first: number, second: number, switchAt: number, total: number): Float32Array {
  const g = new SeededGenerator(42)
  const count = Math.floor(total * sampleRate)
  const out = new Float32Array(count)
  for (let index = 0; index < count; index++) {
    const t = index / sampleRate
    let value = 0
    for (const [midi, start] of [[first, 0], [second, switchAt]] as const) {
      if (t < start) continue
      const local = t - start
      const decay = Math.exp(-1.5 * local)
      weak.forEach((a, order) => (value += a * decay * Math.sin(2 * Math.PI * noteFrequency(midi) * (order + 1) * local)))
    }
    out[index] = Math.fround(0.05 * value) + Math.fround(g.noise() * 0.01)
  }
  return out
}

function readings(first: number, second: number): Set<number>[] {
  const analyzer = new ChromaAnalyzer({ sampleRate })
  const ring = new RingFilter()
  const audio = sequence(first, second, 0.5, 1.2)
  const result: Set<number>[] = []
  for (let index = 0; index + 8192 <= audio.length; index += 480) {
    const t = (index + 8192) / sampleRate
    const attack = t > 0.5 && t < 0.52
    const filtered = ring.filter(analyzer.analyze(audio.subarray(index, index + 8192)), attack)
    if (t > 0.7) result.push(filtered?.pitchClasses ?? new Set())
  }
  return result
}

describe('RingFilterTests', () => {
  it.each([[60, 64], [60, 67], [62, 69]])('newNoteIsNotMixedWithTheRingingOne %i %i', (first, second) => {
    const frames = readings(first, second)
    expect(frames.every((f) => !f.has(pitchClass(first)))).toBe(true)
    expect(frames[frames.length - 1]).toEqual(new Set([pitchClass(second)]))
  })
  it('repeatedNoteIsStillRecognized', () => {
    const frames = readings(60, 60)
    expect(frames[frames.length - 1]).toEqual(new Set([0]))
  })
})
