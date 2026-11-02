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
  /** Dica automática (sem erro contado) quando a pessoa trava; vazia se não há. */
  hint: string
  /** Resposta por extenso, enquanto "Mostrar resposta" está ligado. */
  answerText: string
  includeMajor: boolean
  includeMinor: boolean
  autoAdvance: boolean
}

/** Mão parada com notas suficientes e erradas: depois disso o erro é julgado sem precisar soltar. */
export const HOLD_VERDICT_MS = 1500
/** Sem progresso por este tempo: aparece uma dica, sem contar erro. */
export const HELP_HINT_MS = 6000
/** Depois de acertar, o próximo acorde entra neste tempo (com "Avançar sozinho"). */
const ADVANCE_MS = 1200

/**
 * Prática de acordes, com anel de progresso e resumo.
 *
 * Feedback e veredito são separados: as teclas mostram ao vivo o que está certo ou errado, sem
 * som nem penalidade; o acerto vale no instante em que as notas batem; o erro só vira veredito
 * quando a mão solta tendo tocado notas suficientes, ou quando fica parada por `HOLD_VERDICT_MS`.
 * Soltar com menos notas que o acorde é procura, não resposta: nada é contado.
 * A sessão só escuta o teclado enquanto está ativa (a tela de Acordes aberta).
 */
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
  private hint = ''
  private active = false
  /** Já houve veredito de erro nesta pegada (a mão ainda não saiu das teclas). */
  private verdictThisGrip = false
  /** Usou "Mostrar resposta" nesta rodada: a rodada não conta para a estatística. */
  private assisted = false
  private helpTimer: number | undefined
  private unsubscribe: () => void
  private snap!: ChordSnapshot

  constructor(
    private readonly hub: InputHub,
    private readonly s: Pick<Services, 'piano' | 'feedback' | 'haptics' | 'scheduler'>,
  ) {
    this.unsubscribe = hub.events.subscribe(() => this.notesChanged(hub.activeNotes))
    this.restart()
  }

  /**
   * Liga ou desliga a escuta do teclado. Ativa quando a tela de Acordes abre; inativa nas outras
   * abas e no tutorial, para tocar ali não julgar, soar nem avançar rodadas em segundo plano.
   */
  setActive(on: boolean): void {
    if (this.active === on) return
    this.active = on
    this.cancel()
    this.cancelHelp()
    this.cancelAdvance()
    if (on) {
      // Notas que já estavam presas ao entrar só voltam a contar depois de soltar.
      this.lastPressed = this.hub.activeNotes
      this.awaitingRelease = this.lastPressed.length > 0
      this.held = new HeldNotes()
      this.played = []
      this.verdictThisGrip = false
      if (this.evaluation?.isCorrect && !this.finished) this.nextChord()
      else {
        this.scheduleHelp()
        this.publish()
      }
    }
  }

  get snapshot(): ChordSnapshot {
    return this.snap
  }
  dispose(): void {
    this.unsubscribe()
    this.cancel()
    this.cancelHelp()
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
    if (on && this.chord) {
      this.assisted = true
      this.announce = `Resposta: ${this.answerText()}`
    }
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
    this.cancelHelp()
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
    this.verdictThisGrip = false
    this.assisted = false
    this.hint = ''
    this.awaitingRelease = this.lastPressed.length > 0
    this.held = new HeldNotes()
    this.played = []
    this.announce = this.chord ? `Toque ${chordDisplayName(this.chord)}` : ''
    this.scheduleHelp()
    this.publish()
  }

  /** Reage às teclas: acerto imediato; erro só ao soltar (com notas suficientes) ou com a mão parada. */
  private notesChanged(pressed: number[]): void {
    const previous = this.lastPressed
    this.lastPressed = pressed
    if (!this.active) return
    if (this.awaitingRelease) {
      if (pressed.length === 0) this.awaitingRelease = false
      return
    }
    if (this.finished) return
    this.cancel()
    this.cancelHelp()
    const chord = this.chord
    const before = new Set(this.held.notes)
    const notes = this.held.update(pressed)
    if (notes.size > 0) this.played = [...notes].sort((a, b) => a - b)
    if (!chord) return
    const size = chordPitchClasses(chord).size

    if (this.evaluation?.isCorrect) {
      // Já acertou: o avanço tem timer próprio. Soltar ou tocar mais não muda o resultado.
      if (notes.size === 0) this.verdictThisGrip = false
      this.publish()
      return
    }

    if (notes.size === 0) {
      // Soltou tudo. Com notas suficientes é uma resposta; com menos, é procura e nada é contado.
      if (!this.verdictThisGrip && before.size >= size) this.evaluate(before)
      this.verdictThisGrip = false
      this.hint = ''
      this.scheduleHelp()
      this.publish()
      return
    }

    // Nova tecla depois de um erro: o erro anterior sai da tela, é uma nova tentativa.
    if (this.evaluation && pressed.some((n) => !previous.includes(n))) {
      this.evaluation = null
      this.verdictThisGrip = false
      this.announce = `Toque ${chordDisplayName(chord)}`
    }
    this.hint = ''

    // Acerto imediato: o que está pressionado agora é exatamente o acorde (no microfone, o acumulado,
    // porque as notas decaem).
    const fromMic = pressed.some((n) => this.hub.active.get(n) === 'mic')
    const exact = evaluateChord(pressed, chord).isCorrect || (fromMic && evaluateChord(notes, chord).isCorrect)
    if (exact) {
      this.evaluate(new Set(fromMic ? notes : pressed))
      return
    }

    this.publish()
    this.scheduleHelp()
    // Mão parada com notas suficientes e erradas: julga sem exigir soltar.
    if (notes.size >= size && !this.verdictThisGrip) {
      const snapshot = new Set(notes)
      this.pending = this.s.scheduler.setTimeout(() => {
        this.pending = undefined
        this.verdictThisGrip = true
        this.evaluate(snapshot)
      }, HOLD_VERDICT_MS)
    }
  }

  private evaluate(notes: Set<number>): void {
    const chord = this.chord
    if (!chord) return
    this.cancel()
    this.cancelHelp()
    this.hint = ''
    this.played = [...notes].sort((a, b) => a - b)
    const result = evaluateChord(notes, chord)
    this.evaluation = result
    // Nota errada não atrapalha a próxima tentativa: sai do acumulado desta pegada.
    this.held.discard(result.extra)
    // Rodada com "Mostrar resposta" não entra na estatística (nem pune nem premia).
    const first = !this.judged
    if (first && !this.assisted) {
      this.judged = true
      this.attempts += 1
      if (result.isCorrect) {
        this.correct += 1
        this.streak += 1
      } else this.streak = 0
    } else if (first) this.judged = true
    if (result.isCorrect) {
      this.s.feedback.cue('correct')
      this.s.haptics.vibrate(10)
      this.s.piano.chord(this.chordMidis(chord))
      this.announce = `Acertou, ${chordDisplayName(chord)}`
      // O avanço tem timer próprio: soltar as teclas não pode cancelá-lo.
      if (this.autoAdvance) this.advanceTimer = this.s.scheduler.setTimeout(() => this.nextChord(), ADVANCE_MS)
    } else {
      this.s.feedback.cue('wrong')
      this.s.haptics.vibrate([20, 40, 20])
      const missing = [...result.missing].map((p) => solfegeName(p, chord.accidental)).join(', ')
      this.announce = missing ? `Faltou ${missing}` : 'Tem nota a mais'
      this.scheduleHelp()
    }
    this.publish()
  }

  /** Dica sem erro contado: depois de `HELP_HINT_MS` sem mudança, diz o que falta. */
  private scheduleHelp(): void {
    this.cancelHelp()
    if (!this.active || this.finished || !this.chord || this.evaluation?.isCorrect) return
    this.helpTimer = this.s.scheduler.setTimeout(() => {
      this.helpTimer = undefined
      const chord = this.chord
      if (!chord || this.evaluation?.isCorrect) return
      const names = (pcs: Iterable<number>) => [...pcs].map((p) => solfegeName(p, chord.accidental)).join(', ')
      if (this.held.notes.size === 0) this.hint = `Notas do acorde: ${names(chordOrderedPitchClasses(chord))}`
      else {
        const missing = evaluateChord(this.held.notes, chord).missing
        this.hint = missing.size > 0 ? `Falta: ${names(missing)}` : ''
      }
      if (this.hint) this.announce = this.hint
      this.publish()
    }, HELP_HINT_MS)
  }

  private answerText(): string {
    const chord = this.chord
    if (!chord) return ''
    const notes = chordOrderedPitchClasses(chord).map((p) => solfegeName(p, chord.accidental)).join(', ')
    return `${chordDisplayName(chord)}: ${notes}`
  }

  chordMidis(chord: Chord): number[] {
    return chordVoicing(chord)
  }

  private cancel(): void {
    if (this.pending !== undefined) this.s.scheduler.clearTimeout(this.pending)
    this.pending = undefined
  }

  private cancelHelp(): void {
    if (this.helpTimer !== undefined) this.s.scheduler.clearTimeout(this.helpTimer)
    this.helpTimer = undefined
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
      hint: this.hint,
      answerText: this.showAnswer ? this.answerText() : '',
      includeMajor: this.includeMajor,
      includeMinor: this.includeMinor,
      autoAdvance: this.autoAdvance,
    }
    this.changes.emit(this.snap)
  }
}

export { chordEquals, noteSolfege, pitchClassName }
