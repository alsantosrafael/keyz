/** FFT real de raiz 2 (in-place, iterativa). `size` precisa ser potência de 2. */
export class FFT {
  private readonly cos: Float64Array
  private readonly sin: Float64Array
  private readonly rev: Uint32Array
  readonly re: Float64Array
  readonly im: Float64Array

  constructor(readonly size: number) {
    if (size <= 0 || (size & (size - 1)) !== 0) throw new Error('size precisa ser potência de 2')
    this.cos = new Float64Array(size / 2)
    this.sin = new Float64Array(size / 2)
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size)
      this.sin[i] = Math.sin((2 * Math.PI * i) / size)
    }
    this.rev = new Uint32Array(size)
    const bits = Math.log2(size)
    for (let i = 0; i < size; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b)
      this.rev[i] = r
    }
    this.re = new Float64Array(size)
    this.im = new Float64Array(size)
  }

  /** Transforma `input` (comprimento `size`); o resultado fica em `re` e `im`. */
  forward(input: ArrayLike<number>): void {
    const { re, im, rev, size } = this
    for (let i = 0; i < size; i++) {
      re[rev[i]] = input[i]
      im[rev[i]] = 0
    }
    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1
      const step = size / len
      for (let i = 0; i < size; i += len) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = this.cos[k]
          const wi = -this.sin[k]
          const a = i + j
          const b = a + half
          const tr = re[b] * wr - im[b] * wi
          const ti = re[b] * wi + im[b] * wr
          re[b] = re[a] - tr
          im[b] = im[a] - ti
          re[a] += tr
          im[a] += ti
        }
      }
    }
  }
}
