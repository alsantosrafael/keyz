import { type ReactNode, useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Stars } from './Stars'

/** Resumo da sessão: estrelas, percentual contando de 0 ao valor e marcos como fichas, em etapas de 250 ms. */
export function SessionSummary({
  title, stars, accuracy, chips, children, actions,
}: { title: string; stars: number; accuracy: number; chips: { label: string; value: ReactNode }[]; children?: ReactNode; actions: ReactNode }) {
  const reduce = useReducedMotion()
  const step = reduce ? 0 : 0.25
  return (
    <section aria-label="Resumo da sessão" className="flex flex-col items-center gap-5 py-2 text-center">
      <h2 className="t-title">{title}</h2>
      <Stars count={stars} />
      <motion.p
        className="t-display"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: step * 4, duration: 0.2 }}
        aria-label={`${Math.round(accuracy * 100)} por cento de acerto`}
      >
        <Count to={Math.round(accuracy * 100)} reduce={!!reduce} delay={step * 4} />%
      </motion.p>
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        {chips.map((c, i) => (
          <motion.div
            key={c.label}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24, delay: step * (5 + i) }}
            className="rounded-card border border-line bg-panel p-3"
          >
            <div className="t-caption text-faint">{c.label}</div>
            <div className="t-readout mt-1">{c.value}</div>
          </motion.div>
        ))}
      </div>
      {children}
      <div className="flex flex-wrap justify-center gap-2">{actions}</div>
    </section>
  )
}

function Count({ to, reduce, delay }: { to: number; reduce: boolean; delay: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce) {
      el.textContent = String(to)
      return
    }
    let raf = 0
    const start = performance.now() + delay * 1000
    const loop = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 600))
      el.textContent = String(Math.round(to * t))
      if (t < 1) raf = requestAnimationFrame(loop)
    }
    el.textContent = '0'
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [to, reduce, delay])
  return <span ref={ref}>{reduce ? to : 0}</span>
}
