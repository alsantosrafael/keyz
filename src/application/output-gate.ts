import type { Clock } from './ports'

/** Cauda depois que o som do app termina: a reverberação ainda chega ao microfone. */
const TAIL_MS = 600
/** Nota presa sem `noteOff` (tecla que não soltou, foco perdido) não silencia o microfone para sempre. */
const MAX_HOLD_MS = 10_000

/**
 * Portão de saída: marca quando o próprio app está soando. Sem cancelamento de eco (o Keyz
 * desliga de propósito, para não distorcer o piano), o microfone ouve os sons do app e os
 * transforma em notas, e o app reage a essas notas com mais som: um laço. Enquanto o portão
 * está fechado, o microfone não gera notas.
 */
export class OutputGate {
  private held = new Map<number, number>()
  private until = 0

  constructor(private readonly clock: Clock) {}

  noteOn(midi: number): void {
    this.held.set(midi, this.clock())
  }

  noteOff(midi: number): void {
    if (this.held.delete(midi)) this.until = Math.max(this.until, this.clock() + TAIL_MS)
  }

  /** Um som de duração conhecida (cue de feedback, acorde do tutorial). */
  pulse(ms: number): void {
    this.until = Math.max(this.until, this.clock() + ms)
  }

  get busy(): boolean {
    const now = this.clock()
    for (const [midi, since] of [...this.held]) {
      if (now - since > MAX_HOLD_MS) this.held.delete(midi)
    }
    return this.held.size > 0 || now < this.until
  }
}
