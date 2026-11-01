import {
  type BestMark, type BestMarks, type Difficulty, type DrillConfig, type DrillOverrides, type DrillResult, NoteDrill, STORAGE_KEYS, type Stars,
  bestMarksSchema, drillOverridesSchema, drillPreset, hardestNotes, isStreakMilestone, mergeBest, noteLabel, reflexLabel, starsFor,
  type Note,
} from '@keyz/shared'
import { Emitter } from './emitter'
import type { InputHub } from './input-hub'
import type { Services } from './ports'

export type DrillScreen = 'lobby' | 'countdown' | 'round' | 'result' | 'summary'

export interface DrillSummary {
  stars: Stars
  accuracy: number
  bestStreak: number
  averageResponseTime: number | null
  hardest: Note[]
  newBest: boolean
  attempts: number
}

export interface DrillSnapshot {
  screen: DrillScreen
  paused: boolean
  /** Contagem de retomada (1 s) após a pausa. */
  resuming: boolean
  /** 3, 2, 1, 0 (= "Já!") na contagem; `null` fora dela. */
  count: number | null
  difficulty: Difficulty
  config: DrillConfig
  /** Dica no teclado (alvo marcado). */
  hint: boolean
  target: Note | null
  /** Segundos já decorridos na rodada e duração total (para o anel em CSS). */
  elapsed: number
  duration: number
  /** Muda a cada rodada; reinicia o anel. */
  roundKey: number
  /** Muda a cada resultado; dispara animações pontuais. */
  resultSeq: number
  result: DrillResult | null
  resultText: string
  reflex: 'Rápido' | null
  index: number
  total: number | null
  streak: number
  milestone: boolean
  summary: DrillSummary | null
  best: BestMarks
  announce: string
  practiceNotes: Note[] | null
}

const COUNT_STEP_MS = 1000
const RESUME_MS = 1000
const MIN_ERROR_RESULT_S = 1.2
const MIN_RESULT_S = 0.7

/** Jogo do Desafio: Lobby → Contagem → Rodada ↔ Resultado → Resumo (SPEC). */
export class DrillSession {
  readonly changes = new Emitter<DrillSnapshot>()
  private difficulty: Difficulty = 'easy'
  private overrides: Partial<Record<Difficulty, DrillOverrides>> = {}
  private best: BestMarks = {}
  private drill: NoteDrill
  private screen: DrillScreen = 'lobby'
  private countStartedAt = 0
  private count: number | null = null
  private pausedAt: number | null = null
  private pausedTotal = 0
  private resumeUntil: number | null = null
  private roundKey = 0
  private resultSeq = 0
  private summary: DrillSummary | null = null
  private announce = ''
  private practiceNotes: Note[] | null = null
  private lastCountAnnounced = -1
  private timer: number | undefined
  private unsubscribe: () => void
  private snap!: DrillSnapshot
  /** Sinal de tique já tocado nos últimos 3 s. */
  private lastTickSecond = -1

  constructor(
    private readonly hub: InputHub,
    private readonly s: Pick<Services, 'feedback' | 'haptics' | 'storage' | 'scheduler' | 'clock'>,
    private readonly getExtraTime: () => number = () => 1,
  ) {
    this.loadPersisted()
    this.drill = new NoteDrill(this.effectiveConfig())
    this.unsubscribe = hub.events.subscribe((e) => {
      if (e.type === 'on') this.noteOn(e.note)
    })
    this.publish()
  }

  get snapshot(): DrillSnapshot {
    return this.snap
  }
  dispose(): void {
    this.unsubscribe()
    this.stopTimer()
  }

  // ---- configuração ------------------------------------------------------

  private loadPersisted(): void {
    const best = bestMarksSchema.safeParse(this.s.storage.read(STORAGE_KEYS.best))
    if (best.success) this.best = best.data as BestMarks
    const raw = this.s.storage.read(STORAGE_KEYS.drill)
    if (raw && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const parsed = drillOverridesSchema.safeParse(value)
        if (parsed.success && parsed.data.difficulty === key) this.overrides[key as Difficulty] = parsed.data as DrillOverrides
      }
    }
  }

  private effectiveConfig(): DrillConfig {
    const o = this.overrides[this.difficulty]
    const preset = drillPreset(this.difficulty)
    const { hint: _hint, difficulty: _d, ...rest } = o ?? ({} as DrillOverrides)
    const merged = { ...preset, ...(rest as Partial<DrillConfig>) }
    if (this.practiceNotes) merged.onlyNotes = this.practiceNotes
    return merged
  }

  get hint(): boolean {
    return this.overrides[this.difficulty]?.hint ?? this.difficulty === 'easy'
  }

  selectDifficulty(d: Difficulty): void {
    this.difficulty = d
    this.practiceNotes = null
    this.publish()
  }

  /** Ajustes do painel "Personalizar": valem para a sessão e ficam guardados por nível. */
  customize(patch: Partial<Omit<DrillOverrides, 'difficulty'>>): void {
    const next = { ...(this.overrides[this.difficulty] ?? {}), ...patch, difficulty: this.difficulty } as DrillOverrides
    this.overrides[this.difficulty] = next
    this.s.storage.write(STORAGE_KEYS.drill, this.overrides)
    this.publish()
  }

  resetCustomization(): void {
    delete this.overrides[this.difficulty]
    this.s.storage.write(STORAGE_KEYS.drill, this.overrides)
    this.publish()
  }

  // ---- relógio da sessão -------------------------------------------------

  /** Segundos de jogo: congela na pausa e na contagem de retomada. */
  private t(): number {
    const now = this.s.clock()
    const frozen = this.pausedAt ?? now
    return (frozen - this.pausedTotal) / 1000
  }

  timeLeft(): number {
    const p = this.drill.phase
    return p.kind === 'awaiting' ? Math.max(0, p.deadline - this.t()) : 0
  }

  // ---- fluxo ---------------------------------------------------------------

  play(): void {
    const config = this.effectiveConfig()
    config.timePerNote = config.timePerNote * this.getExtraTime()
    this.drill = new NoteDrill(config)
    this.hub.releaseAll()
    this.summary = null
    this.pausedAt = null
    this.pausedTotal = 0
    this.resumeUntil = null
    this.screen = 'countdown'
    this.count = 3
    this.lastCountAnnounced = -1
    this.countStartedAt = this.s.clock()
    this.s.feedback.cue('tick')
    this.startTimer()
    this.publish()
  }

  backToLobby(): void {
    this.stopTimer()
    this.drill.stop()
    this.screen = 'lobby'
    this.count = null
    this.pausedAt = null
    this.practiceNotes = null
    this.publish()
  }

  /** "Treinar notas difíceis": sessão curta só com as notas que erraram. */
  practiceHard(): void {
    if (!this.summary || this.summary.hardest.length === 0) return
    this.practiceNotes = this.summary.hardest
    const rounds = Math.max(6, this.summary.hardest.length * 4)
    this.overrides[this.difficulty] = { ...(this.overrides[this.difficulty] ?? { difficulty: this.difficulty }), rounds } as DrillOverrides
    this.play()
    // A configuração de treino curto não fica guardada.
    delete this.overrides[this.difficulty]?.rounds
  }

  pause(): void {
    if (this.screen !== 'round' && this.screen !== 'result') return
    if (this.pausedAt !== null) return
    this.pausedAt = this.s.clock()
    this.resumeUntil = null
    this.publish()
  }

  resume(): void {
    if (this.pausedAt === null || this.resumeUntil !== null) return
    this.resumeUntil = this.s.clock() + RESUME_MS
    this.publish()
  }

  togglePause(): void {
    if (this.pausedAt === null) this.pause()
    else this.resume()
  }

  /** Pula o resultado (toque ou Enter). */
  skipResult(): void {
    if (this.screen !== 'result' || this.pausedAt !== null) return
    this.drill.advance(this.t())
    this.afterTransition()
  }

  private noteOn(midi: Note): void {
    if (this.screen !== 'round' || this.pausedAt !== null) return
    this.drill.noteOn(midi, this.t())
    this.afterTransition()
  }

  private tick(): void {
    const now = this.s.clock()
    if (this.screen === 'countdown') {
      const step = Math.floor((now - this.countStartedAt) / COUNT_STEP_MS)
      const count = 3 - step
      if (count < 0) {
        this.count = null
        this.pausedTotal = now
        this.drill.start(this.t())
        this.screen = 'round'
        this.roundKey += 1
        this.lastTickSecond = -1
        this.announceTarget()
        this.publish()
        return
      }
      if (count !== this.count) {
        this.count = count
        this.s.feedback.cue(count === 0 ? 'go' : 'tick')
        this.publish()
      }
      return
    }
    if (this.pausedAt !== null) {
      if (this.resumeUntil !== null && now >= this.resumeUntil) {
        this.pausedTotal += now - this.pausedAt
        this.pausedAt = null
        this.resumeUntil = null
        this.publish()
      }
      return
    }
    if (this.screen === 'round' || this.screen === 'result') {
      this.drill.tick(this.t())
      // Tique acelerado nos últimos 3 s.
      if (this.screen === 'round') {
        const left = this.timeLeft()
        const second = Math.ceil(left)
        if (left > 0 && left <= 3 && second !== this.lastTickSecond) {
          this.lastTickSecond = second
          this.s.feedback.cue('tick')
        }
      }
      this.afterTransition()
    }
  }

  /** Reflete mudanças da máquina de estados (resultado, nova rodada, fim). */
  private afterTransition(): void {
    const phase = this.drill.phase
    if (phase.kind === 'awaiting') {
      if (this.screen !== 'round') {
        this.screen = 'round'
        this.roundKey += 1
        this.lastTickSecond = -1
        this.announceTarget()
        this.publish()
      }
    } else if (phase.kind === 'showingResult') {
      if (this.screen !== 'result') {
        this.screen = 'result'
        this.resultSeq += 1
        this.onResult(phase.result)
        // O resultado fica o tempo suficiente para ler a resposta certa.
        const minimum = phase.result.outcome.kind === 'correct' ? MIN_RESULT_S : MIN_ERROR_RESULT_S
        if (phase.nextAt !== null) phase.nextAt = Math.max(phase.nextAt, this.t() + minimum)
        this.publish()
      }
    } else if (phase.kind === 'finished') {
      if (this.screen !== 'summary') this.finish()
    }
  }

  private onResult(r: DrillResult): void {
    const stats = this.drill.stats
    const target = noteLabel(r.target, this.effectiveConfig().accidental)
    if (r.outcome.kind === 'correct') {
      const rt = r.responseTime ?? 0
      this.announce = `Acertou, ${target}, ${rt.toFixed(1).replace('.', ',')} segundo`
      this.s.feedback.cue(isStreakMilestone(stats.streak) ? 'milestone' : 'correct')
      this.s.haptics.vibrate(10)
    } else if (r.outcome.kind === 'wrong') {
      this.announce = `Era ${target}. Você tocou ${noteLabel(r.outcome.played, this.effectiveConfig().accidental)}`
      this.s.feedback.cue('wrong')
      this.s.haptics.vibrate([20, 40, 20])
    } else {
      this.announce = `Tempo esgotado. Era ${target}`
      this.s.feedback.cue('timeout')
    }
  }

  private announceTarget(): void {
    const p = this.drill.phase
    if (p.kind === 'awaiting' && this.effectiveConfig().promptStyle !== 'staff') {
      this.announce = `Toque ${noteLabel(p.target, this.effectiveConfig().accidental)}`
    } else this.announce = 'Nova nota na partitura'
  }

  private finish(): void {
    this.stopTimer()
    const stats = this.drill.stats
    const config = this.drill.config
    const stars = starsFor(stats.accuracy, stats.averageResponseTime, config.timePerNote)
    const previous = this.best[this.difficulty]
    const mark: BestMark = { stars, bestStreak: stats.bestStreak }
    const merged = mergeBest(previous as BestMark | undefined, mark)
    // Treino de notas difíceis não mexe nas melhores marcas do nível.
    const isPractice = !!this.practiceNotes
    const newBest = !isPractice && (!previous || merged.stars > previous.stars || merged.bestStreak > previous.bestStreak)
    if (!isPractice) {
      this.best = { ...this.best, [this.difficulty]: merged }
      this.s.storage.write(STORAGE_KEYS.best, this.best)
    }
    this.summary = {
      stars,
      accuracy: stats.accuracy,
      bestStreak: stats.bestStreak,
      averageResponseTime: stats.averageResponseTime,
      hardest: hardestNotes(this.drill.history),
      newBest,
      attempts: stats.attempts,
    }
    this.screen = 'summary'
    this.announce = `Fim. ${stars} ${stars === 1 ? 'estrela' : 'estrelas'}, ${Math.round(stats.accuracy * 100)}% de acerto`
    this.publish()
  }

  private startTimer(): void {
    this.stopTimer()
    this.timer = this.s.scheduler.setInterval(() => this.tick(), 40)
  }
  private stopTimer(): void {
    if (this.timer !== undefined) this.s.scheduler.clearInterval(this.timer)
    this.timer = undefined
  }

  private publish(): void {
    const phase = this.drill.phase
    const config = this.drill.phase.kind === 'idle' && this.screen !== 'countdown' ? this.effectiveConfig() : this.drill.config
    const result = phase.kind === 'showingResult' ? phase.result : null
    const stats = this.drill.stats
    const target = phase.kind === 'awaiting' ? phase.target : result?.target ?? null
    const duration = config.timePerNote
    this.snap = {
      screen: this.screen,
      paused: this.pausedAt !== null,
      resuming: this.resumeUntil !== null,
      count: this.count,
      difficulty: this.difficulty,
      config,
      hint: this.hint,
      target,
      elapsed: phase.kind === 'awaiting' ? Math.max(0, duration - (phase.deadline - this.t())) : 0,
      duration,
      roundKey: this.roundKey,
      resultSeq: this.resultSeq,
      result,
      resultText: this.resultText(result),
      reflex: result && result.outcome.kind === 'correct' ? reflexLabel(result.responseTime) : null,
      index: Math.min(stats.attempts + (phase.kind === 'awaiting' ? 1 : 0), config.rounds ?? Infinity),
      total: config.rounds,
      streak: stats.streak,
      milestone: result?.outcome.kind === 'correct' && isStreakMilestone(stats.streak),
      summary: this.summary,
      best: this.best,
      announce: this.announce,
      practiceNotes: this.practiceNotes,
    }
    this.changes.emit(this.snap)
  }

  private resultText(r: DrillResult | null): string {
    if (!r) return ''
    const acc = this.drill.config.accidental
    const target = noteLabel(r.target, acc).replace(/\s\d+$/, '')
    if (r.outcome.kind === 'correct') return 'Acertou'
    if (r.outcome.kind === 'wrong') return `Era ${target}. Você tocou ${noteLabel(r.outcome.played, acc).replace(/\s\d+$/, '')}`
    return `Tempo esgotado. Era ${target}`
  }
}

export { type Stars }
