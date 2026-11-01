import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Keyboard, Mic, MicOff, Piano, TriangleAlert } from 'lucide-react'
import { cn } from '../../ui/cn'
import { getApp, useDevices, useMic, useUi } from '../../state/app'

export function micLabel(kind: string): string {
  switch (kind) {
    case 'starting': return 'Iniciando microfone'
    case 'denied': return 'Microfone desligado'
    case 'unsupported': return 'Microfone desligado'
    case 'no-device': return 'Microfone desligado'
    case 'failed': return 'Microfone desligado'
    case 'no-audio': return 'Sem áudio'
    case 'blocked': return 'Microfone bloqueado'
    case 'noisy': return 'Ambiente barulhento'
    default: return 'Microfone'
  }
}

/** Ponto que pulsa com o nível do microfone (por variável CSS, fora do React). */
function MicDot() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      ref.current?.style.setProperty('--level', String(getApp().mic.snapshot.level))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <span ref={ref} aria-hidden className="size-2.5 rounded-full bg-success" style={{ transform: 'scale(calc(0.8 + var(--level, 0) * 0.9))' }} />
}

/** Pílula de entrada na barra superior: fonte ativa e estado (SPEC › Estados de entrada). */
export function InputPill() {
  const navigate = useNavigate()
  const midi = useDevices((s) => s.midi)
  const status = useMic((s) => s.status)
  const setPrompt = useUi((s) => s.setMicPrompt)
  const off = status.kind === 'off'
  const failed = ['denied', 'unsupported', 'no-device', 'failed'].includes(status.kind)
  const listening = ['silence', 'hearing', 'note', 'chord', 'noisy'].includes(status.kind)

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => navigate('/entrada')}
        className="t-label inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-raised px-3"
        title="Entradas"
      >
        {midi.length ? <Piano size={16} strokeWidth={1.75} aria-hidden /> : <Keyboard size={16} strokeWidth={1.75} aria-hidden />}
        <span className="hidden max-w-[10ch] truncate min-[400px]:inline xl:max-w-[16ch]">{midi.length ? `MIDI · ${midi[0]}` : 'Teclado'}</span>
        <span aria-hidden className="size-2 rounded-full bg-success" />
      </button>
      {off && (
        <button type="button" onClick={() => setPrompt(true)} className="t-label inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-track px-3 font-semibold text-on-track">
          <Mic size={16} strokeWidth={1.75} aria-hidden />
          <span className="hidden xl:inline">Ativar microfone</span>
          <span className="xl:hidden">Mic</span>
        </button>
      )}
      {!off && (
        <button
          type="button"
          onClick={() => navigate('/entrada')}
          className={cn('t-label inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3', status.kind === 'noisy' ? 'border-warning' : 'border-line bg-raised')}
          title={micLabel(status.kind)}
        >
          {failed ? <MicOff size={16} strokeWidth={1.75} aria-hidden /> : status.kind === 'noisy' ? <TriangleAlert size={16} strokeWidth={1.75} aria-hidden className="text-warning" /> : <Mic size={16} strokeWidth={1.75} aria-hidden />}
          <span className="hidden max-w-[20ch] truncate xl:inline">{micLabel(status.kind)}</span>
          {listening && status.kind !== 'noisy' && <MicDot />}
        </button>
      )}
    </div>
  )
}
