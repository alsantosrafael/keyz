import { describe, expect, it } from 'vitest'
import { MicPipeline } from '../../src'

/** Tom sintético com parciais, 48 kHz, 1,5 s, em blocos de 10 ms (como o worklet). */
function tone(midi: number, sr = 48_000): number[] {
  const f0 = 440 * Math.pow(2, (midi - 69) / 12)
  const partials = [1, 0.55, 0.32, 0.2]
  const total = Math.floor(sr * 1.5)
  return Array.from({ length: total }, (_, i) => {
    const t = i / sr
    let s = 0
    partials.forEach((a, k) => (s += a * Math.sin(2 * Math.PI * f0 * (k + 1) * t)))
    return 0.1 * s * Math.exp(-t / 2)
  })
}

function stableNotes(midi: number): number[] {
  const pipe = new MicPipeline(48_000, 0.5)
  const samples = tone(midi)
  const notes: number[] = []
  for (let start = 0; start < samples.length; start += 480) {
    const frame = pipe.push(Float32Array.from(samples.slice(start, start + 480)))
    if (frame?.stable) notes.push(frame.stable.note.midi ?? (frame.stable.note as unknown as number))
  }
  return notes
}

describe('notas graves do microfone (C1 é a nota mais grave do teclado da tela)', () => {
  it('C1 (MIDI 24, 32,7 Hz) é reconhecido', () => {
    expect(stableNotes(24)).toContain(24)
  })
  it('F#1 (MIDI 30, 46,2 Hz) não vira 60 Hz', () => {
    const notes = stableNotes(30)
    expect(notes).toContain(30)
    expect(notes).not.toContain(60)
  })
})
