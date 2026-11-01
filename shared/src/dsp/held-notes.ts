import { type PitchClass, pitchClass } from '../music/pitch-class'

/**
 * Notas tocadas desde que a mão encostou nas teclas. Acumula em vez de usar só o instante atual:
 * no piano (e no microfone) a quinta ou a fundamental somem enquanto o som decai.
 */
export class HeldNotes {
  /** Acumulado desde a última vez que a mão saiu das teclas. */
  notes = new Set<number>()
  /** Classes descartadas nesta pegada: não voltam a contar até soltar a mão. */
  private discarded = new Set<PitchClass>()

  /** Passe as notas pressionadas agora. Retorna o acumulado; sem teclas, a pegada termina. */
  update(pressed: Iterable<number>): Set<number> {
    const list = [...pressed]
    if (list.length === 0) {
      this.notes = new Set()
      this.discarded = new Set()
    } else {
      for (const n of list) if (!this.discarded.has(pitchClass(n))) this.notes.add(n)
    }
    return new Set(this.notes)
  }

  /** Descarta classes julgadas erradas, para a nova tentativa poder fechar. */
  discard(pitchClasses: Iterable<PitchClass>): void {
    const set = new Set(pitchClasses)
    for (const p of set) this.discarded.add(p)
    this.notes = new Set([...this.notes].filter((n) => !set.has(pitchClass(n))))
  }
}
