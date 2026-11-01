import { describe, expect, it } from 'vitest'
import { CALIBRATION_FRAMES, MicPipeline } from '../../src'

const SAMPLE_RATE = 44100
const CHUNK = 441

/** Ruído branco determinístico (LCG) com a amplitude dada. */
function noise(amplitude: number, seed = 1) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return ((state / 0xffffffff) * 2 - 1) * amplitude
  }
}

function feed(pipeline: MicPipeline, frames: number, sample: (i: number) => number) {
  const out = []
  let t = 0
  for (let f = 0; f < frames; f++) {
    const chunk = new Float32Array(CHUNK)
    for (let i = 0; i < CHUNK; i++) chunk[i] = sample(t++)
    const frame = pipeline.push(chunk)
    if (frame) out.push(frame)
  }
  return out
}

describe('calibração de ruído', () => {
  it('reporta progresso crescente e termina em 1', () => {
    const pipeline = new MicPipeline(SAMPLE_RATE)
    const n = noise(0.01)
    feed(pipeline, 40, () => n())
    pipeline.recalibrate()
    const frames = feed(pipeline, CALIBRATION_FRAMES + 20, () => n())
    const progress = frames.map((f) => f.calibration?.progress).filter((p): p is number => p !== undefined)
    expect(progress).toHaveLength(CALIBRATION_FRAMES)
    expect(progress[0]).toBeGreaterThan(0)
    expect(progress.at(-1)).toBe(1)
    expect(frames.at(-1)?.calibration).toBeNull()
  })

  it('mede o nível de ruído médio', () => {
    const pipeline = new MicPipeline(SAMPLE_RATE)
    const n = noise(0.01)
    feed(pipeline, 40, () => n())
    pipeline.recalibrate()
    const frames = feed(pipeline, CALIBRATION_FRAMES + 5, () => n())
    const done = frames.find((f) => f.calibration?.progress === 1)!
    // RMS de ruído uniforme em ±0,01 é ~0,0058.
    expect(done.calibration!.noiseLevel).toBeGreaterThan(0.004)
    expect(done.calibration!.noiseLevel).toBeLessThan(0.008)
  })

  it('depois de calibrar, o ruído da sala deixa de virar nota', () => {
    const pipeline = new MicPipeline(SAMPLE_RATE, 1)
    const n = noise(0.05)
    pipeline.recalibrate()
    feed(pipeline, CALIBRATION_FRAMES + 5, () => n())
    const after = feed(pipeline, 100, () => n())
    expect(after.every((f) => f.spectrumNotes.length === 0 && f.chord === null)).toBe(true)
  })

  it('uma nota tocada depois da calibração continua sendo reconhecida', () => {
    const pipeline = new MicPipeline(SAMPLE_RATE, 0.5)
    const n = noise(0.01)
    pipeline.recalibrate()
    feed(pipeline, CALIBRATION_FRAMES + 5, () => n())
    const frames = feed(pipeline, 80, (i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) + n())
    expect(frames.some((f) => f.stable?.note === 69)).toBe(true)
  })
})
