import { type Chord, chordDisplayName, chordOrderedPitchClasses, chordPitchClasses, evaluateChord, solfegeName } from '@keyz/shared'
import { chordVoicing } from './chord-voicing'
import { Emitter } from './emitter'
import type { InputHub } from './input-hub'
import type { Services } from './ports'

export interface TutorialFeedback {
  /** 'idle' = montando; 'correct' = fechou (avanço agendado); 'wrong' = julgou errado (sem punição: tenta de novo). */
  state: 'idle' | 'correct' | 'wrong'
  /** Notas MIDI da pegada atual. */
  played: number[]
  /** Classes certas tocadas / total: o anel de progresso. */
  matched: number
  total: number
  /** Explicação curta do erro: "Faltou Mi", "Tem nota a mais: Ré". */
  hint: string
  announce: string
}

const ADVANCE_MS = 900

/**
 * Julga o acorde do passo atual do tutorial. Não sorteia nem conta pontos: só diz se o
 * acorde pedido foi montado. Quem decide o passo seguinte é quem chama `onPass`.
 */
export class TutorialSession {
  readonly changes = new Emitter<TutorialFeedback>()
  private chord: Chord | null = null
  private state: TutorialFeedback['state'] = 'idle'
  /** Notas acumuladas desde a primeira tecla da pegada, até soltar tudo. */
  private held = new Set<number>()
  private hint = ''
  private announce = ''
  private timer: number | undefined
  private snap: TutorialFeedback = { state: 'idle', played: [], matched: 0, total: 0, hint: '', announce: '' }
  private unsubscribe: () => void

  constructor(
    private readonly hub: InputHub,
    private readonly s: Pick<Services, 'piano' | 'feedback' | 'haptics' | 'scheduler'>,
    private readonly onPass: () => void,
  ) {
    this.unsubscribe = hub.events.subscribe(() => this.notesChanged(hub.activeNotes))
  }

  get snapshot(): TutorialFeedback {
    return this.snap
  }

  dispose(): void {
    this.unsubscribe()
    this.cancelTimer()
  }

  /** Troca o acorde pedido (null = nada a julgar). Reinicia a pegada. */
  setChord(chord: Chord | null): void {
    this.cancelTimer()
    this.chord = chord
    this.state = 'idle'
    this.hint = ''
    this.held.clear()
    this.announce = chord ? `Toque ${chordDisplayName(chord)}` : ''
    this.publish(this.hub.activeNotes)
  }

  private notesChanged(active: number[]): void {
    const chord = this.chord
    if (!chord || this.state === 'correct') return
    if (active.length > 0) {
      if (this.state === 'wrong') {
        // Nova tentativa: o erro anterior sai da tela assim que a mão volta às teclas.
        this.state = 'idle'
        this.hint = ''
      }
      for (const n of active) this.held.add(n)
      if (evaluateChord(active, chord).isCorrect) return this.pass(chord, active)
      this.publish(active)
      return
    }
    // Soltou tudo: julga o que foi tocado nessa pegada.
    if (this.held.size === 0) return
    const result = evaluateChord(this.held, chord)
    this.held.clear()
    if (!result.isCorrect) {
      const missing = [...result.missing].map((p) => solfegeName(p, chord.accidental))
      const extra = [...result.extra].map((p) => solfegeName(p, chord.accidental))
      this.state = 'wrong'
      this.hint = missing.length ? `Faltou ${missing.join(', ')}` : `Tem nota a mais: ${extra.join(', ')}`
      this.announce = this.hint
      this.s.feedback.cue('wrong')
      this.s.haptics.vibrate([20, 40, 20])
    }
    this.publish([])
  }

  private pass(chord: Chord, active: number[]): void {
    this.state = 'correct'
    this.hint = ''
    this.announce = `Acertou, ${chordDisplayName(chord)}`
    this.s.feedback.cue('correct')
    this.s.haptics.vibrate(10)
    this.s.piano.chord(chordVoicing(chord))
    this.publish(active)
    // Soltar as teclas não cancela o avanço: o acorde já está montado.
    this.cancelTimer()
    this.timer = this.s.scheduler.setTimeout(() => {
      this.timer = undefined
      this.onPass()
    }, ADVANCE_MS)
  }

  private cancelTimer(): void {
    if (this.timer !== undefined) this.s.scheduler.clearTimeout(this.timer)
    this.timer = undefined
  }

  private publish(active: number[]): void {
    const chord = this.chord
    const pcs = chord ? chordPitchClasses(chord) : new Set<number>()
    const playedPcs = new Set(active.map((n) => n % 12))
    const matched = this.state === 'correct' ? pcs.size : [...pcs].filter((p) => playedPcs.has(p)).length
    this.snap = {
      state: this.state,
      played: [...active].sort((a, b) => a - b),
      matched,
      total: pcs.size,
      hint: this.hint,
      announce: this.announce,
    }
    this.changes.emit(this.snap)
  }
}

/** Nomes das notas do acorde, na ordem de empilhamento (para a dica "Dó · Mi · Sol"). */
export function chordNoteNames(chord: Chord): string[] {
  return chordOrderedPitchClasses(chord).map((pc) => solfegeName(pc, chord.accidental))
}
