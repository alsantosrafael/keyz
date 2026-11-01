/// <reference lib="webworker" />
import { MicPipeline, type MicFrame } from '@keyz/shared'

type In =
  | { type: 'init'; sampleRate: number; sensitivity: number; port: MessagePort }
  | { type: 'sensitivity'; value: number }
  | { type: 'recalibrate' }
  | { type: 'reset' }

let pipeline: MicPipeline | null = null

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data
  if (m.type === 'init') {
    pipeline = new MicPipeline(m.sampleRate, m.sensitivity)
    m.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      const frame = pipeline?.push(ev.data)
      if (frame) (self as DedicatedWorkerGlobalScope).postMessage(frame satisfies MicFrame)
    }
  } else if (m.type === 'sensitivity') pipeline?.setSensitivity(m.value)
  else if (m.type === 'recalibrate') pipeline?.recalibrate()
  else if (m.type === 'reset') pipeline?.reset()
}
