import { Mic, MicOff, ShieldCheck } from 'lucide-react'
import { Button, Sheet } from '../../ui/controls'
import { setMicrophone, useMic, useUi } from '../../state/app'
import { COMO_LIBERAR, detectarPlataforma } from '../entrada/problemaDoMicrofone'

/** Explica o motivo antes de pedir a permissão. Se o sistema negar, conduz o usuário a liberar nas configurações. */
export function MicPrompt() {
  const open = useUi((s) => s.micPrompt)
  const setOpen = useUi((s) => s.setMicPrompt)
  const denied = useMic((s) => s.status.kind === 'denied')
  const ativar = () => { setOpen(false); void setMicrophone(true) }

  if (denied) {
    const como = COMO_LIBERAR[detectarPlataforma(navigator.userAgent, navigator.maxTouchPoints)]
    return (
      <Sheet open={open} onClose={() => setOpen(false)} title="Microfone bloqueado">
        <p className="mb-3 flex items-start gap-2 text-[16px]">
          <MicOff size={20} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          O aparelho não deixou o Keyz usar o microfone. Você pode liberar nas configurações e tentar de novo.
        </p>
        <p className="mb-5 text-[16px] text-muted">{como}</p>
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" onClick={ativar}>
            <Mic size={18} strokeWidth={1.75} aria-hidden /> Tentar de novo
          </Button>
          <Button onClick={() => setOpen(false)}>Usar o teclado</Button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Ativar o microfone">
      <p className="mb-3 text-[16px]">O Keyz ouve o seu piano para reconhecer as notas e os acordes que você toca, sem precisar de cabo MIDI.</p>
      <p className="mb-5 flex items-start gap-2 text-[16px] text-muted">
        <ShieldCheck size={20} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-success" />
        O áudio é analisado no seu aparelho e nunca é enviado a lugar nenhum.
      </p>
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={ativar}>
          <Mic size={18} strokeWidth={1.75} aria-hidden /> Ativar
        </Button>
        <Button onClick={() => setOpen(false)}>Agora não</Button>
      </div>
    </Sheet>
  )
}
