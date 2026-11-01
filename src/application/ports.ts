import type { MicFrame } from '@keyz/shared'

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

export interface Services {
  piano: PianoPort
  feedback: FeedbackPort
  haptics: HapticsPort
  storage: StoragePort
  microphone: MicrophonePort
  midi: MidiPort
  clock: Clock
  scheduler: Scheduler
}
