import { cn } from './cn'

/**
 * Display de nota (painel afundado, como um display de equipamento). Largura reservada para
 * "D♯" e altura fixa, para nada deslocar ao trocar de nota. A troca é um crossfade de 120 ms.
 */
export function NoteReadout({
  title, sub, muted = false, dir = 'up', fade = 1, minHeight = 150, tag, className, compact = false,
}: {
  compact?: boolean
  title: string
  sub?: string
  muted?: boolean
  dir?: 'up' | 'down'
  fade?: number
  minHeight?: number
  tag?: string
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center rounded-card bg-inset px-4 py-3 text-center', className)}
      style={{ minHeight }}
    >
      <div
        key={title}
        data-dir={dir}
        className={cn('k-note-in min-w-[3ch] transition-colors duration-200', compact ? 't-title' : 't-display', muted ? 'text-muted' : 'text-ink')}
        style={{ opacity: fade, ...(!compact && title.length > 2 ? { fontSize: 'clamp(48px, 7vw, 72px)' } : null) }}
      >
        {title || '—'}
      </div>
      <div className="t-readout mt-1 min-h-6 text-muted" style={{ opacity: fade }}>{sub ?? ''}</div>
      {tag && <div className="t-caption mt-1 text-faint">{tag}</div>}
    </div>
  )
}
