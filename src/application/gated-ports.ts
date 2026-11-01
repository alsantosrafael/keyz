import type { OutputGate as Gate } from './output-gate'
import type { Cue, FeedbackPort, PianoPort } from './ports'

/** Duração aproximada de cada cue (ms), para o portão de saída. */
const CUE_MS: Partial<Record<Cue, number>> = { tick: 150, go: 250, star: 400, correct: 400, wrong: 400, timeout: 400, milestone: 400 }
/** `PianoPort.chord` solta as notas depois de 900 ms. */
const CHORD_MS = 900

/** Piano que avisa o portão de saída do que está soando. Mesma interface, mesmo comportamento. */
export function gatePiano(piano: PianoPort, gate: Gate): PianoPort {
  return {
    noteOn: (midi, velocity) => {
      gate.noteOn(midi)
      piano.noteOn(midi, velocity)
    },
    noteOff: (midi) => {
      gate.noteOff(midi)
      piano.noteOff(midi)
    },
    chord: (midis) => {
      gate.pulse(CHORD_MS + 40)
      piano.chord(midis)
    },
    resume: () => piano.resume(),
    setEnabled: (on) => piano.setEnabled(on),
    setVolume: (v) => piano.setVolume(v),
  }
}

/** Feedback de jogo que avisa o portão de saída. */
export function gateFeedback(feedback: FeedbackPort, gate: Gate): FeedbackPort {
  return {
    cue: (kind, step) => {
      gate.pulse(CUE_MS[kind] ?? 300)
      feedback.cue(kind, step)
    },
    setEnabled: (on) => feedback.setEnabled(on),
  }
}
