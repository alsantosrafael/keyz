import type { InputHub } from './input-hub'
import type { PianoPort } from './ports'

/** A nota tocada vem do piano. O microfone não soa: o piano de verdade já está soando. */
export function connectSound(hub: InputHub, piano: PianoPort): () => void {
  // O som entra depois da pintura da tecla: o visual nunca espera o áudio (SPEC › princípio 1).
  return hub.events.subscribe((e) => {
    if (e.source === 'mic') return
    if (e.type === 'on') queueMicrotask(() => piano.noteOn(e.note))
    else if (e.type === 'off') queueMicrotask(() => piano.noteOff(e.note))
  })
}
