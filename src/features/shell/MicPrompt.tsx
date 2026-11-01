import { Mic, ShieldCheck } from 'lucide-react'
import { Button, Sheet } from '../../ui/controls'
import { setMicrophone, useUi } from '../../state/app'

/** Explica o motivo antes de pedir a permissão. O áudio nunca sai do aparelho. */
export function MicPrompt() {
  const open = useUi((s) => s.micPrompt)
  const setOpen = useUi((s) => s.setMicPrompt)
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Ativar o microfone">
      <p className="mb-3 text-[16px]">O Keyz ouve o seu piano para reconhecer as notas e os acordes que você toca, sem precisar de cabo MIDI.</p>
      <p className="mb-5 flex items-start gap-2 text-[16px] text-muted">
        <ShieldCheck size={20} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-success" />
        O áudio é analisado no seu aparelho e nunca é enviado a lugar nenhum.
      </p>
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" onClick={() => { setOpen(false); void setMicrophone(true) }}>
          <Mic size={18} strokeWidth={1.75} aria-hidden /> Ativar
        </Button>
        <Button onClick={() => setOpen(false)}>Agora não</Button>
      </div>
    </Sheet>
  )
}
