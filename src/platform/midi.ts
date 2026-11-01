import { parseMidiMessage } from '@keyz/shared'
import type { MidiPort, MidiStatus } from '../application/ports'

/** Web MIDI (Chromium). Cada mensagem passa por Zod antes de chegar à aplicação. */
export class WebMidi implements MidiPort {
  readonly supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  private noteListeners = new Set<Parameters<MidiPort['onNote']>[0]>()
  private deviceListeners = new Set<(names: string[]) => void>()
  private access: MIDIAccess | null = null
  /** Notas presas por cada dispositivo: ao sumir o aparelho, essas notas são soltadas. */
  private held = new Map<string, Set<number>>()
  private known = new Set<string>()

  onNote(cb: Parameters<MidiPort['onNote']>[0]): () => void {
    this.noteListeners.add(cb)
    return () => this.noteListeners.delete(cb)
  }
  onDevices(cb: (names: string[]) => void): () => void {
    this.deviceListeners.add(cb)
    return () => this.deviceListeners.delete(cb)
  }

  async start(): Promise<MidiStatus> {
    if (!this.supported) return 'unsupported'
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false })
    } catch {
      return 'denied'
    }
    this.access.onstatechange = () => this.refresh()
    this.refresh()
    return 'ready'
  }

  private refresh(): void {
    if (!this.access) return
    const names: string[] = []
    const current = new Set<string>()
    for (const input of this.access.inputs.values()) {
      if (input.state === 'disconnected') continue
      const id = input.id
      current.add(id)
      names.push(input.name ?? 'MIDI')
      input.onmidimessage = (e) => {
        const ev = parseMidiMessage(e.data)
        if (ev.kind === 'on') {
          this.track(id, ev.note, true)
          this.noteListeners.forEach((l) => l('on', ev.note, ev.velocity / 127))
        } else if (ev.kind === 'off') {
          this.track(id, ev.note, false)
          this.noteListeners.forEach((l) => l('off', ev.note, 0))
        }
      }
    }
    // Aparelho que sumiu com notas presas: solta essas notas, senão ficam acesas e mudam o microfone.
    for (const id of this.known) if (!current.has(id)) this.releaseDevice(id)
    this.known = current
    this.deviceListeners.forEach((l) => l(names))
  }

  private track(id: string, note: number, down: boolean): void {
    const set = this.held.get(id) ?? new Set<number>()
    if (down) set.add(note)
    else set.delete(note)
    this.held.set(id, set)
  }

  private releaseDevice(id: string): void {
    for (const note of this.held.get(id) ?? []) this.noteListeners.forEach((l) => l('off', note, 0))
    this.held.delete(id)
  }
}
