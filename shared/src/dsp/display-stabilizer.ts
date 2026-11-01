/**
 * Estabilidade de leitura do modo Livre (SPEC): a nota exibida só muda quando a nova se mantém por
 * `holdFrames` quadros; a nota mantida após perder confiança esmaece em vez de sumir.
 */
export interface DisplayState<T> {
  value: T | null
  /** 1 = nítido; cai para 0 enquanto a confiança some (esmaecer em `fadeMs`). */
  strength: number
}

export class DisplayStabilizer<T> {
  private shown: T | null = null
  private candidate: T | null = null
  private count = 0
  private lostMs = 0

  constructor(
    private readonly equals: (a: T, b: T) => boolean = (a, b) => a === b,
    private readonly holdFrames = 3,
    private readonly fadeMs = 200,
  ) {}

  /** `dtMs` é o tempo desde o quadro anterior. `null` = sem leitura. */
  feed(reading: T | null, dtMs: number): DisplayState<T> {
    if (reading === null) {
      this.candidate = null
      this.count = 0
      this.lostMs += dtMs
      return { value: this.shown, strength: Math.max(0, 1 - this.lostMs / this.fadeMs) }
    }
    this.lostMs = 0
    if (this.shown !== null && this.equals(reading, this.shown)) {
      this.candidate = null
      this.count = 0
    } else if (this.candidate !== null && this.equals(reading, this.candidate)) {
      this.count += 1
    } else {
      this.candidate = reading
      this.count = 1
    }
    if (this.candidate !== null && this.count >= this.holdFrames) {
      this.shown = this.candidate
      this.candidate = null
      this.count = 0
    }
    return { value: this.shown, strength: 1 }
  }

  reset(): void {
    this.shown = null
    this.candidate = null
    this.count = 0
    this.lostMs = 0
  }
}
