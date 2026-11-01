import { Emitter } from './emitter'

export type InputSource = 'screen' | 'computer' | 'midi' | 'mic'

export interface HubEvent {
  type: 'on' | 'off' | 'clear'
  note: number
  source: InputSource
  /** Muda a cada `on`, mesmo se a nota se repetir. */
  serial: number
  /** `performance.now()` em ms. */
  at: number
}

/**
 * Une teclado na tela, teclado do computador, MIDI e microfone em eventos de nota.
 * A mesma nota pressionada por duas fontes só solta quando as duas soltam.
 * Os ouvintes rodam de forma síncrona: a tecla muda no mesmo quadro do evento.
 */
export class InputHub {
  readonly events = new Emitter<HubEvent>()
  private holders = new Map<number, Set<InputSource>>()
  private serial = 0
  /** Fonte que causou o último `on` por nota (para a tecla mostrar a variante suave do microfone). */
  private lastSource = new Map<number, InputSource>()
  latch = false

  constructor(private readonly now: () => number = () => performance.now()) {}

  get active(): ReadonlyMap<number, InputSource> {
    return this.lastSource
  }
  get activeNotes(): number[] {
    return [...this.holders.keys()].sort((a, b) => a - b)
  }
  isActive(note: number): boolean {
    return this.holders.has(note)
  }

  press(note: number, source: InputSource): void {
    let set = this.holders.get(note)
    if (!set) this.holders.set(note, (set = new Set()))
    set.add(source)
    this.lastSource.set(note, source)
    this.events.emit({ type: 'on', note, source, serial: ++this.serial, at: this.now() })
  }

  release(note: number, source: InputSource): void {
    const set = this.holders.get(note)
    if (!set || !set.has(source)) return
    set.delete(source)
    if (set.size > 0) return
    this.holders.delete(note)
    this.lastSource.delete(note)
    this.events.emit({ type: 'off', note, source, serial: this.serial, at: this.now() })
  }

  /** Modo "segurar teclas": um toque liga, outro desliga. */
  toggle(note: number, source: InputSource): void {
    if (this.holders.get(note)?.has(source)) this.release(note, source)
    else this.press(note, source)
  }

  /** Entrada de ponteiro/teclado respeitando o latch dos ajustes. */
  tap(note: number, source: InputSource, down: boolean): void {
    if (this.latch) {
      if (down) this.toggle(note, source)
    } else if (down) this.press(note, source)
    else this.release(note, source)
  }

  releaseSource(source: InputSource): void {
    for (const [note, set] of [...this.holders]) if (set.has(source)) this.release(note, source)
  }

  releaseAll(): void {
    for (const [note, set] of [...this.holders]) for (const s of [...set]) this.release(note, s)
  }
}

/** Teclado do computador: A–L brancas, W E T Y U O P pretas; Z e X mudam a oitava. */
const WHITE_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL']
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12, 14]
const BLACK_KEYS: Record<string, number> = { KeyW: 1, KeyE: 3, KeyT: 6, KeyY: 8, KeyU: 10, KeyO: 13, KeyP: 15 }

export function computerKeyOffset(code: string): number | null {
  const white = WHITE_KEYS.indexOf(code)
  if (white >= 0) return WHITE_OFFSETS[white]
  return code in BLACK_KEYS ? BLACK_KEYS[code] : null
}

/** Letra impressa na tecla (para o ajuste "Mostrar atalhos"), dado o offset a partir do Dó base. */
export function computerKeyLabel(offset: number): string | null {
  const white = WHITE_OFFSETS.indexOf(offset)
  if (white >= 0) return WHITE_KEYS[white].replace('Key', '')
  const black = Object.entries(BLACK_KEYS).find(([, o]) => o === offset)
  return black ? black[0].replace('Key', '') : null
}

export const baseNoteForOctave = (octave: number): number => 12 * (octave + 1)
