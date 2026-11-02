import { useId, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Send } from 'lucide-react'
import { REPORT_TYPES, MAX_FIELD, MAX_TITLE, type Report, type ReportContext, reportSchema, reportType } from '@keyz/shared'
import { services } from '../../application'
import { Button, Sheet } from '../../ui/controls'
import { cn } from '../../ui/cn'
import { useDevices, useMic, useSettings, useUi } from '../../state/app'
import { modeForPath } from '../shell/modes'

type Phase = { kind: 'editing' } | { kind: 'sending' } | { kind: 'sent'; number: number | null } | { kind: 'error'; message: string }

const inputClass =
  'w-full rounded-control border border-line bg-inset px-3 py-2 text-[16px] text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2'

function Field({ label, hint, required, children, id }: { label: string; hint?: string; required: boolean; children: React.ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-1 py-2">
      <label htmlFor={id} className="text-[16px]">
        {label}
        {!required && <span className="t-caption ml-2 text-faint">opcional</span>}
      </label>
      {hint && <span id={`${id}-hint`} className="t-caption text-faint">{hint}</span>}
      {children}
    </div>
  )
}

/** Contexto técnico anexado ao relatório. Nada de áudio nem dado pessoal; a pessoa vê tudo antes de enviar. */
function useReportContext(): ReportContext {
  const settings = useSettings((s) => s.settings)
  const micKind = useMic((s) => s.status.kind)
  const midi = useDevices((s) => s.midi)
  const mode = modeForPath(window.location.pathname)
  const inputs = [
    micKind !== 'off' && !['denied', 'unsupported', 'no-device', 'interrupted', 'failed'].includes(micKind) ? 'microfone' : null,
    midi.length ? 'MIDI' : null,
    'tela/teclado',
  ].filter(Boolean)
  return {
    version: __APP_VERSION__,
    userAgent: navigator.userAgent.slice(0, 300),
    mode: mode.label,
    input: inputs.join(', '),
    theme: settings.theme,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  }
}

export default function ReportSheet() {
  const open = useUi((s) => s.reportOpen)
  const setOpen = useUi((s) => s.setReportOpen)
  const context = useReportContext()
  const baseId = useId()
  const [typeId, setTypeId] = useState<string>(REPORT_TYPES[0].id)
  const [title, setTitle] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [contact, setContact] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' })
  const [problem, setProblem] = useState<string | null>(null)
  // Isca contra robôs: fica fora da tela e fora da ordem de foco.
  const trap = useRef<HTMLInputElement>(null)
  const type = reportType(typeId)!

  const reset = () => {
    setTitle('')
    setFields({})
    setContact('')
    setProblem(null)
    setPhase({ kind: 'editing' })
  }
  const close = () => {
    setOpen(false)
    if (phase.kind === 'sent') reset()
  }

  const send = async () => {
    const candidate = { type: typeId, title, fields, context, contact, website: trap.current?.value ?? '' }
    const parsed = reportSchema.safeParse(candidate)
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Confira os campos.')
      return
    }
    setProblem(null)
    setPhase({ kind: 'sending' })
    const result = await services().reports.submit(parsed.data satisfies Report)
    setPhase(result.ok ? { kind: 'sent', number: result.number } : { kind: 'error', message: result.message })
  }

  const sending = phase.kind === 'sending'
  return (
    <Sheet open={open} onClose={close} title="Reportar ou sugerir">
      {phase.kind === 'sent' ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-3 py-2">
          <p className="flex items-center gap-2 text-[16px]">
            <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden className="text-success" /> Recebido. Obrigado por ajudar!
          </p>
          <p className="text-[16px] text-muted">{phase.number ? `Seu relatório virou a issue nº ${phase.number}.` : 'Seu relatório foi registrado.'} Vamos analisar.</p>
          <Button variant="primary" onClick={close}>Fechar</Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
          noValidate
        >
          <p className="mb-2 text-[16px] text-muted">Conte o que houve. Não precisa ter conta no GitHub.</p>
          <fieldset className="py-2">
            <legend className="t-caption mb-1 text-faint">Tipo</legend>
            <div className="flex flex-col gap-1">
              {REPORT_TYPES.map((t) => (
                <label key={t.id} className={cn('flex min-h-11 cursor-pointer items-start gap-3 rounded-control border px-3 py-2', t.id === typeId ? 'border-line-strong bg-raised' : 'border-line')}>
                  <input type="radio" name={`${baseId}-type`} checked={t.id === typeId} onChange={() => { setTypeId(t.id); setFields({}); setProblem(null) }} className="mt-1 accent-[var(--track)]" />
                  <span className="flex flex-col">
                    <span className="text-[16px]">{t.title}</span>
                    <span className="t-caption text-faint">{t.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field id={`${baseId}-title`} label="Título curto" required>
            <input id={`${baseId}-title`} value={title} maxLength={MAX_TITLE} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </Field>
          {type.fields.map((f) => (
            <Field key={`${typeId}-${f.id}`} id={`${baseId}-${f.id}`} label={f.label} hint={f.hint} required={f.required}>
              {f.multiline ? (
                <textarea id={`${baseId}-${f.id}`} rows={4} maxLength={MAX_FIELD} aria-describedby={f.hint ? `${baseId}-${f.id}-hint` : undefined} value={fields[f.id] ?? ''} onChange={(e) => setFields({ ...fields, [f.id]: e.target.value })} className={inputClass} />
              ) : (
                <input id={`${baseId}-${f.id}`} maxLength={MAX_FIELD} aria-describedby={f.hint ? `${baseId}-${f.id}-hint` : undefined} value={fields[f.id] ?? ''} onChange={(e) => setFields({ ...fields, [f.id]: e.target.value })} className={inputClass} />
              )}
            </Field>
          ))}
          <Field id={`${baseId}-contact`} label="E-mail para retorno" hint="Só se quiser resposta. Fica visível na issue pública." required={false}>
            <input id={`${baseId}-contact`} type="email" autoComplete="email" maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} className={inputClass} />
          </Field>
          <input ref={trap} name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

          <details className="mt-2 rounded-control border border-line px-3 py-2">
            <summary className="t-label min-h-11 cursor-pointer leading-[2.75rem]">O que será enviado junto</summary>
            <ul className="t-caption mt-1 text-muted">
              <li>Versão do app: {context.version}</li>
              <li>Modo: {context.mode}</li>
              <li>Entrada: {context.input}</li>
              <li>Tema e tamanho da tela: {context.theme}, {context.viewport}</li>
              <li>Navegador: {context.userAgent}</li>
            </ul>
            <p className="t-caption mt-1 text-faint">Nenhum áudio, nota tocada ou dado pessoal é enviado. A issue é pública.</p>
          </details>

          <div aria-live="polite" className="mt-3 min-h-6">
            {problem && <p className="t-label flex items-center gap-2 text-warning"><AlertTriangle size={16} strokeWidth={1.75} aria-hidden /> {problem}</p>}
            {phase.kind === 'error' && <p className="t-label flex items-center gap-2 text-warning"><AlertTriangle size={16} strokeWidth={1.75} aria-hidden /> {phase.message}</p>}
          </div>
          <Button variant="primary" type="submit" disabled={sending} className="mt-2 w-full">
            {sending ? <Loader2 size={18} strokeWidth={1.75} aria-hidden className="motion-safe:animate-spin" /> : <Send size={18} strokeWidth={1.75} aria-hidden />} {sending ? 'Enviando…' : 'Enviar'}
          </Button>
        </form>
      )}
    </Sheet>
  )
}
