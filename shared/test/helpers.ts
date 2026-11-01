/** Gerador determinístico para testes (SplitMix64), igual ao dos testes Swift. */
export class SeededGenerator {
  private state: bigint
  private static readonly MASK = (1n << 64n) - 1n
  constructor(seed: number) {
    this.state = BigInt(seed)
  }
  next(): bigint {
    const M = SeededGenerator.MASK
    this.state = (this.state + 0x9e3779b97f4a7c15n) & M
    let z = this.state
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M
    return z ^ (z >> 31n)
  }
  /** Float em [0, 1) para NoteDrill/ChordGenerator. */
  random = (): number => Number(this.next() >> 11n) / 2 ** 53
  /** `Double(next() % 2001) / 1000 - 1`, do ruído dos testes Swift. */
  noise(): number {
    return Number(this.next() % 2001n) / 1000 - 1
  }
}

export const f32 = (a: number[]): Float32Array => Float32Array.from(a)
