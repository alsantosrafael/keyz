import {
  type Accidental, chordDisplayName, inversionName, noteFrequency, noteLabel, noteName, noteSolfege, notePitchClass, recognizeChord,
} from '@keyz/shared'
import { Emitter } from './emitter'
import type { InputHub, InputSource } from './input-hub'

export type FreeShown =
  | { kind: 'note'; midi: number; name: string; octave: string; hz: number }
  | { kind: 'chord'; name: string; inversion: string; midis: number[] }
  | { kind: 'notes'; names: string[]; midis: number[] }

export interface FreeEntry {
  id: number
  label: string
  midis: number[]
}
export interface TrailBlock {
  id: number
  midi: number
  /** `performance.now()` em ms. */
  start: number
  end: number | null
  soft: boolean
}

export interface FreeSnapshot {
  active: number[]
  shown: FreeShown | null
  /** A tecla foi solta: o display mantém a última leitura, em tom apagado. */
  held: boolean
  /** Última leitura veio do microfone (aproximada). */
  fromMic: boolean
  history: FreeEntry[]
  announce: string
}

const HISTORY = 12
export const TRAIL_LIFETIME_MS = 8000

/** Passagem de nota do modo Livre: o display nunca apaga, só aquieta. */
export class FreeSession {
  readonly changes = new Emitter<FreeSnapshot>()
  accidental: Accidental = 'sharp'
  trail: TrailBlock[] = []
  private snap: FreeSnapshot = { active: [], shown: null, held: false, fromMic: false, history: [], announce: '' }
  private entryId = 0
  private blockId = 0
  private openBlocks = new Map<number, TrailBlock>()
  private newGesture = true
  private unsubscribe: () => void

  constructor(
    private readonly hub: InputHub,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.unsubscribe = hub.events.subscribe((e) => {
      if (e.type === 'on') this.onNote(e.note, e.source)
      else if (e.type === 'off') this.offNote(e.note)
    })
  }

  get snapshot(): FreeSnapshot {
    return this.snap
  }
  dispose(): void {
    this.unsubscribe()
  }

  setAccidental(a: Accidental): void {
    this.accidental = a
    this.refresh(this.snap.fromMic ? 'mic' : 'screen', false)
  }

  /** "Limpar": volta ao estado vazio. */
  clear(): void {
    this.trail = []
    this.openBlocks.clear()
    this.newGesture = true
    this.snap = { active: this.hub.activeNotes, shown: null, held: false, fromMic: false, history: [], announce: '' }
    this.changes.emit(this.snap)
  }

  pruneTrail(now = this.now()): void {
    this.trail = this.trail.filter((b) => (b.end ?? now) > now - TRAIL_LIFETIME_MS)
  }

  private onNote(note: number, source: InputSource): void {
    const start = this.now()
    const block: TrailBlock = { id: ++this.blockId, midi: note, start, end: null, soft: source === 'mic' }
    this.openBlocks.set(note, block)
    this.trail.push(block)
    this.pruneTrail(start)
    this.refresh(source, true)
  }

  private offNote(note: number): void {
    const block = this.openBlocks.get(note)
    if (block) {
      block.end = this.now()
      this.openBlocks.delete(note)
    }
    this.refresh(this.snap.fromMic ? 'mic' : 'screen', false)
  }

  private refresh(source: InputSource, pressed: boolean): void {
    const active = this.hub.activeNotes
    if (active.length === 0) {
      // Soltou: mantém a última leitura, apagada.
      this.newGesture = true
      this.snap = { ...this.snap, active, held: this.snap.shown !== null }
      this.changes.emit(this.snap)
      return
    }
    const shown = this.describe(active)
    let history = this.snap.history
    const entry: FreeEntry = { id: this.entryId, label: this.labelFor(shown), midis: active }
    if (this.newGesture && pressed) {
      entry.id = ++this.entryId
      history = [...history, entry].slice(-HISTORY)
      this.newGesture = false
    } else if (history.length > 0 && !this.newGesture) {
      entry.id = history[history.length - 1].id
      history = [...history.slice(0, -1), entry]
    }
    this.snap = {
      active,
      shown,
      held: false,
      fromMic: source === 'mic',
      history,
      announce: this.announcement(shown),
    }
    this.changes.emit(this.snap)
  }

  private describe(active: number[]): FreeShown {
    if (active.length === 1) {
      const midi = active[0]
      const full = noteSolfege(midi, this.accidental)
      const octave = String(Math.floor(midi / 12) - 1)
      return { kind: 'note', midi, name: full.slice(0, full.length - octave.length), octave, hz: noteFrequency(midi) }
    }
    const recognized = recognizeChord(active)
    if (recognized) {
      const chord = { ...recognized.chord, accidental: this.accidental }
      return { kind: 'chord', name: chordDisplayName(chord), inversion: inversionName(recognized.inversion), midis: active }
    }
    // Acorde não reconhecido: as notas em ordem, sem mensagem de erro.
    return { kind: 'notes', names: active.map((m) => noteLabel(m, this.accidental)), midis: active }
  }

  private labelFor(shown: FreeShown): string {
    if (shown.kind === 'note') return `${shown.name} ${shown.octave}`
    if (shown.kind === 'chord') return shown.name
    return shown.names.join(' ')
  }

  private announcement(shown: FreeShown): string {
    if (shown.kind === 'note') return `${shown.name} ${shown.octave}`
    if (shown.kind === 'chord') return `${shown.name}, ${shown.inversion}`
    return shown.names.join(', ')
  }
}

export { noteName, notePitchClass }
