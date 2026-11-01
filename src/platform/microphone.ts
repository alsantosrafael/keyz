import type { MicFrame } from '@keyz/shared'
import type { MicrophonePort, MicStartResult } from '../application/ports'
import { getAudioContext, resumeAudio } from './audio'

/** Microfone: getUserMedia sem filtros → AudioWorklet (10 ms) → Web Worker (YIN e chroma). */
export class WebMicrophone implements MicrophonePort {
  readonly supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  private frameListeners = new Set<(f: MicFrame) => void>()
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private worker: Worker | null = null
  private sensitivity = 0.5

  onFrame(cb: (f: MicFrame) => void): () => void {
    this.frameListeners.add(cb)
    return () => this.frameListeners.delete(cb)
  }

  async start(): Promise<MicStartResult> {
    if (!this.supported) return { ok: false, reason: 'unsupported' }
    try {
      // Esses filtros distorcem o sinal de piano.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      })
    } catch (error) {
      const name = (error as DOMException).name
      return { ok: false, reason: name === 'NotFoundError' ? 'no-device' : 'denied' }
    }
    try {
      await resumeAudio()
      const ctx = getAudioContext()
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}mic-worklet.js`)
      this.worker = new Worker(new URL('./mic.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (e: MessageEvent<MicFrame>) => this.frameListeners.forEach((l) => l(e.data))
      const channel = new MessageChannel()
      this.worker.postMessage({ type: 'init', sampleRate: ctx.sampleRate, sensitivity: this.sensitivity, port: channel.port1 }, [channel.port1])
      this.node = new AudioWorkletNode(ctx, 'keyz-mic', { numberOfInputs: 1, numberOfOutputs: 0 })
      this.node.port.postMessage({ type: 'connect' }, [channel.port2])
      this.source = ctx.createMediaStreamSource(this.stream)
      this.source.connect(this.node)
      const track = this.stream.getAudioTracks()[0]
      return { ok: true, deviceName: track?.label || null }
    } catch (error) {
      this.stop()
      return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : String(error) }
    }
  }

  stop(): void {
    this.source?.disconnect()
    this.node?.disconnect()
    this.node?.port.close()
    this.worker?.terminate()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.source = this.node = this.worker = this.stream = null
  }

  setSensitivity(value: number): void {
    this.sensitivity = value
    this.worker?.postMessage({ type: 'sensitivity', value })
  }
  recalibrate(): void {
    this.worker?.postMessage({ type: 'recalibrate' })
  }
}
