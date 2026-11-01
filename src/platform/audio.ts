/** Um único AudioContext, dono desta camada; só inicia após um gesto do usuário. */
let ctx: AudioContext | null = null
let pianoBus: GainNode | null = null
let feedbackBus: GainNode | null = null

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor({ latencyHint: 'interactive' })
    const compressor = ctx.createDynamicsCompressor()
    compressor.connect(ctx.destination)
    pianoBus = ctx.createGain()
    feedbackBus = ctx.createGain()
    pianoBus.connect(compressor)
    feedbackBus.connect(compressor)
  }
  return ctx
}

export const getPianoBus = (): GainNode => (getAudioContext(), pianoBus!)
export const getFeedbackBus = (): GainNode => (getAudioContext(), feedbackBus!)

/** Retoma o contexto (precisa estar dentro de um gesto do usuário). */
export async function resumeAudio(): Promise<void> {
  const c = getAudioContext()
  if (c.state === 'suspended') await c.resume()
}

export const audioSupported = (): boolean => typeof window !== 'undefined' && !!(window.AudioContext ?? (window as unknown as Record<string, unknown>).webkitAudioContext)
