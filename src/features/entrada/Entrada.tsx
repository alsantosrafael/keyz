import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Keyboard, Loader2, Mic, MicOff, Piano, RefreshCw } from 'lucide-react'
import { noteLabel } from '@keyz/shared'
import type { CalibrationState, InputSource } from '../../application'
import { Button, Slider } from '../../ui/controls'
import { LevelMeter } from '../../ui/Meter'
import { LiveRegion } from '../../ui/LiveRegion'
import { cn } from '../../ui/cn'
import { getApp, setMicrophone, useDevices, useMic, useSettings } from '../../state/app'
import { micLabel } from '../shell/InputPill'
import { usePublishKeyStates } from '../common/hooks'
import { ModeTip } from '../onboarding/ModeTip'

const NONE = new Map<number, never>()

/** Último "Recebi: Dó 4" de uma fonte (o teste ao vivo de cada cartão). */
function useLastReceived(source: InputSource): string | null {
  const [last, setLast] = useState<string | null>(null)
  const accidental = useSettings((s) => s.settings.accidental)
  useEffect(
    () => getApp().hub.events.subscribe((e) => e.type === 'on' && e.source === source && setLast(noteLabel(e.note, accidental))),
    [source, accidental],
  )
  return last
}

function CalibrationNote({ state }: { state: Exclude<CalibrationState, { kind: 'idle' }> }) {
  if (state.kind === 'running') {
    const percent = Math.round(state.progress * 100)
    return (
      <div className="mt-3" role="status" aria-live="polite">
        <p className="t-label flex items-center gap-2"><Loader2 size={16} strokeWidth={1.75} aria-hidden className="motion-safe:animate-spin" /> Calibrando o ruído: fique em silêncio ({percent}%)</p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-inset" role="progressbar" aria-label="Progresso da calibração" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="h-full origin-left rounded-full bg-track" style={{ transform: `scaleX(${state.progress})` }} />
        </div>
      </div>
    )
  }
  const loud = state.level === 'loud'
  const text =
    state.level === 'quiet' ? 'Ruído calibrado: ambiente silencioso. O Keyz já ignora o ruído de fundo.'
    : state.level === 'moderate' ? 'Ruído calibrado: há algum barulho de fundo, mas o Keyz já o ignora.'
    : 'Ambiente muito barulhento durante a calibração. Tente de novo em silêncio, ou diminua a sensibilidade.'
  return (
    <p className={cn('t-label mt-3 flex items-center gap-2', loud && 'text-warning')} role="status" aria-live="polite">
      {loud ? <AlertTriangle size={16} strokeWidth={1.75} aria-hidden /> : <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden />} {text}
    </p>
  )
}

function Card({ icon, title, status, children, ok }: { icon: ReactNode; title: string; status: string; children: ReactNode; ok: boolean }) {
  return (
    <section className="rounded-card border border-line bg-panel p-4" aria-label={title}>
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="t-headline flex items-center gap-2">{icon}{title}</h2>
        <span className={cn('t-label inline-flex items-center gap-1.5 rounded-full px-2.5 py-1', ok ? 'bg-inset text-success' : 'bg-inset text-muted')}>
          <span aria-hidden className={cn('size-2 rounded-full', ok ? 'bg-success' : 'bg-faint')} />
          {status}
        </span>
      </header>
      {children}
    </section>
  )
}

function TestLine({ received, hint }: { received: string | null; hint: string }) {
  return (
    <p className="mt-3 flex min-h-11 items-center rounded-control bg-inset px-3 text-[16px]" aria-live="polite">
      {received ? <><span className="text-muted">Recebi:&nbsp;</span><strong className="t-readout">{received}</strong></> : <span className="text-faint">{hint}</span>}
    </p>
  )
}

/** Entrada: lista de fontes, cada uma com estado, ação e teste ao vivo. */
export function Entrada() {
  usePublishKeyStates(NONE)
  const { mic } = getApp()
  const midi = useDevices((s) => s.midi)
  const midiStatus = useDevices((s) => s.midiStatus)
  const status = useMic((s) => s.status)
  const device = useMic((s) => s.deviceName)
  const calibration = useMic((s) => s.calibration)
  const { settings, update } = useSettings()
  const screenLast = useLastReceived('screen')
  const midiLast = useLastReceived('midi')
  const computerLast = useLastReceived('computer')
  const micLast = useLastReceived('mic')
  const micOn = status.kind !== 'off' && !['denied', 'unsupported', 'no-device', 'failed'].includes(status.kind)

  const micProblem =
    status.kind === 'denied' ? 'Permissão negada. Libere o microfone nas configurações do site (ícone ao lado do endereço) e tente de novo. O teclado na tela continua funcionando.'
    : status.kind === 'unsupported' ? 'Este navegador não permite usar o microfone aqui. O teclado na tela continua funcionando.'
    : status.kind === 'no-device' ? 'Nenhum microfone encontrado. O teclado na tela continua funcionando.'
    : status.kind === 'failed' ? `Não foi possível iniciar o áudio: ${status.message}`
    : status.kind === 'blocked' ? 'O sistema está bloqueando o áudio do microfone (nível zero). Verifique a permissão do navegador.'
    : status.kind === 'no-audio' ? 'Nenhum áudio chegando do microfone.'
    : null

  return (
    <div className="flex flex-col gap-4">
      <h1 className="t-title">Entrada</h1>
      <ModeTip mode="entrada">Ligue um teclado MIDI pela USB ou Bluetooth, ou ative o microfone para tocar no seu piano de verdade. Exemplo: toque Dó no piano e o Keyz mostra "Dó".</ModeTip>
      <p className="text-[16px] text-muted">Escolha como o Keyz recebe as suas notas. Toque em qualquer fonte para testar.</p>
      <LiveRegion text={`${screenLast ?? ''}`} />

      <Card icon={<Piano size={22} strokeWidth={1.75} aria-hidden />} title="Teclado MIDI" status={midi.length ? `Conectado` : midiStatus === 'unsupported' ? 'Indisponível' : 'Sem aparelho'} ok={midi.length > 0}>
        {midiStatus === 'unsupported' ? (
          <p className="text-[16px] text-muted">Este navegador não oferece MIDI (Safari e Firefox). Use o Chrome ou o Edge para conectar um teclado USB ou Bluetooth. Enquanto isso, o teclado na tela e o do computador funcionam normalmente.</p>
        ) : midiStatus === 'denied' ? (
          <p className="text-[16px] text-muted">O acesso ao MIDI foi negado. Libere nas configurações do site e recarregue a página.</p>
        ) : midi.length ? (
          <ul className="text-[16px]">{midi.map((n) => <li key={n}>{n}</li>)}</ul>
        ) : (
          <p className="text-[16px] text-muted">Conecte um teclado por USB ou Bluetooth; ele é detectado na hora, sem recarregar.</p>
        )}
        <TestLine received={midiLast} hint="Toque uma tecla do teclado MIDI" />
      </Card>

      <Card icon={<Mic size={22} strokeWidth={1.75} aria-hidden />} title="Microfone" status={micLabel(status.kind) === 'Microfone' ? (micOn ? 'Ouvindo' : 'Desligado') : micLabel(status.kind)} ok={micOn}>
        <p className="mb-3 text-[16px] text-muted">Ouve o seu piano para reconhecer notas e acordes. O áudio é analisado no aparelho e nunca é enviado.</p>
        <div className="flex flex-wrap items-center gap-2">
          {!micOn ? (
            <Button variant="primary" onClick={() => void setMicrophone(true)} disabled={status.kind === 'starting'}>
              <Mic size={18} strokeWidth={1.75} aria-hidden /> {status.kind === 'starting' ? 'Iniciando…' : 'Ativar microfone'}
            </Button>
          ) : (
            <>
              <Button onClick={() => void setMicrophone(false)}><MicOff size={18} strokeWidth={1.75} aria-hidden /> Desligar</Button>
              <Button onClick={() => mic.recalibrate()} disabled={calibration.kind === 'running'} title="Fique em silêncio por alguns segundos"><RefreshCw size={18} strokeWidth={1.75} aria-hidden /> {calibration.kind === 'running' ? 'Calibrando…' : 'Recalibrar ruído'}</Button>
            </>
          )}
        </div>
        {micOn && calibration.kind !== 'idle' && <CalibrationNote state={calibration} />}
        {micProblem && <p className="mt-3 text-[16px]" role="alert">{micProblem}</p>}
        {device && micOn && <p className="mt-2 text-[14px] text-muted">{device}</p>}
        {micOn && (
          <div className="mt-4 flex flex-col gap-2">
            <div>
              <span className="t-caption text-faint">Nível</span>
              <LevelMeter label="Nível do microfone" getLevel={() => mic.snapshot.level} className="mt-1" />
            </div>
            <Slider
              label="Sensibilidade"
              valueText={`${Math.round(settings.microphoneSensitivity * 100)}%`}
              value={settings.microphoneSensitivity}
              onChange={(microphoneSensitivity) => update({ microphoneSensitivity })}
            />
            {status.kind === 'noisy' && <p className="t-label text-warning">Ambiente barulhento: diminua a sensibilidade ou recalibre o ruído.</p>}
          </div>
        )}
        <TestLine received={micLast} hint={micOn ? 'Toque uma nota no seu piano' : 'Ative o microfone para testar'} />
      </Card>

      <Card icon={<Keyboard size={22} strokeWidth={1.75} aria-hidden />} title="Teclado do computador" status="Sempre ativo" ok>
        <p className="text-[16px] text-muted">
          A S D F G H J K L tocam as teclas brancas e W E T Y U O P as pretas. Z e X mudam a oitava. O teclado na tela responde ao toque, ao mouse e ao teclado (setas e Enter).
        </p>
        <TestLine received={computerLast ?? screenLast} hint="Toque uma tecla na tela ou no teclado" />
      </Card>
    </div>
  )
}
