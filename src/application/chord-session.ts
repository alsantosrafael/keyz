import {
  ChordGenerator, type Chord, type ChordEvaluation, type ChordQuality, HeldNotes, chordDisplayName, chordEquals,
  chordOrderedPitchClasses, chordPitchClasses, evaluateChord, noteSolfege, pitchClassName, solfegeName, starsFor, type Stars,
} from '@keyz/shared'
import { chordVoicing } from './chord-voicing'
import { Emitter } from './emitter'
import type { InputHub } from './input-hub'
import type { Services } from './ports'

export interface ChordSnapshot {
  chord: Chord | null
  chordName: string
  evaluation: ChordEvaluation | null
  /** Notas MIDI da pegada atual. */
  played: number[]
  attempts: number
  correct: number
  streak: number
  round: number
  rounds: number
  /** Classes certas já tocadas / total do acorde: o anel de progresso. */
  matched: number
  total: number
  /** 'awaiting' = montando; 'correct' = fechou; 'wrong' = julgou errado. */
  state: 'awaiting' | 'correct' | 'wrong'
  showAnswer: boolean
  finished: boolean
  stars: Stars
  announce: string
  includeMajor: boolean
  includeMinor: boolean
  autoAdvance: boolean
}

/** Porta de `ChordPracticeModel.swift`, com anel de progresso e resumo. */
export class ChordSession {
  readonly changes = new Emitter<ChordSnapshot>()
  private generator = new ChordGenerator()
  private chord: Chord | null = null
  private evaluation: ChordEvaluation | null = null
  private played: number[] = []
  private attempts = 0
  private correct = 0
  private streak = 0
  private round = 0
  private rounds = 10
  private showAnswer = false
  private finished = false
  private includeMajor = true
  private includeMinor = true
  private autoAdvance = true
  private pending: number | undefined
  private advanceTimer: number | undefined
  private judged = false
  private held = new HeldNotes()
  private lastPressed: number[] = []
  /** Depois de trocar de acorde com a mão nas teclas, ignora as notas até soltar. */
  private awaitingRelease = false
  private announce = ''
  private unsubscribe: () => void
  private snap!: ChordSnapshot

  constructor(
    private readonly hub: InputHub,
    private readonly s: Pick<Services, 'piano' | 'feedback' | 'haptics' | 'scheduler'>,
  ) {
    this.unsubscribe = hub.events.subscribe(() => this.notesChanged(hub.activeNotes))
    this.restart()
  }

  get snapshot(): ChordSnapshot {
    return this.snap
  }
  dispose(): void {
    this.unsubscribe()
    this.cancel()
    this.cancelAdvance()
  }

  restart(): void {
    this.generator = new ChordGenerator(this.qualities())
    this.attempts = this.correct = this.streak = this.round = 0
    this.finished = false
    this.nextChord()
  }

  setQualities(major: boolean, minor: boolean): void {
    this.includeMajor = major
    this.includeMinor = minor
    this.restart()
  }
  setAutoAdvance(on: boolean): void {
    this.autoAdvance = on
    this.publish()
  }
  setShowAnswer(on: boolean): void {
    this.showAnswer = on
    this.publish()
  }

  private qualities(): ChordQuality[] {
    const q: ChordQuality[] = []
    if (this.includeMajor) q.push('major')
    if (this.includeMinor) q.push('minor')
    return q.length ? q : ['major', 'minor']
  }

  nextChord(): void {
    this.cancel()
    this.cancelAdvance()
    if (this.round >= this.rounds) {
      this.finished = true
      this.chord = null
      this.publish()
      return
    }
    this.round += 1
    this.chord = this.generator.next()
    this.evaluation = null
    this.showAnswer = false
    this.judged = false
    this.awaitingRelease = this.lastPressed.length > 0
    this.held = new HeldNotes()
    this.played = []
    this.announce = this.chord ? `Toque ${chordDisplayName(this.chord)}` : ''
    this.publish()
  }

  /** Avalia o acumulado da pegada, depois que a mão fica parada; se soltar antes, avalia na hora. */
  private notesChanged(pressed: number[]): void {
    this.lastPressed = pressed
    if (this.awaitingRelease) {
      if (pressed.length === 0) this.awaitingRelease = false
      return
    }
    if (this.finished) return
    this.cancel()
    const before = new Set(this.held.notes)
    const notes = this.held.update(pressed)
    if (notes.size > 0) this.played = [...notes].sort((a, b) => a - b)
    const chord = this.chord
    if (!chord) return
    if (notes.size === 0) {
      if (!this.judged && before.size >= chordPitchClasses(chord).size) this.evaluate(before)
      else this.publish()
      return
    }
    const delay = notes.size >= chordPitchClasses(chord).size ? 350 : 1000
    this.publish()
    const snapshot = new Set(notes)
    this.pending = this.s.scheduler.setTimeout(() => this.evaluate(snapshot), delay)
  }

  private evaluate(notes: Set<number>): void {
    const chord = this.chord
    if (!chord) return
    this.cancel()
    this.played = [...notes].sort((a, b) => a - b)
    const result = evaluateChord(notes, chord)
    this.evaluation = result
    // Nota errada não atrapalha a próxima tentativa: sai do acumulado desta pegada.
    this.held.discard(result.extra)
    const first = !this.judged
    if (first) {
      this.judged = true
      this.attempts += 1
      if (result.isCorrect) {
        this.correct += 1
        this.streak += 1
      } else this.streak = 0
    }
    if (result.isCorrect) {
      this.s.feedback.cue('correct')
      this.s.haptics.vibrate(10)
      this.s.piano.chord(this.chordMidis(chord))
      this.announce = `Acertou, ${chordDisplayName(chord)}`
      // O avanço tem timer próprio: soltar as teclas não pode cancelá-lo.
      if (this.autoAdvance) this.advanceTimer = this.s.scheduler.setTimeout(() => this.nextChord(), 1200)
    } else {
      this.s.feedback.cue('wrong')
      this.s.haptics.vibrate([20, 40, 20])
      const missing = [...result.missing].map((p) => solfegeName(p, chord.accidental)).join(', ')
      this.announce = missing ? `Faltou ${missing}` : 'Tem nota a mais'
    }
    this.publish()
  }

  chordMidis(chord: Chord): number[] {
    return chordVoicing(chord)
  }

  private cancel(): void {
    if (this.pending !== undefined) this.s.scheduler.clearTimeout(this.pending)
    this.pending = undefined
  }

  private cancelAdvance(): void {
    if (this.advanceTimer !== undefined) this.s.scheduler.clearTimeout(this.advanceTimer)
    this.advanceTimer = undefined
  }

  private publish(): void {
    const chord = this.chord
    const pcs = chord ? chordPitchClasses(chord) : new Set<number>()
    const playedPcs = new Set(this.played.map((n) => n % 12))
    const matched = [...pcs].filter((p) => playedPcs.has(p)).length
    const state: ChordSnapshot['state'] = this.evaluation ? (this.evaluation.isCorrect ? 'correct' : 'wrong') : 'awaiting'
    this.snap = {
      chord,
      chordName: chord ? chordDisplayName(chord) : '',
      evaluation: this.evaluation,
      played: this.played,
      attempts: this.attempts,
      correct: this.correct,
      streak: this.streak,
      round: Math.min(this.round, this.rounds),
      rounds: this.rounds,
      matched: state === 'correct' ? pcs.size : matched,
      total: pcs.size,
      state,
      showAnswer: this.showAnswer,
      finished: this.finished,
      stars: starsFor(this.attempts ? this.correct / this.attempts : 0, 0, 1),
      announce: this.announce,
      includeMajor: this.includeMajor,
      includeMinor: this.includeMinor,
      autoAdvance: this.autoAdvance,
    }
    this.changes.emit(this.snap)
  }
}

export { chordEquals, noteSolfege, pitchClassName }
