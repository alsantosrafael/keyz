import { type MicFrame, type PitchClass, type DetectedNote, pitchClass } from '@keyz/shared'
import type { InputHub } from './input-hub'
import type { Clock, MicrophonePort, Scheduler } from './ports'
import { Emitter } from './emitter'
import type { OutputGate } from './output-gate'

export type MicStatus =
  | { kind: 'off' }
  | { kind: 'starting' }
  | { kind: 'denied' }
  | { kind: 'unsupported' }
  | { kind: 'no-device' }
  | { kind: 'interrupted' }
  | { kind: 'failed'; message: string }
  | { kind: 'no-audio' }
  | { kind: 'blocked' }
  | { kind: 'silence' }
  | { kind: 'hearing' }
  | { kind: 'noisy' }
  | { kind: 'note'; note: number }
  | { kind: 'chord'; pitchClasses: PitchClass[] }

/** Estado da calibração de ruído, para dar retorno claro na tela. */
export type CalibrationState =
  | { kind: 'idle' }
  | { kind: 'running'; progress: number }
  | { kind: 'done'; level: 'quiet' | 'moderate' | 'loud' }

/** Ruído médio (RMS) durante a calibração: abaixo de `QUIET` é sala silenciosa; acima de `LOUD`, calibrar de novo. */
const NOISE_QUIET = 0.008
const NOISE_LOUD = 0.03

export const noiseLevelFor = (rms: number): 'quiet' | 'moderate' | 'loud' => (rms < NOISE_QUIET ? 'quiet' : rms < NOISE_LOUD ? 'moderate' : 'loud')

export interface MicSnapshot {
  status: MicStatus
  deviceName: string | null
  /** 0..1, nível suavizado para o medidor. */
  level: number
  stable: DetectedNote | null
  /** Ruído alto: energia espalhada sem nota confirmada por vários quadros. */
  noisy: boolean
  calibration: CalibrationState
}

/** Tempo sem nota antes de soltar a tecla: curto para acompanhar, longo para falhas momentâneas. */
const RELEASE_DELAY = 150
/** Tempo que um novo estado precisa se sustentar para aparecer na pílula. */
const STATUS_HOLD = 150
const SNAPSHOT_INTERVAL = 1000 / 30

/** Porta de `NoteInputHub.handle` (Swift): transforma quadros do microfone em notas no InputHub. */
export class MicController {
  readonly changes = new Emitter<MicSnapshot>()
  /** Reconhecer acordes. Acordes/Livre ligam; o Desafio desliga para um harmônico forte não virar segunda nota. */
  chords = true
  private snap: MicSnapshot = { status: { kind: 'off' }, deviceName: null, level: 0, stable: null, noisy: false, calibration: { kind: 'idle' } }
  private enabled = false
  private notes = new Set<number>()
  private chordActive = false
  private lastEvidenceAt: number | null = null
  private lastPublished = 0
  private pendingStatus: MicStatus | null = null
  private pendingSince = 0
  private zeroFrames = 0
  private pendingAttack = false
  private lastFrameAt: number | null = null
  private startedAt = 0
  private noisyFrames = 0
  private watchdog: number | undefined
  private unsubscribe: (() => void) | null = null
  private lostUnsub: (() => void) | null = null
  /** Cada chamada de `setEnabled` ganha um número; respostas de chamadas antigas são descartadas. */
  private generation = 0

  constructor(
    private readonly hub: InputHub,
    private readonly mic: MicrophonePort,
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
    /** Enquanto o app está soando, o microfone não gera notas (evita o laço com o próprio som). */
    private readonly gate?: OutputGate,
  ) {}

  get snapshot(): MicSnapshot {
    return this.snap
  }
  get isEnabled(): boolean {
    return this.enabled
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const generation = ++this.generation
    if (!enabled) {
      this.stop()
      this.set({ status: { kind: 'off' }, deviceName: null, level: 0, stable: null, noisy: false, calibration: { kind: 'idle' } })
      return
    }
    this.set({ ...this.snap, status: { kind: 'starting' } })
    const result = await this.mic.start()
    // Desligado ou religado enquanto a permissão estava pendente: esta resposta não vale mais.
    if (generation !== this.generation) return
    if (!result.ok) {
      const status: MicStatus =
        result.reason === 'failed' ? { kind: 'failed', message: result.message ?? 'Falha ao iniciar o áudio.' } : { kind: result.reason }
      this.set({ ...this.snap, status })
      return
    }
    this.enabled = true
    this.startedAt = this.clock()
    this.lastFrameAt = null
    this.zeroFrames = 0
    this.unsubscribe?.()
    this.unsubscribe = this.mic.onFrame((f) => this.handle(f))
    this.lostUnsub?.()
    this.lostUnsub = this.mic.onLost?.(() => this.interrupted()) ?? null
    this.runWatchdog()
    this.set({ ...this.snap, deviceName: result.deviceName, status: { kind: 'silence' } })
  }

  setSensitivity(value: number): void {
    this.mic.setSensitivity(Math.min(Math.max(value, 0), 1))
  }
  recalibrate(): void {
    if (!this.enabled) return
    this.mic.recalibrate()
    // Retorno imediato: o primeiro quadro só chega depois de alguns milissegundos.
    this.set({ ...this.snap, calibration: { kind: 'running', progress: 0 } })
  }

  /** O sistema tirou o microfone (troca de aba, ligação, bloqueio da tela): não é falta de aparelho. */
  private interrupted(): void {
    this.stop()
    this.set({ status: { kind: 'interrupted' }, deviceName: null, level: 0, stable: null, noisy: false, calibration: { kind: 'idle' } })
  }

  private stop(): void {
    this.enabled = false
    this.unsubscribe?.()
    this.unsubscribe = null
    this.lostUnsub?.()
    this.lostUnsub = null
    if (this.watchdog !== undefined) this.scheduler.clearInterval(this.watchdog)
    this.mic.stop()
    this.releaseNotes()
  }

  /** Detecta quando o áudio para de chegar (nenhum quadro é entregue nesse caso). */
  private runWatchdog(): void {
    this.watchdog = this.scheduler.setInterval(() => {
      if (!this.enabled) return
      const reference = this.lastFrameAt ?? this.startedAt
      if (this.clock() - reference > 1500 && this.snap.status.kind !== 'no-audio') this.set({ ...this.snap, status: { kind: 'no-audio' } })
    }, 500)
  }

  handle(frame: MicFrame): void {
    if (!this.enabled) return
    const now = this.clock()
    this.lastFrameAt = now
    if (frame.calibration) {
      const { progress, noiseLevel } = frame.calibration
      this.set({ ...this.snap, calibration: progress >= 1 ? { kind: 'done', level: noiseLevelFor(noiseLevel) } : { kind: 'running', progress } })
    }
    const muted = this.gate?.busy ?? false
    this.zeroFrames = frame.peak === 0 ? this.zeroFrames + 1 : 0
    // Os estabilizadores recomeçam no ataque, então a confirmação chega alguns quadros depois.
    if (frame.attack) this.pendingAttack = true

    if (muted) {
      this.releaseNotes()
      this.lastEvidenceAt = null
    } else if (this.chords && frame.chord) {
      // Acorde: sem oitava confiável, as notas vão para a oitava do Dó central.
      this.lastEvidenceAt = now
      this.setNotes(new Set(frame.chord.map((p) => 60 + p)), true)
    } else if (frame.stable && !(this.chords && frame.spectrumNotes.length >= 2)) {
      // Nota solta (o YIN acerta a oitava). Com várias notas no espectro, a leitura do YIN não vale.
      this.lastEvidenceAt = now
      this.setNotes(new Set([frame.stable.note]), false)
    } else if (this.lastEvidenceAt !== null && now - this.lastEvidenceAt >= RELEASE_DELAY) {
      this.releaseNotes()
      this.lastEvidenceAt = null
    }

    // Ruído alto: som presente, espectro cheio e nada confirmado por ~0,5 s.
    this.noisyFrames = frame.level > 0.02 && frame.spectrumNotes.length >= 4 && !frame.stable && !frame.chord ? this.noisyFrames + 1 : 0
    const noisy = this.noisyFrames > 50

    const rawStatus = muted ? { kind: 'hearing' as const } : this.statusFor(frame, noisy)
    this.holdStatus(rawStatus, now)
    if (now - this.lastPublished >= SNAPSHOT_INTERVAL) {
      this.lastPublished = now
      this.set({ ...this.snap, level: Math.min(1, frame.level * 8), stable: frame.stable, noisy })
    }
  }

  private statusFor(frame: MicFrame, noisy: boolean): MicStatus {
    if (this.zeroFrames >= 10) return { kind: 'blocked' }
    if (this.chordActive && this.notes.size > 0) return { kind: 'chord', pitchClasses: [...this.notes].map(pitchClass) }
    if (frame.stable) return { kind: 'note', note: frame.stable.note }
    if (noisy) return { kind: 'noisy' }
    return frame.level < 0.002 ? { kind: 'silence' } : { kind: 'hearing' }
  }

  /** O status oscila perto dos limiares: só troca o que aparece depois de se sustentar. */
  private holdStatus(raw: MicStatus, now: number): void {
    if (JSON.stringify(raw) === JSON.stringify(this.snap.status)) {
      this.pendingStatus = null
      return
    }
    if (!this.pendingStatus || JSON.stringify(raw) !== JSON.stringify(this.pendingStatus)) {
      this.pendingStatus = raw
      this.pendingSince = now
      return
    }
    if (now - this.pendingSince >= STATUS_HOLD) {
      this.pendingStatus = null
      this.set({ ...this.snap, status: raw })
    }
  }

  private setNotes(notes: Set<number>, chord: boolean): void {
    const same = notes.size === this.notes.size && [...notes].every((n) => this.notes.has(n))
    if (same && !this.pendingAttack) return
    this.pendingAttack = false
    this.releaseNotes()
    this.notes = notes
    this.chordActive = chord
    for (const n of [...notes].sort((a, b) => a - b)) this.hub.press(n, 'mic')
  }

  private releaseNotes(): void {
    for (const n of this.notes) this.hub.release(n, 'mic')
    this.notes = new Set()
    this.chordActive = false
  }

  private set(next: MicSnapshot): void {
    this.snap = next
    this.changes.emit(next)
  }
}
