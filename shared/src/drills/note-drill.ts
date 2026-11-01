import { type Note, notePitchClass } from '../music/note'
import { type Random, randomElement } from './chord-generator'
import { type DrillConfig, notePool } from './config'

export type Outcome = { kind: 'correct' } | { kind: 'wrong'; played: Note } | { kind: 'timeout' }

export interface DrillResult {
  target: Note
  outcome: Outcome
  /** Segundos entre o aparecimento da nota e a resposta; `null` se o tempo acabou. */
  responseTime: number | null
}

export const isCorrect = (r: DrillResult): boolean => r.outcome.kind === 'correct'

export class DrillStats {
  attempts = 0
  correct = 0
  wrong = 0
  timeouts = 0
  streak = 0
  bestStreak = 0
  private totalResponseTime = 0

  get accuracy(): number {
    return this.attempts === 0 ? 0 : this.correct / this.attempts
  }
  get averageResponseTime(): number | null {
    return this.correct === 0 ? null : this.totalResponseTime / this.correct
  }

  record(result: DrillResult): void {
    this.attempts += 1
    switch (result.outcome.kind) {
      case 'correct':
        this.correct += 1
        this.streak += 1
        this.bestStreak = Math.max(this.bestStreak, this.streak)
        this.totalResponseTime += result.responseTime ?? 0
        break
      case 'wrong':
        this.wrong += 1
        this.streak = 0
        break
      case 'timeout':
        this.timeouts += 1
        this.streak = 0
        break
    }
  }
}

export type DrillPhase =
  | { kind: 'idle' }
  | { kind: 'awaiting'; target: Note; deadline: number }
  /** `nextAt` é `null` quando o avanço é manual. */
  | { kind: 'showingResult'; result: DrillResult; nextAt: number | null }
  | { kind: 'finished' }

/**
 * Máquina de estados do treino "tocar a nota sorteada dentro do tempo".
 * Não usa relógio próprio: quem usa informa o tempo atual (segundos) em cada chamada.
 */
export class NoteDrill {
  phase: DrillPhase = { kind: 'idle' }
  stats = new DrillStats()
  /** Histórico da sessão, na ordem das rodadas. */
  history: DrillResult[] = []

  private roundStart = 0
  private lastTarget: Note | null = null

  constructor(
    public config: DrillConfig,
    private readonly random: Random = Math.random,
  ) {}

  start(now: number): void {
    this.stats = new DrillStats()
    this.history = []
    this.lastTarget = null
    this.beginRound(now)
  }

  /** Chame quando uma nota for tocada (MIDI ou microfone). */
  noteOn(midi: Note, now: number): void {
    this.tick(now)
    if (this.phase.kind !== 'awaiting') return
    const target = this.phase.target
    const hit = this.config.matchOctave ? midi === target : notePitchClass(midi) === notePitchClass(target)
    this.finishRound(
      { target, outcome: hit ? { kind: 'correct' } : { kind: 'wrong', played: midi }, responseTime: now - this.roundStart },
      now,
    )
  }

  /** Chame periodicamente: encerra por tempo e avança automaticamente. */
  tick(now: number): void {
    const phase = this.phase
    if (phase.kind === 'awaiting' && now >= phase.deadline) {
      this.finishRound({ target: phase.target, outcome: { kind: 'timeout' }, responseTime: null }, phase.deadline)
    } else if (phase.kind === 'showingResult' && phase.nextAt !== null && now >= phase.nextAt) {
      this.beginRound(now)
    }
  }

  /** Avanço manual (botão "próxima"). */
  advance(now: number): void {
    if (this.phase.kind === 'showingResult') this.beginRound(now)
  }

  stop(): void {
    this.phase = { kind: 'idle' }
  }

  private beginRound(now: number): void {
    if (this.config.rounds !== null && this.stats.attempts >= this.config.rounds) {
      this.phase = { kind: 'finished' }
      return
    }
    const pool = notePool(this.config)
    const candidates = pool.length > 1 ? pool.filter((n) => n !== this.lastTarget) : pool
    const target = randomElement(candidates, this.random)
    if (target === undefined) {
      this.phase = { kind: 'finished' }
      return
    }
    this.lastTarget = target
    this.roundStart = now
    this.phase = { kind: 'awaiting', target, deadline: now + this.config.timePerNote }
  }

  private finishRound(result: DrillResult, now: number): void {
    this.stats.record(result)
    this.history.push(result)
    this.phase = { kind: 'showingResult', result, nextAt: this.config.autoAdvance ? now + this.config.pauseBetweenNotes : null }
  }
}
