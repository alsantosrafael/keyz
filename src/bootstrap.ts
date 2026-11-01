import { OutputGate, type Services, gateFeedback, gatePiano, setServices } from './application'
import { WebFeedback } from './platform/feedback'
import { WebHaptics } from './platform/haptics'
import { WebMicrophone } from './platform/microphone'
import { WebMidi } from './platform/midi'
import { SynthPiano } from './platform/piano'
import { LocalStorageAdapter } from './platform/storage'
import { getAudioContext } from './platform/audio'
import { initApp, setMicrophone, useSettings } from './state/app'

/** Raiz de composição: liga os adaptadores do navegador às portas de `application`. */
export function bootstrap(): void {
  const clock = () => performance.now()
  const outputGate = new OutputGate(clock)
  const services: Services = {
    outputGate,
    piano: gatePiano(new SynthPiano(), outputGate),
    feedback: gateFeedback(new WebFeedback(), outputGate),
    haptics: new WebHaptics(),
    storage: new LocalStorageAdapter(),
    microphone: new WebMicrophone(),
    midi: new WebMidi(),
    clock,
    scheduler: {
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id),
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (id) => window.clearInterval(id),
    },
  }
  setServices(services)
  initApp()

  // Cria o AudioContext (suspenso) em tempo ocioso: o primeiro toque só precisa retomá-lo.
  const warm = () => {
    try {
      getAudioContext()
    } catch {
      /* sem Web Audio: segue sem som */
    }
  }
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
  if (idle) idle.call(window, warm)
  else window.setTimeout(warm, 200)

  // O áudio só inicia depois do primeiro gesto; religa o microfone se estava ligado.
  const onFirstGesture = () => {
    window.removeEventListener('pointerdown', onFirstGesture, true)
    window.removeEventListener('keydown', onFirstGesture, true)
    void services.piano.resume()
    if (useSettings.getState().settings.microphoneEnabled) void setMicrophone(true)
  }
  window.addEventListener('pointerdown', onFirstGesture, true)
  window.addEventListener('keydown', onFirstGesture, true)
}
