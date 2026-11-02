import type { MicFrame, Report } from '@keyz/shared'

/** Portas que a camada `platform` implementa. `application` nunca importa o navegador. */
export type Cue = 'correct' | 'wrong' | 'timeout' | 'star' | 'tick' | 'go' | 'milestone'

export interface PianoPort {
  noteOn(midi: number, velocity?: number): void
  noteOff(midi: number): void
  chord(midis: number[]): void
  resume(): Promise<void>
  setEnabled(on: boolean): void
  setVolume(v: number): void
}
export interface FeedbackPort {
  cue(kind: Cue, step?: number): void
  setEnabled(on: boolean): void
}
export interface HapticsPort {
  vibrate(pattern: number | number[]): void
  enabled: boolean
}
export interface StoragePort {
  read(key: string): unknown
  write(key: string, value: unknown): void
}

export type MicStartResult =
  | { ok: true; deviceName: string | null }
  | { ok: false; reason: 'unsupported' | 'denied' | 'no-device' | 'failed'; message?: string }

export interface MicrophonePort {
  readonly supported: boolean
  start(): Promise<MicStartResult>
  stop(): void
  onFrame(cb: (f: MicFrame) => void): () => void
  /** O microfone parou durante o uso (o sistema interrompeu ou o aparelho saiu). */
  onLost?(cb: () => void): () => void
  setSensitivity(v: number): void
  recalibrate(): void
}

export type MidiStatus = 'ready' | 'unsupported' | 'denied'
export interface MidiPort {
  readonly supported: boolean
  start(): Promise<MidiStatus>
  onNote(cb: (kind: 'on' | 'off', note: number, velocity: number) => void): () => void
  onDevices(cb: (names: string[]) => void): () => void
}

/** Relógio em milissegundos (`performance.now()` na produção, controlável nos testes). */
export type Clock = () => number
export interface Scheduler {
  setTimeout(fn: () => void, ms: number): number
  clearTimeout(id: number): void
  setInterval(fn: () => void, ms: number): number
  clearInterval(id: number): void
}

export type ReportResult = { ok: true; number: number | null } | { ok: false; message: string }

/** Envia um relatório de problema ao serviço que abre a issue. */
export interface ReportPort {
  submit(report: Report): Promise<ReportResult>
}

export interface Services {
  /** Portão de saída: o microfone ignora o que o próprio app está tocando (ver `output-gate.ts`). */
  outputGate?: import('./output-gate').OutputGate
  piano: PianoPort
  feedback: FeedbackPort
  haptics: HapticsPort
  storage: StoragePort
  microphone: MicrophonePort
  midi: MidiPort
  reports: ReportPort
  clock: Clock
  scheduler: Scheduler
}
