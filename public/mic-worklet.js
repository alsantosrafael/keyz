// AudioWorklet: junta blocos de 128 amostras em janelas de 10 ms e envia ao Web Worker de análise.
class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.hop = Math.floor(sampleRate * 0.01)
    this.buffer = new Float32Array(this.hop)
    this.filled = 0
    this.target = null
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'connect') this.target = e.ports[0]
    }
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0]
    if (!input) return true
    let offset = 0
    while (offset < input.length) {
      const n = Math.min(input.length - offset, this.hop - this.filled)
      this.buffer.set(input.subarray(offset, offset + n), this.filled)
      this.filled += n
      offset += n
      if (this.filled === this.hop) {
        const out = this.buffer
        if (this.target) this.target.postMessage(out, [out.buffer])
        this.buffer = new Float32Array(this.hop)
        this.filled = 0
      }
    }
    return true
  }
}
registerProcessor('keyz-mic', MicProcessor)
