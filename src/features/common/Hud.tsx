import { Flame } from 'lucide-react'
import { cn } from '../../ui/cn'

/** HUD de uma linha: progresso (`7/20`) e sequência (chama + número). Sem texto longo. */
export function Hud({ index, total, streak, milestone, right }: { index: number; total: number | null; streak: number; milestone?: boolean; right?: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="t-readout flex items-center gap-2" aria-label={total ? `Nota ${index} de ${total}` : `Nota ${index}`}>
        <span>{index}</span>
        {total && <span className="text-faint">/ {total}</span>}
        {total && total <= 24 && (
          <span aria-hidden className="ml-1 hidden gap-1 sm:flex">
            {Array.from({ length: total }, (_, i) => (
              <i key={i} className={cn('size-1.5 rounded-full', i + 1 < index ? 'bg-track' : i + 1 === index ? 'bg-ink' : 'bg-line-strong')} />
            ))}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          key={streak}
          className={cn('t-readout inline-flex items-center gap-1 rounded-full px-2 py-0.5', streak > 0 && 'k-pop', milestone ? 'bg-track text-on-track' : streak > 0 ? 'text-drill' : 'text-faint')}
          aria-label={`Sequência de ${streak}`}
        >
          <Flame size={18} strokeWidth={1.75} aria-hidden />
          {streak}
        </span>
        {right}
      </div>
    </div>
  )
}
