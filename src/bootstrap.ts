import { ORIGEM_ERRO } from '@keyz/shared'
import { ClientTelemetry, OutputGate, SemTelemetria, type Services, type TelemetryPort, eventoDeErro, gateFeedback, gatePiano, setServices } from './application'
import { WebFeedback } from './platform/feedback'
import { WebHaptics } from './platform/haptics'
import { WebMicrophone } from './platform/microphone'
import { WebMidi } from './platform/midi'
import { WebReports } from './platform/report'
import { SynthPiano } from './platform/piano'
import { LocalStorageAdapter } from './platform/storage'
import { FetchSink, pessoaPediuSemRastreio } from './platform/telemetry'
import { getAudioContext } from './platform/audio'
import { initApp, setMicrophone, useSettings } from './state/app'

/** Raiz de composição: liga os adaptadores do navegador às portas de `application`. */
export function bootstrap(): void {
  const clock = () => performance.now()
  const scheduler: Services['scheduler'] = {
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id),
  }
  const telemetry = pessoaPediuSemRastreio() ? new SemTelemetria() : new ClientTelemetry({ sink: new FetchSink(), version: __APP_VERSION__ })
  const outputGate = new OutputGate(clock)
  const services: Services = {
    outputGate,
    piano: gatePiano(new SynthPiano(), outputGate),
    feedback: gateFeedback(new WebFeedback(), outputGate),
    haptics: new WebHaptics(),
    storage: new LocalStorageAdapter(),
    microphone: new WebMicrophone(telemetry),
    midi: new WebMidi(telemetry),
    reports: new WebReports(),
    telemetry,
    clock,
    scheduler,
  }
  setServices(services)
  installErrorHandlers(telemetry)
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
  }
  window.addEventListener('pointerdown', onFirstGesture, true)
  window.addEventListener('keydown', onFirstGesture, true)

  // O microfone religa num gesto que o iOS aceita para `getUserMedia` (`pointerdown` não vale lá).
  const religarMicrofone = () => {
    window.removeEventListener('click', religarMicrofone, true)
    window.removeEventListener('touchend', religarMicrofone, true)
    window.removeEventListener('keydown', religarMicrofone, true)
    if (useSettings.getState().settings.microphoneEnabled) void setMicrophone(true)
  }
  window.addEventListener('click', religarMicrofone, true)
  window.addEventListener('touchend', religarMicrofone, true)
  window.addEventListener('keydown', religarMicrofone, true)
}

/** Erros globais não tratados viram `app.error`. */
function installErrorHandlers(telemetry: TelemetryPort): void {
  window.addEventListener('error', (e) => telemetry.record(eventoDeErro(ORIGEM_ERRO.windowError, e.error ?? e.message)))
  window.addEventListener('unhandledrejection', (e) => telemetry.record(eventoDeErro(ORIGEM_ERRO.unhandledRejection, e.reason)))
}
