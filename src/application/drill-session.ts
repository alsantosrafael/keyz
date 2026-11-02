import {
  type BestMark, type BestMarks, type Chord, ChordDrill, type ChordDrillResult, type Difficulty, type DrillConfig, type DrillOverrides, type DrillResult,
  NoteDrill, STORAGE_KEYS, type Stars, bestMarksSchema, chordFullName, drillOverridesSchema, drillPreset, hardestNotes, isStreakMilestone,
  inversionName, mergeBest, noteLabel, recognizeChord, reflexLabel, solfegeName, starsFor, pitchClass,
  type Note,
} from '@keyz/shared'
import { chordVoicing } from './chord-voicing'
import { Emitter } from './emitter'
import type { InputHub } from './input-hub'
import type { Services } from './ports'

export type DrillScreen = 'lobby' | 'countdown' | 'round' | 'result' | 'summary'
/** O que a sessão pede: uma nota por vez ou um acorde por vez. */
export type DrillContent = 'notes' | 'chords'

/** Item que mais deu trabalho na sessão (nota ou acorde), com contagem para o jogador entender. */
export interface HardItem {
  label: string
  misses: number
  attempts: number
}

export interface DrillSummary {
  stars: Stars
  accuracy: number
  bestStreak: number
  averageResponseTime: number | null
  /** Notas para a pauta e para o treino (vazio no modo acordes). */
  hardest: Note[]
  /** Os itens mais difíceis com quantos erros em quantas vezes apareceram. */
  hardestDetail: HardItem[]
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
  content: DrillContent
  config: DrillConfig
  /** Dica no teclado (alvo marcado). */
  hint: boolean
  /** Nota-alvo; no modo acordes, a nota mais grave da pegada de referência. */
  target: Note | null
  /** Acorde-alvo (só no modo acordes) e a inversão pedida (0 = fundamental). */
  chord: Chord | null
  inversion: number
  /** Notas MIDI que representam o alvo no teclado e na pauta (uma nota, ou o acorde empilhado). */
  targetNotes: number[]
  /** Notas que a pessoa tocou no veredito (modo acordes). */
  playedNotes: number[]
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

/** "Dó maior (C)", ou "Dó maior (C), 1ª inversão" quando o baixo faz parte da resposta. */
const chordTargetName = (chord: Chord, inversion: number): string =>
  inversion > 0 ? `${chordFullName(chord)}, ${inversionName(inversion)}` : chordFullName(chord)

const COUNT_STEP_MS = 1000
const RESUME_MS = 1000
const MIN_ERROR_RESULT_S = 1.2
const MIN_RESULT_S = 0.7
const ANSWER_DELAY_MS = 450
const ANSWER_NOTE_MS = 700

/** Jogo do Desafio: Lobby → Contagem → Rodada ↔ Resultado → Resumo (SPEC). */
export class DrillSession {
  readonly changes = new Emitter<DrillSnapshot>()
  private difficulty: Difficulty = 'easy'
  private overrides: Partial<Record<Difficulty, DrillOverrides>> = {}
  private best: BestMarks = {}
  private drill: NoteDrill
  private chordDrill: ChordDrill
  private content: DrillContent = 'notes'
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
  private answerTimer: number | undefined

  constructor(
    private readonly hub: InputHub,
    private readonly s: Pick<Services, 'feedback' | 'haptics' | 'piano' | 'storage' | 'scheduler' | 'clock'>,
    private readonly getExtraTime: () => number = () => 1,
  ) {
    this.loadPersisted()
    this.drill = new NoteDrill(this.effectiveConfig())
    this.chordDrill = new ChordDrill(this.effectiveConfig())
    this.unsubscribe = hub.events.subscribe((e) => {
      if (this.content === 'chords') this.chordNotesChanged()
      else if (e.type === 'on') this.noteOn(e.note)
    })
    this.publish()
  }

  private get engine(): NoteDrill | ChordDrill {
    return this.content === 'chords' ? this.chordDrill : this.drill
  }

  /** Escolhe o que o Desafio pede. Vale a partir do próximo "Jogar"; não fica guardado. */
  selectContent(c: DrillContent): void {
    if (this.screen !== 'lobby' || this.content === c) return
    this.content = c
    this.practiceNotes = null
    this.publish()
  }

  private get bestKey(): keyof BestMarks {
    return (this.content === 'chords' ? `chords-${this.difficulty}` : this.difficulty) as keyof BestMarks
  }

  get snapshot(): DrillSnapshot {
    return this.snap
  }
  dispose(): void {
    this.unsubscribe()
    this.cancelAnswer()
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
    const p = this.engine.phase
    return p.kind === 'awaiting' ? Math.max(0, p.deadline - this.t()) : 0
  }

  // ---- fluxo ---------------------------------------------------------------

  play(): void {
    const config = this.effectiveConfig()
    // No modo acordes o tempo de cada rodada ainda cresce com o tamanho do acorde (ver `chordTimeFactor`).
    config.timePerNote = config.timePerNote * this.getExtraTime()
    if (this.content === 'chords') this.chordDrill = new ChordDrill(config)
    else this.drill = new NoteDrill(config)
    this.cancelAnswer()
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
    this.cancelAnswer()
    this.stopTimer()
    this.drill.stop()
    this.chordDrill.stop()
    this.screen = 'lobby'
    this.count = null
    this.pausedAt = null
    this.practiceNotes = null
    this.publish()
  }

  /** "Treinar notas difíceis": sessão curta só com as notas que erraram. */
  practiceHard(): void {
    if (this.content !== 'notes' || !this.summary || this.summary.hardest.length === 0) return
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
    this.engine.advance(this.t())
    this.afterTransition()
  }

  /** Modo acordes: todas as teclas pressionadas agora vão para a máquina de estados. */
  private chordNotesChanged(): void {
    if ((this.screen !== 'round' && this.screen !== 'result') || this.pausedAt !== null) return
    // O microfone não sabe qual nota está no baixo: com ele a inversão não é exigida.
    const checkBass = !this.hub.activeNotes.some((n) => this.hub.active.get(n) === 'mic')
    this.chordDrill.notesChanged(this.hub.activeNotes, this.t(), { checkBass })
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
        this.engine.start(this.t())
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
      this.engine.tick(this.t())
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
    const phase = this.engine.phase
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
        this.onResult(this.resultOf(phase.result))
        // O resultado fica o tempo suficiente para ler a resposta certa.
        const minimum = phase.result.outcome.kind === 'correct' ? MIN_RESULT_S : MIN_ERROR_RESULT_S
        if (phase.nextAt !== null) phase.nextAt = Math.max(phase.nextAt, this.t() + minimum)
        this.publish()
      }
    } else if (phase.kind === 'finished') {
      if (this.screen !== 'summary') this.finish()
    }
  }

  /** Resultado no formato comum: no modo acordes, o alvo é a nota mais grave da pegada de referência. */
  private resultOf(r: DrillResult | ChordDrillResult): DrillResult {
    if ('chord' in r) return { target: chordVoicing(r.chord, r.inversion)[0], outcome: r.outcome, responseTime: r.responseTime }
    return r
  }

  private get chordResult(): ChordDrillResult | null {
    const p = this.chordDrill.phase
    return this.content === 'chords' && p.kind === 'showingResult' ? p.result : null
  }

  private accidental() {
    return this.effectiveConfig().accidental
  }

  private targetName(r: DrillResult): string {
    const cr = this.chordResult
    return cr ? chordTargetName(cr.chord, cr.inversion) : noteLabel(r.target, this.accidental())
  }

  /** O que a pessoa tocou, por extenso: nome do acorde se reconhecível, senão as notas. */
  private playedChordText(notes: readonly number[]): string {
    const found = recognizeChord(notes)
    if (found) return chordTargetName(found.chord, found.inversion)
    const names = [...new Set(notes.map(pitchClass))].map((p) => solfegeName(p, this.accidental()))
    return names.join(', ')
  }

  private onResult(r: DrillResult): void {
    const stats = this.engine.stats
    const target = this.targetName(r)
    const cr = this.chordResult
    if (r.outcome.kind === 'correct') {
      const rt = r.responseTime ?? 0
      this.announce = `Acertou, ${target}, ${rt.toFixed(1).replace('.', ',')} segundo`
      this.s.feedback.cue(isStreakMilestone(stats.streak) ? 'milestone' : 'correct')
      this.s.haptics.vibrate(10)
    } else if (r.outcome.kind === 'wrong') {
      const played = cr ? this.playedChordText(cr.notes) : noteLabel(r.outcome.played, this.accidental())
      this.announce = `Era ${target}. Você tocou ${played}`
      this.s.feedback.cue('wrong')
      this.s.haptics.vibrate([20, 40, 20])
      this.playAnswer(r, cr)
    } else {
      this.announce = `Tempo esgotado. Era ${target}`
      this.s.feedback.cue('timeout')
      this.playAnswer(r, cr)
    }
  }

  /** Depois do erro, o piano toca a resposta certa: o ouvido aprende junto com o olho. */
  private playAnswer(r: DrillResult, cr: ChordDrillResult | null): void {
    this.cancelAnswer()
    this.answerTimer = this.s.scheduler.setTimeout(() => {
      this.answerTimer = undefined
      if (this.screen !== 'result' || this.pausedAt !== null) return
      if (cr) this.s.piano.chord(chordVoicing(cr.chord, cr.inversion))
      else {
        this.s.piano.noteOn(r.target)
        this.answerTimer = this.s.scheduler.setTimeout(() => {
          this.answerTimer = undefined
          this.s.piano.noteOff(r.target)
        }, ANSWER_NOTE_MS)
      }
    }, ANSWER_DELAY_MS)
  }

  private cancelAnswer(): void {
    if (this.answerTimer !== undefined) this.s.scheduler.clearTimeout(this.answerTimer)
    this.answerTimer = undefined
  }

  private announceTarget(): void {
    const p = this.engine.phase
    if (p.kind !== 'awaiting') return
    const staff = this.effectiveConfig().promptStyle === 'staff'
    if ('chord' in p) this.announce = staff ? 'Novo acorde na partitura' : `Toque ${chordTargetName(p.chord, p.inversion)}`
    else this.announce = staff ? 'Nova nota na partitura' : `Toque ${noteLabel(p.target, this.accidental())}`
  }

  /** Itens com mais erros (erro ou tempo esgotado), do pior para o melhor, com contagem. */
  private hardItems(limit = 3): HardItem[] {
    const stats = new Map<string, HardItem>()
    const entries: { label: string; ok: boolean }[] =
      this.content === 'chords'
        ? this.chordDrill.history.map((r) => ({ label: chordTargetName(r.chord, r.inversion), ok: r.outcome.kind === 'correct' }))
        : this.drill.history.map((r) => ({ label: noteLabel(r.target, this.accidental()), ok: r.outcome.kind === 'correct' }))
    for (const e of entries) {
      const item = stats.get(e.label) ?? { label: e.label, misses: 0, attempts: 0 }
      item.attempts += 1
      if (!e.ok) item.misses += 1
      stats.set(e.label, item)
    }
    return [...stats.values()].filter((i) => i.misses > 0).sort((a, b) => b.misses - a.misses || b.misses / b.attempts - a.misses / a.attempts).slice(0, limit)
  }

  private finish(): void {
    this.stopTimer()
    const stats = this.engine.stats
    const config = this.engine.config
    // Acordes: estrelas só pela precisão (o relógio já pesa no tempo da rodada); notas também contam a rapidez.
    const stars = this.content === 'chords' ? starsFor(stats.accuracy, 0, 1) : starsFor(stats.accuracy, stats.averageResponseTime, config.timePerNote)
    const key = this.bestKey
    const previous = this.best[key]
    const mark: BestMark = { stars, bestStreak: stats.bestStreak }
    const merged = mergeBest(previous as BestMark | undefined, mark)
    // Treino de notas difíceis não mexe nas melhores marcas do nível.
    const isPractice = !!this.practiceNotes
    const newBest = !isPractice && (!previous || merged.stars > previous.stars || merged.bestStreak > previous.bestStreak)
    if (!isPractice) {
      this.best = { ...this.best, [key]: merged }
      this.s.storage.write(STORAGE_KEYS.best, this.best)
    }
    this.summary = {
      stars,
      accuracy: stats.accuracy,
      bestStreak: stats.bestStreak,
      averageResponseTime: stats.averageResponseTime,
      hardest: this.content === 'notes' ? hardestNotes(this.drill.history, 3) : [],
      hardestDetail: this.hardItems(),
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
    const engine = this.engine
    const phase = engine.phase
    const config = phase.kind === 'idle' && this.screen !== 'countdown' ? this.effectiveConfig() : engine.config
    const chordPhase = this.content === 'chords' ? this.chordDrill.phase : null
    const cr = this.chordResult
    const result = phase.kind === 'showingResult' ? this.resultOf(phase.result) : null
    const stats = engine.stats
    const chord = chordPhase?.kind === 'awaiting' ? chordPhase.chord : cr?.chord ?? null
    const inversion = chordPhase?.kind === 'awaiting' ? chordPhase.inversion : cr?.inversion ?? 0
    const targetNotes = chord ? chordVoicing(chord, inversion) : phase.kind === 'awaiting' && 'target' in phase ? [phase.target] : result ? [result.target] : []
    const target = chord ? targetNotes[0] : phase.kind === 'awaiting' && 'target' in phase ? phase.target : result?.target ?? null
    const duration = phase.kind === 'awaiting' && 'duration' in phase ? phase.duration : config.timePerNote
    this.snap = {
      screen: this.screen,
      paused: this.pausedAt !== null,
      resuming: this.resumeUntil !== null,
      count: this.count,
      difficulty: this.difficulty,
      content: this.content,
      config,
      hint: this.hint,
      target,
      chord,
      inversion,
      targetNotes,
      playedNotes: cr?.notes ?? [],
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
    const acc = this.accidental()
    const cr = this.chordResult
    if (cr) {
      const name = chordTargetName(cr.chord, cr.inversion)
      if (r.outcome.kind === 'correct') return 'Acertou'
      if (r.outcome.kind === 'wrong') return `Era ${name}. Você tocou ${this.playedChordText(cr.notes)}`
      return `Tempo esgotado. Era ${name}`
    }
    const bare = (n: Note) => noteLabel(n, acc).replace(/\s\d+$/, '')
    // Mesma nota em outra oitava: sem a oitava a mensagem seria "Era fá. Você tocou fá".
    const sameName = r.outcome.kind === 'wrong' && bare(r.outcome.played) === bare(r.target)
    const label = (n: Note) => (sameName ? noteLabel(n, acc).replace(/\s(\d+)$/, ' (oitava $1)') : bare(n))
    const target = label(r.target)
    if (r.outcome.kind === 'correct') return 'Acertou'
    if (r.outcome.kind === 'wrong') return `Era ${target}. Você tocou ${label(r.outcome.played)}`
    return `Tempo esgotado. Era ${target}`
  }
}

export { type Stars }
