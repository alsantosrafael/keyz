import { ADVANCED_CHORD_QUALITIES, CHORD_QUALITIES, type Chord, PROFESSIONAL_CHORD_QUALITIES, chordEquals, chordOrderedPitchClasses, chordPitchClasses, makeChord } from '../music/chord'
import { type PitchClass, isBlackKey, pitchClass } from '../music/pitch-class'
import { type Random, randomElement } from './chord-generator'
import { evaluateChord } from './chord-evaluator'
import { type DrillConfig } from './config'
import { DrillStats, type Outcome } from './note-drill'

/** O que a rodada pede: o acorde e, no Avançado, qual nota fica no baixo (0 = fundamental). */
export interface ChordTarget {
  chord: Chord
  inversion: number
}

/** Nota que precisa estar no baixo para o alvo valer. */
export const targetBassPitchClass = (t: ChordTarget): PitchClass => chordOrderedPitchClasses(t.chord)[t.inversion]

export interface ChordDrillResult extends ChordTarget {
  /** No erro, `played` é a nota mais grave tocada (a lista completa está em `notes`). */
  outcome: Outcome
  responseTime: number | null
  /** Notas MIDI que estavam pressionadas quando o veredito saiu. */
  notes: number[]
}

export type ChordDrillPhase =
  | { kind: 'idle' }
  /** `duration` é o tempo desta rodada (varia com o tamanho do acorde e a inversão). */
  | { kind: 'awaiting'; chord: Chord; inversion: number; deadline: number; duration: number }
  | { kind: 'showingResult'; result: ChordDrillResult; nextAt: number | null }
  | { kind: 'finished' }

/** Mão parada, com notas suficientes e erradas, por este tempo (segundos): vira erro sem precisar soltar. */
export const CHORD_HOLD_VERDICT_S = 0.9

/**
 * Acordes que podem ser sorteados. Raízes pretas só com `includeAccidentals` (Fácil: só brancas).
 * Maiores e menores em todos os níveis; o Avançado soma sétimas, sus, diminuto e aumentado; o Profissional,
 * sextas, nonas, add9, alterados, meio-diminuto e diminuto com sétima.
 */
export function chordPool(config: Pick<DrillConfig, 'difficulty' | 'includeAccidentals' | 'accidental'>): Chord[] {
  const qualities =
    config.difficulty === 'professional' ? [...CHORD_QUALITIES, ...ADVANCED_CHORD_QUALITIES, ...PROFESSIONAL_CHORD_QUALITIES]
    : config.difficulty === 'advanced' ? [...CHORD_QUALITIES, ...ADVANCED_CHORD_QUALITIES]
    : CHORD_QUALITIES
  const pool: Chord[] = []
  for (let root = 0; root < 12; root++) {
    if (!config.includeAccidentals && isBlackKey(root)) continue
    for (const quality of qualities) pool.push(makeChord(root as PitchClass, quality, config.accidental))
  }
  return pool
}

/** Inversões entram no Médio (só tríades), no Avançado e no Profissional: o baixo é parte da resposta. */
export const asksInversions = (config: Pick<DrillConfig, 'difficulty'>): boolean => config.difficulty !== 'easy'

/**
 * Tempo da rodada em múltiplos do tempo-base do nível: tríade 1,5x; sétima 2x; nona e add9 (cinco ou
 * quatro notas esticadas) 2,5x. Inversão soma 0,5x. Acordes maiores pedem mais mãos e mais leitura.
 */
export function chordTimeFactor(chord: Chord, inversion: number): number {
  const size = chordPitchClasses(chord).size
  return (size <= 3 ? 1.5 : size === 4 ? 2 : 2.5) + (inversion > 0 ? 0.5 : 0)
}

/** Peso no sorteio do Avançado: sétimas aparecem mais; nona e add9 (os mais difíceis), menos. */
const DRAW_WEIGHT: Partial<Record<Chord['quality'], number>> = {
  major: 2, minor: 2, dominant7: 3, major7: 3, minor7: 3, sus2: 2, sus4: 2, diminished: 2, augmented: 2,
  major6: 2, minor6: 2, add9: 2, halfDiminished: 2, minorMajor7: 1, diminished7: 1, dominant7sus4: 1,
  dominant9: 2, major9: 2, minor9: 2, dominant7flat9: 1, dominant7sharp9: 1,
}

/**
 * Máquina de estados do Desafio com acordes: "tocar o acorde sorteado dentro do tempo".
 * Mesmo ciclo do `NoteDrill`, sem relógio próprio. O acerto vale no instante em que as notas
 * pressionadas batem com o acorde (oitava e inversão não importam); o erro vale ao soltar com
 * notas suficientes ou com a mão parada em notas erradas.
 */
export class ChordDrill {
  phase: ChordDrillPhase = { kind: 'idle' }
  stats = new DrillStats()
  history: ChordDrillResult[] = []

  private roundStart = 0
  private last: Chord | null = null
  private pressed: number[] = []
  /** Notas que já estavam presas quando a rodada começou: só contam depois de soltar. */
  private carry = new Set<number>()
  /** Maior pegada desta tentativa, para julgar ao soltar. */
  private grip = new Set<number>()
  private suspectSince: number | null = null
  /** Microfone não sabe qual nota está no baixo: nele a inversão não é exigida. */
  private checkBass = true
  private inversionDraw = 0

  constructor(
    public config: DrillConfig,
    private readonly random: Random = Math.random,
  ) {}

  start(now: number): void {
    this.stats = new DrillStats()
    this.history = []
    this.last = null
    this.pressed = []
    this.beginRound(now)
  }

  /** Chame a cada mudança nas teclas (todas as notas pressionadas agora). */
  notesChanged(pressed: readonly number[], now: number, options: { checkBass?: boolean } = {}): void {
    this.checkBass = options.checkBass ?? true
    this.pressed = [...pressed]
    this.tick(now)
    if (this.phase.kind !== 'awaiting') return
    const target: ChordTarget = { chord: this.phase.chord, inversion: this.phase.inversion }
    const chord = target.chord
    this.carry = new Set([...this.carry].filter((n) => pressed.includes(n)))
    const live = pressed.filter((n) => !this.carry.has(n))
    const size = chordPitchClasses(chord).size

    if (live.length === 0) {
      // Soltou tudo: com notas suficientes é uma resposta; com menos, é procura.
      const grip = this.grip
      this.grip = new Set()
      this.suspectSince = null
      if (grip.size >= size) this.judge(grip, target, now)
      return
    }
    for (const n of live) this.grip.add(n)
    if (this.matches(live, target)) {
      this.judge(new Set(live), target, now)
      return
    }
    const pcs = new Set(live.map(pitchClass))
    this.suspectSince = live.length >= size && pcs.size >= size ? (this.suspectSince ?? now) : null
  }

  /** Chame periodicamente: encerra por tempo, julga mão parada e avança automaticamente. */
  tick(now: number): void {
    const phase = this.phase
    if (phase.kind === 'awaiting') {
      if (now >= phase.deadline) {
        this.finishRound({ chord: phase.chord, inversion: phase.inversion, outcome: { kind: 'timeout' }, responseTime: null, notes: [] }, phase.deadline)
      } else if (this.suspectSince !== null && now - this.suspectSince >= CHORD_HOLD_VERDICT_S) {
        const live = this.pressed.filter((n) => !this.carry.has(n))
        this.suspectSince = null
        if (live.length > 0) this.judge(new Set(live), { chord: phase.chord, inversion: phase.inversion }, now)
      }
    } else if (phase.kind === 'showingResult' && phase.nextAt !== null && now >= phase.nextAt) {
      this.beginRound(now)
    }
  }

  advance(now: number): void {
    if (this.phase.kind === 'showingResult') this.beginRound(now)
  }

  stop(): void {
    this.phase = { kind: 'idle' }
  }

  /** As notas formam o acorde e, quando pedido, a mais grave é a do baixo certo. */
  private matches(notes: readonly number[], target: ChordTarget): boolean {
    if (!evaluateChord(notes, target.chord).isCorrect) return false
    if (!this.checkBass || !asksInversions(this.config)) return true
    return pitchClass(Math.min(...notes)) === targetBassPitchClass(target)
  }

  private judge(notes: Set<number>, target: ChordTarget, now: number): void {
    const sorted = [...notes].sort((a, b) => a - b)
    const ok = this.matches(sorted, target)
    this.finishRound(
      { ...target, outcome: ok ? { kind: 'correct' } : { kind: 'wrong', played: sorted[0] }, responseTime: now - this.roundStart, notes: sorted },
      now,
    )
  }

  private beginRound(now: number): void {
    if (this.config.rounds !== null && this.stats.attempts >= this.config.rounds) {
      this.phase = { kind: 'finished' }
      return
    }
    const pool = chordPool(this.config)
    const candidates = pool.length > 1 ? pool.filter((c) => !chordEquals(c, this.last)) : pool
    const weighted = this.config.difficulty === 'advanced' || this.config.difficulty === 'professional' ? candidates.flatMap((c) => Array<Chord>(DRAW_WEIGHT[c.quality] ?? 1).fill(c)) : candidates
    const chord = randomElement(weighted, this.random)
    // Médio: inversões só de tríades. Avançado e Profissional: de qualquer acorde, até a 3ª.
    const maxInversion = chord === undefined ? 0 : this.config.difficulty !== 'medium' ? Math.min(chordPitchClasses(chord).size, 4) : chordPitchClasses(chord).size
    if (chord !== undefined) this.inversionDraw = asksInversions(this.config) ? Math.min(Math.floor(this.random() * maxInversion), 3) : 0
    if (chord === undefined) {
      this.phase = { kind: 'finished' }
      return
    }
    this.last = chord
    this.roundStart = now
    this.carry = new Set(this.pressed)
    this.grip = new Set()
    this.suspectSince = null
    const duration = this.config.timePerNote * chordTimeFactor(chord, this.inversionDraw)
    this.phase = { kind: 'awaiting', chord, inversion: this.inversionDraw, deadline: now + duration, duration }
  }

  private finishRound(result: ChordDrillResult, now: number): void {
    this.stats.record(result)
    this.history.push(result)
    this.suspectSince = null
    this.phase = { kind: 'showingResult', result, nextAt: this.config.autoAdvance ? now + this.config.pauseBetweenNotes : null }
  }
}
