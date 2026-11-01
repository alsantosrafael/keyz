import { useEffect, useRef } from 'react'
import { cn } from './cn'

/**
 * Medidor em cápsula sobre `--surface-inset`. O nível entra por variável CSS via
 * requestAnimationFrame, sem re-render do React.
 */
export function LevelMeter({ getLevel, label, className }: { getLevel: () => number; label: string; className?: string }) {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    let shown = 0
    const loop = () => {
      const target = getLevel()
      shown += (target - shown) * (target > shown ? 0.5 : 0.12)
      bar.current?.style.setProperty('--level', shown.toFixed(3))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [getLevel])
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} className={cn('relative h-3 overflow-hidden rounded-full bg-inset', className)}>
      <div ref={bar} className="absolute inset-0 origin-left rounded-full bg-track shadow-[0_0_12px_var(--glow-track)]" style={{ transform: 'scaleX(var(--level, 0))' }} />
      {[0.25, 0.5, 0.75].map((m) => (
        <span key={m} aria-hidden className="absolute inset-y-0 w-px bg-line-strong" style={{ left: `${m * 100}%` }} />
      ))}
    </div>
  )
}

/** Afinação: arco em cents (±50), com a faixa de ±10 cents em sucesso. O ponteiro anda por transform. */
export function TuningArc({ cents, strength, active }: { cents: number | null; strength: number; active: boolean }) {
  const clamped = Math.max(-50, Math.min(50, cents ?? 0))
  const angle = (clamped / 50) * 60
  const inTune = cents !== null && Math.abs(cents) <= 10
  const point = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return `${100 + r * Math.cos(rad)} ${100 + r * Math.sin(rad)}`
  }
  const arc = (from: number, to: number, r = 80) => `M ${point(from, r)} A ${r} ${r} 0 0 1 ${point(to, r)}`
  return (
    <figure className="m-0 flex flex-col items-center" aria-label="Afinação">
      <svg viewBox="0 8 200 112" className="w-full max-w-[240px] overflow-visible" role="img" aria-label={cents === null ? 'Sem afinação' : `${Math.round(cents)} cents`}>
        <path d={arc(-60, 60)} fill="none" stroke="var(--surface-inset)" strokeWidth="14" strokeLinecap="round" />
        <path d={arc(-12, 12)} fill="none" stroke="var(--success)" strokeWidth="14" opacity="0.9" />
        {[-60, -30, 0, 30, 60].map((d) => (
          <line key={d} x1={point(d, 66).split(' ')[0]} y1={point(d, 66).split(' ')[1]} x2={point(d, 72).split(' ')[0]} y2={point(d, 72).split(' ')[1]} stroke="var(--line-strong)" strokeWidth="2" />
        ))}
        <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '100px 100px', transition: 'transform 120ms var(--ease-out), opacity 200ms linear', opacity: active ? Math.max(0.25, strength) : 0.25 }}>
          <line x1="100" y1="100" x2="100" y2="34" stroke={inTune ? 'var(--success)' : 'var(--text)'} strokeWidth="4" strokeLinecap="round" />
          <circle cx="100" cy="100" r="6" fill={inTune ? 'var(--success)' : 'var(--text)'} />
        </g>
      </svg>
      <figcaption className="t-readout -mt-1 flex min-h-7 items-center gap-1 text-muted">
        {cents === null ? <span>—</span> : (
          <>
            <span className="inline-block min-w-[4.5ch] text-right">{cents > 0 ? '+' : ''}{Math.round(cents)}</span>
            <span className="t-caption">cents</span>
            <span className={cn('t-label ml-2', inTune ? 'text-success' : 'text-muted')}>{inTune ? '✓ afinado' : cents > 0 ? 'alto' : 'baixo'}</span>
          </>
        )}
      </figcaption>
    </figure>
  )
}
