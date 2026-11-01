import { parseMidiMessage } from '@keyz/shared'
import type { MidiPort, MidiStatus } from '../application/ports'

/** Web MIDI (Chromium). Cada mensagem passa por Zod antes de chegar à aplicação. */
export class WebMidi implements MidiPort {
  readonly supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
  private noteListeners = new Set<Parameters<MidiPort['onNote']>[0]>()
  private deviceListeners = new Set<(names: string[]) => void>()
  private access: MIDIAccess | null = null

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
    for (const input of this.access.inputs.values()) {
      if (input.state === 'disconnected') continue
      names.push(input.name ?? 'MIDI')
      input.onmidimessage = (e) => {
        const ev = parseMidiMessage(e.data)
        if (ev.kind === 'on') this.noteListeners.forEach((l) => l('on', ev.note, ev.velocity / 127))
        else if (ev.kind === 'off') this.noteListeners.forEach((l) => l('off', ev.note, 0))
      }
    }
    this.deviceListeners.forEach((l) => l(names))
  }
}
