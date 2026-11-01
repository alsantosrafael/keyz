import { type ButtonHTMLAttributes, type ComponentProps, type ReactNode, useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost'

/** Botão de 44 px de altura; primário usa a cor da faixa do modo. */
export function Button({
  variant = 'secondary', className, children, ...rest
}: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        't-label inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-control px-4 transition-[transform,opacity] duration-[120ms] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45',
        variant === 'primary' && 'bg-track font-semibold text-on-track',
        variant === 'secondary' && 'border border-line bg-raised text-ink shadow-[var(--elev-raised)]',
        variant === 'ghost' && 'text-muted hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Botão só de ícone: sempre com nome acessível. */
export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        'inline-flex size-11 cursor-pointer items-center justify-center rounded-control text-muted transition-[transform,opacity] duration-[120ms] hover:text-ink active:scale-[0.95] disabled:opacity-45 aria-pressed:text-track',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-1">
      <span className="flex flex-col">
        <span className="text-[16px]">{label}</span>
        {hint && <span className="text-[14px] text-muted">{hint}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="k-switch-input sr-only" />
      <span aria-hidden className="k-switch-track">
        <i className="k-switch-knob" />
      </span>
    </label>
  )
}

export function Slider({
  value, onChange, min = 0, max = 1, step = 0.01, label, valueText,
}: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string; valueText?: string }) {
  const id = useId()
  return (
    <div className="py-1">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[16px]">{label}</label>
        {valueText && <span className="t-readout text-muted">{valueText}</span>}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-[var(--track)]"
      />
    </div>
  )
}

/** Grupo de opções exclusivas (radiogroup visual). */
export function Segmented<T extends string | number>({
  value, onChange, options, label,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; aria?: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-control border border-line bg-inset p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.aria}
          onClick={() => onChange(o.value)}
          className={cn(
            't-label min-h-9 min-w-11 cursor-pointer rounded-[9px] px-3 transition-colors duration-[120ms]',
            o.value === value ? 'bg-track font-semibold text-on-track' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('t-label inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-raised px-3 tabular-nums', className)}>
      {children}
    </span>
  )
}

/**
 * Folha modal (celular: de baixo; telas largas: painel lateral). Usa `<dialog>`: foco preso,
 * Esc fecha e o resto da página fica inerte.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="k-sheet fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-b-none rounded-t-[20px] border border-line bg-panel p-0 text-ink shadow-[var(--elev-overlay)] backdrop:bg-scrim sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[400px] sm:rounded-none sm:rounded-l-[20px]"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id={titleId} className="t-headline">{title}</h2>
        <IconButton label="Fechar" onClick={onClose}><X size={20} strokeWidth={1.75} aria-hidden /></IconButton>
      </div>
      <div className="px-5 pb-6 pt-3">{children}</div>
    </dialog>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-3">
      <h3 className="t-caption mb-1 text-faint">{title}</h3>
      <div className="divide-y divide-line">{children}</div>
    </section>
  )
}
