import { describe, expect, it } from 'vitest'
import {
  ChromaAnalyzer, type ChromaReading, PitchClassSetStabilizer, evaluateChord, makeChord, chordPitchClasses, noteFrequency, pitchClass, CHORD_QUALITIES,
} from '../../src'
import { SeededGenerator } from '../helpers'

const sampleRate = 48_000
const pianoHarmonics = [1, 0.5, 0.35, 0.25, 0.15, 0.1, 0.07]

function play(notes: number[], noise = 0.002, count = 8192): Float32Array {
  const g = new SeededGenerator(7)
  const freqs = notes.map(noteFrequency)
  const out = new Float32Array(count)
  for (let index = 0; index < count; index++) {
    const t = index / sampleRate
    let value = 0
    for (const f of freqs) pianoHarmonics.forEach((a, order) => (value += a * Math.sin(2 * Math.PI * f * (order + 1) * t)))
    out[index] = Math.fround(0.1 * value) + Math.fround(g.noise() * noise)
  }
  return out
}
const pcs = (v: number[]) => new Set(v.map(pitchClass))

describe('ChromaAnalyzerTests', () => {
  it('singleNoteIsNotMistakenForChord', () => {
    const analyzer = new ChromaAnalyzer({ sampleRate })
    for (const midi of [48, 55, 60, 64, 67, 72]) expect(analyzer.analyze(play([midi]))?.pitchClasses, `nota ${midi}`).toEqual(pcs([midi]))
  })
  it('recognizesEveryMajorAndMinorTriad', () => {
    const analyzer = new ChromaAnalyzer({ sampleRate })
    for (let root = 0; root < 12; root++) {
      for (const quality of CHORD_QUALITIES) {
        const chord = makeChord(root, quality)
        const notes = quality === 'major' ? [0, 4, 7] : [0, 3, 7]
        const reading = analyzer.analyze(play(notes.map((n) => 60 + root + n)))
        expect(reading?.pitchClasses, `${root} ${quality}`).toEqual(chordPitchClasses(chord))
      }
    }
  })
  it('recognizesInversionsAndLowerOctave', () => {
    const analyzer = new ChromaAnalyzer({ sampleRate })
    const cMajor = pcs([0, 4, 7])
    expect(analyzer.analyze(play([64, 67, 72]))?.pitchClasses).toEqual(cMajor)
    expect(analyzer.analyze(play([55, 60, 64]))?.pitchClasses).toEqual(cMajor)
    expect(analyzer.analyze(play([57, 60, 64]))?.pitchClasses).toEqual(pcs([9, 0, 4]))
  })
  it('wrongChordShowsWrongNote', () => {
    const analyzer = new ChromaAnalyzer({ sampleRate })
    const reading = analyzer.analyze(play([60, 64, 67]))!
    const evaluation = evaluateChord([...reading.pitchClasses].map((p) => 60 + p), makeChord(0, 'minor'))
    expect(evaluation.missing).toEqual(pcs([3]))
    expect(evaluation.extra).toEqual(pcs([4]))
  })
  it('noiseIsNotMusic', () => {
    const analyzer = new ChromaAnalyzer({ sampleRate })
    const g = new SeededGenerator(3)
    const noise = Float32Array.from({ length: 8192 }, () => g.noise() * 0.05)
    expect(analyzer.analyze(noise)).toBeNull()
  })
  it('silenceReturnsNil', () => {
    const analyzer = new ChromaAnalyzer({ sampleRate })
    expect(analyzer.analyze(new Float32Array(8192))).toBeNull()
    expect(analyzer.analyze(new Float32Array(100).fill(0.1))).toBeNull()
  })
  it('stabilizerConfirmsAfterRepeatedFrames', () => {
    const stabilizer = new PitchClassSetStabilizer(2)
    const reading = { pitchClasses: pcs([0, 4, 7]) } as ChromaReading
    expect(stabilizer.feed(reading)).toBeNull()
    expect(stabilizer.feed(reading)).toEqual(reading.pitchClasses)
  })
  it('stabilizerToleratesAStrayNoteFrame', () => {
    const stabilizer = new PitchClassSetStabilizer(4)
    const chord = { pitchClasses: pcs([0, 4, 7]) } as ChromaReading
    const stray = { pitchClasses: pcs([0, 4, 7, 2]) } as ChromaReading
    let confirmed: Set<number> | null = null
    for (const r of [chord, chord, stray, chord, chord]) confirmed = stabilizer.feed(r) ?? confirmed
    expect(confirmed).toEqual(chord.pitchClasses)
  })
  it('steadyRoomNoiseIsIgnoredAfterLearningIt', () => {
    const analyzer = new ChromaAnalyzer({ sampleRate })
    const g = new SeededGenerator(21)
    const noise = () => Float32Array.from({ length: 8192 }, () => g.noise() * 0.02)
    for (let i = 0; i < 100; i++) analyzer.analyze(noise())
    // O teste Swift equivalente tem uma asserção vacuosa: o piso não converge de baixo (ver SPEC,
    // Questões em aberto), e o Swift passa mesmo com classes de nota no ruído. A paridade fica no
    // comportamento: mesmas classes, quadro a quadro (primeiros quadros do Swift: nil, [0,3,7,9,10], [0,1,3,9,11]).
    const early = Array.from({ length: 3 }, () => analyzer.analyze(noise()))
    expect(early[0]).toBeNull()
    expect([...early[1]!.pitchClasses].sort((a, b) => a - b)).toEqual([0, 3, 7, 9, 10])
    expect([...early[2]!.pitchClasses].sort((a, b) => a - b)).toEqual([0, 1, 3, 9, 11])
    for (let i = 0; i < 17; i++) analyzer.analyze(noise())
    const music = play([60, 64, 67])
    const n = noise()
    const mixed = music.map((v, i) => v + n[i])
    expect(analyzer.analyze(mixed)?.pitchClasses).toEqual(pcs([0, 4, 7]))
  })
})
