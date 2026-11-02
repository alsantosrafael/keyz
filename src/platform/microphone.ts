import { ETAPA_ENTRADA, FONTE_ENTRADA } from '@keyz/shared'
import type { MicFrame } from '@keyz/shared'
import type { MicrophonePort, MicStartResult, TelemetryPort } from '../application/ports'
import { eventoDeEntrada } from '../application/telemetry'
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

  constructor(private readonly telemetry?: TelemetryPort) {}

  onFrame(cb: (f: MicFrame) => void): () => void {
    this.frameListeners.add(cb)
    return () => this.frameListeners.delete(cb)
  }

  /** Geração de `start`/`stop`: um start que termina depois de um `stop` (ou de outro `start`) solta o que criou e sai. */
  private gen = 0
  private lostListeners = new Set<() => void>()

  /** O dispositivo sumiu no meio do uso (USB desconectado, permissão revogada). */
  onLost(cb: () => void): () => void {
    this.lostListeners.add(cb)
    return () => this.lostListeners.delete(cb)
  }

  async start(): Promise<MicStartResult> {
    if (!this.supported) return { ok: false, reason: 'unsupported' }
    this.stop() // começa do zero: solta o que uma chamada anterior deixou
    const gen = this.gen
    const current = () => gen === this.gen
    const cancelled: MicStartResult = { ok: false, reason: 'failed', message: 'Início cancelado.' }
    let stream: MediaStream
    try {
      // Esses filtros distorcem o sinal de piano.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      })
    } catch (error) {
      if (!current()) return cancelled
      const name = (error as DOMException).name
      this.telemetry?.record(eventoDeEntrada(FONTE_ENTRADA.mic, ETAPA_ENTRADA.request, name ?? 'desconhecido'))
      return { ok: false, reason: name === 'NotFoundError' ? 'no-device' : 'denied' }
    }
    if (!current()) {
      stream.getTracks().forEach((t) => t.stop())
      return cancelled
    }
    let worker: Worker | null = null
    let node: AudioWorkletNode | null = null
    let source: MediaStreamAudioSourceNode | null = null
    try {
      await resumeAudio()
      const ctx = getAudioContext()
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}mic-worklet.js`)
      worker = new Worker(new URL('./mic.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<MicFrame>) => this.frameListeners.forEach((l) => l(e.data))
      // Erro no worker não tinha registro: agora sai como `input.failure` (o comportamento continua o mesmo).
      worker.onerror = (e) => this.telemetry?.record(eventoDeEntrada(FONTE_ENTRADA.mic, ETAPA_ENTRADA.worker, 'WorkerError', e.message))
      worker.onmessageerror = () => this.telemetry?.record(eventoDeEntrada(FONTE_ENTRADA.mic, ETAPA_ENTRADA.worker, 'MessageError'))
      const channel = new MessageChannel()
      worker.postMessage({ type: 'init', sampleRate: ctx.sampleRate, sensitivity: this.sensitivity, port: channel.port1 }, [channel.port1])
      node = new AudioWorkletNode(ctx, 'keyz-mic', { numberOfInputs: 1, numberOfOutputs: 0 })
      node.port.postMessage({ type: 'connect' }, [channel.port2])
      source = ctx.createMediaStreamSource(stream)
      source.connect(node)
      if (!current()) throw new Error('Início cancelado.')
      this.stream = stream
      this.worker = worker
      this.node = node
      this.source = source
      const track = stream.getAudioTracks()[0]
      if (track)
        track.onended = () => {
          this.telemetry?.record(eventoDeEntrada(FONTE_ENTRADA.mic, ETAPA_ENTRADA.trackEnded, 'track.ended'))
          this.lostListeners.forEach((l) => l())
        }
      return { ok: true, deviceName: track?.label || null }
    } catch (error) {
      source?.disconnect()
      node?.disconnect()
      node?.port.close()
      worker?.terminate()
      stream.getTracks().forEach((t) => t.stop())
      if (!current()) return cancelled
      const mensagem = error instanceof Error ? error.message : String(error)
      this.telemetry?.record(eventoDeEntrada(FONTE_ENTRADA.mic, ETAPA_ENTRADA.request, error instanceof Error ? error.name : 'desconhecido', mensagem))
      return { ok: false, reason: 'failed', message: mensagem }
    }
  }

  stop(): void {
    this.gen += 1
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
