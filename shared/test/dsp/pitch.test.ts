import { describe, expect, it } from 'vitest'
import {
  ChromaAnalyzer, NoteStabilizer, PitchDetector, readingNote, noteFrequency, pitchClass, MicPipeline, DisplayStabilizer,
} from '../../src'
import { SeededGenerator } from '../helpers'

describe('PitchDetectionTests', () => {
  const sampleRate = 44_100
  const tone = (frequency: number, harmonics: number[], count: number) =>
    Float32Array.from({ length: count }, (_, i) => {
      const t = i / sampleRate
      return 0.3 * harmonics.reduce((sum, h, k) => sum + h * Math.sin(2 * Math.PI * frequency * (k + 1) * t), 0)
    })

  it('detectsPureA4', () => {
    const r = new PitchDetector({ sampleRate }).detect(tone(440, [1], 4096))!
    expect(Math.abs(r.frequency - 440)).toBeLessThan(1)
    expect(r.confidence).toBeGreaterThan(0.9)
  })
  it('detectsPianoLikeMiddleC', () => {
    const r = new PitchDetector({ sampleRate }).detect(tone(261.63, [1, 0.6, 0.4, 0.25], 4096))!
    expect(readingNote(r)?.note).toBe(60)
  })
  it('detectsLowA1', () => {
    const d = new PitchDetector({ sampleRate })
    const r = d.detect(tone(55, [1, 0.8, 0.5], d.recommendedBufferSize))!
    expect(readingNote(r)?.note).toBe(33)
  })
  it('silenceIsIgnored', () => expect(new PitchDetector({ sampleRate }).detect(new Float32Array(4096))).toBeNull())
  it('stabilizerNeedsConsecutiveFrames', () => {
    const s = new NoteStabilizer(3)
    const a4 = { frequency: 440, confidence: 0.95 }
    expect(s.feed(a4)).toBeNull()
    expect(s.feed(a4)).toBeNull()
    expect(s.feed(a4)?.note).toBe(69)
    expect(s.feed(null)).toBeNull()
    expect(s.feed(a4)).toBeNull()
    expect(s.feed({ frequency: 440, confidence: 0.3 })).toBeNull()
  })
})

describe('RealisticPianoTests', () => {
  const sampleRate = 48_000
  const weakFundamental = [0.4, 1, 0.8, 0.5, 0.35, 0.2, 0.15, 0.1]
  function piano(midis: number[], partials: number[], inharmonicity = 0.0004, count = 8192): Float32Array {
    const g = new SeededGenerator(11)
    const out = new Float32Array(count)
    for (let index = 0; index < count; index++) {
      const t = index / sampleRate
      let value = 0
      for (const m of midis) {
        const f0 = noteFrequency(m)
        partials.forEach((a, order) => {
          const n = order + 1
          value += a * Math.sin(2 * Math.PI * f0 * n * Math.sqrt(1 + inharmonicity * n * n) * t)
        })
      }
      out[index] = Math.fround(0.05 * value) + Math.fround(g.noise() * 0.002)
    }
    return out
  }

  it('chromaSeesOneNoteWhenFundamentalIsWeak', () => {
    const analyzer = new ChromaAnalyzer({ sampleRate })
    for (const midi of [40, 45, 48, 52, 55, 60, 64]) {
      expect(analyzer.analyze(piano([midi], weakFundamental))?.pitchClasses, `nota ${midi}`).toEqual(new Set([pitchClass(midi)]))
    }
  })
  it('chromaStillSeesTriads', () => {
    const analyzer = new ChromaAnalyzer({ sampleRate })
    for (const notes of [[60, 64, 67], [57, 60, 64], [55, 59, 62], [64, 67, 72]]) {
      expect(analyzer.analyze(piano(notes, weakFundamental))?.pitchClasses, `${notes}`).toEqual(new Set(notes.map(pitchClass)))
    }
  })
  it.each([0.0004, 0.002])('yinKeepsTheOctave %f', (inharmonicity) => {
    const detector = new PitchDetector({ sampleRate })
    for (const midi of [36, 40, 45, 48, 52, 55, 60, 64, 69, 72, 76, 84]) {
      const r = detector.detect(piano([midi], weakFundamental, inharmonicity, detector.recommendedBufferSize))
      expect(r && readingNote(r)?.note, `nota ${midi}`).toBe(midi)
    }
  })
})

describe('PitchDetectorEdgeTests', () => {
  it('noisyInputNeverCrashes', () => {
    const detector = new PitchDetector({ sampleRate: 48_000, minFrequency: 60 })
    const g = new SeededGenerator(5)
    for (const length of [64, 500, 1000, 1600, 3000]) {
      for (let i = 0; i < 50; i++) detector.detect(Float32Array.from({ length }, () => g.noise() * 0.1))
    }
  })
})

describe('RingFilter / pipeline / display (novas regras)', () => {
  it('MicPipeline reconhece uma nota de piano em blocos de 128 amostras', () => {
    const sampleRate = 48_000
    const pipe = new MicPipeline(sampleRate)
    const f0 = noteFrequency(64)
    const total = sampleRate
    const frames: (ReturnType<MicPipeline['push']>)[] = []
    for (let start = 0; start + 128 <= total; start += 128) {
      const chunk = Float32Array.from({ length: 128 }, (_, i) => {
        const t = (start + i) / sampleRate
        return 0.1 * [1, 0.5, 0.35].reduce((s, a, k) => s + a * Math.sin(2 * Math.PI * f0 * (k + 1) * t), 0)
      })
      frames.push(pipe.push(chunk))
    }
    const stable = frames.filter((f) => f?.stable).map((f) => f!.stable!.note)
    expect(stable.length).toBeGreaterThan(10)
    expect(new Set(stable)).toEqual(new Set([64]))
  })

  it('DisplayStabilizer: histerese de 3 quadros e esmaecimento em 200 ms', () => {
    const d = new DisplayStabilizer<number>()
    expect(d.feed(60, 10).value).toBeNull()
    expect(d.feed(60, 10).value).toBeNull()
    expect(d.feed(60, 10).value).toBe(60)
    expect(d.feed(62, 10).value).toBe(60) // um quadro de outra nota não troca
    expect(d.feed(60, 10).value).toBe(60)
    d.feed(62, 10); d.feed(62, 10)
    expect(d.feed(62, 10).value).toBe(62)
    const lost = d.feed(null, 100)
    expect(lost.value).toBe(62)
    expect(lost.strength).toBeCloseTo(0.5)
    expect(d.feed(null, 150).strength).toBe(0)
  })
})
