import { type ReactNode, useEffect, useRef } from 'react'
import { cn } from './cn'

const R = 92
const LEN = 2 * Math.PI * R

export type RingState = 'running' | 'correct' | 'wrong' | 'timeout'

/**
 * Anel de tempo: envolve a nota e esvazia de forma contínua (linear). Anima por
 * `stroke-dashoffset` em CSS, fora do React. A cor da faixa vira `--warning` aos 2/3; nos
 * últimos 3 s pulsa devagar (com movimento reduzido só muda de cor).
 */
export function TimeRing({
  duration, elapsed, roundKey, paused, state, children, progress,
}: {
  duration: number
  elapsed: number
  roundKey: number | string
  paused: boolean
  state: RingState
  children: ReactNode
  /** Para anel de progresso (Acordes): 0..1 fixo, sem tempo. */
  progress?: number
}) {
  const base = {
    animationDuration: `${duration}s`,
    animationDelay: `${-elapsed}s`,
    animationPlayState: paused ? 'paused' : 'running',
    animationTimingFunction: 'linear',
    animationFillMode: 'both',
  } as const
  const fixed = progress !== undefined
  const stroke = state === 'correct' ? 'var(--success)' : state === 'timeout' ? 'var(--warning)' : state === 'wrong' ? 'var(--failure)' : 'var(--track)'
  return (
    <div className="relative mx-auto grid aspect-square place-items-center" style={{ width: 'min(300px, 100%, 34dvh)' }}>
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--surface-inset)" strokeWidth="10" />
        {fixed ? (
          <circle
            cx="100" cy="100" r={R} fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={LEN} strokeDashoffset={LEN * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 220ms var(--ease-out), stroke 120ms linear', filter: state === 'correct' ? 'drop-shadow(0 0 6px var(--glow-success))' : undefined }}
          />
        ) : state === 'running' ? (
          <g key={roundKey} className="ring-pulse" style={{ animation: `k-ring-warn 1s ease-in-out infinite`, animationDelay: `${duration - 3 - elapsed}s`, animationPlayState: paused ? 'paused' : 'running' }}>
            {(['var(--track)', 'var(--warning)'] as const).map((color, i) => (
              <circle
                key={color} cx="100" cy="100" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={LEN}
                style={{
                  ['--ring-len' as string]: LEN,
                  ...base,
                  animationName: i === 0 ? 'k-ring-drain, k-ring-hide' : 'k-ring-drain, k-ring-show',
                }}
              />
            ))}
          </g>
        ) : (
          <circle
            cx="100" cy="100" r={R} fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={LEN} strokeDashoffset={state === 'timeout' ? LEN : 0}
            style={{ transition: 'stroke 120ms linear', filter: state === 'correct' ? 'drop-shadow(0 0 6px var(--glow-success))' : undefined }}
          />
        )}
      </svg>
      <div className={cn('relative z-[1] flex flex-col items-center')}>{children}</div>
    </div>
  )
}

/** Segundos restantes em `readout`, atualizados fora do React (rAF), sem pular de largura. */
export function Countdown({ getTimeLeft, paused }: { getTimeLeft: () => number; paused: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    let last = ''
    const loop = () => {
      const text = String(Math.ceil(getTimeLeft()))
      if (text !== last && ref.current) {
        ref.current.textContent = text
        last = text
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [getTimeLeft, paused])
  return <span ref={ref} className="t-readout inline-block min-w-[2ch] text-center text-muted" aria-hidden />
}
