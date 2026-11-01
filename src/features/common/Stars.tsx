import { useEffect } from 'react'
import { Star } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { services } from '../../application'
import { cn } from '../../ui/cn'

/** Estrelas reveladas uma a uma, com mola e um tom ascendente a cada estrela (etapas de 250 ms). */
export function Stars({ count, animate = true }: { count: number; animate?: boolean }) {
  const reduce = useReducedMotion() || !animate
  useEffect(() => {
    if (reduce) return
    const ids = Array.from({ length: count }, (_, i) => window.setTimeout(() => services().feedback.cue('star', i), 250 * (i + 1)))
    return () => ids.forEach(clearTimeout)
  }, [count, reduce])
  return (
    <div role="img" aria-label={`${count} de 3 estrelas`} className="flex justify-center gap-2">
      {[0, 1, 2].map((i) => {
        const earned = i < count
        return (
          <motion.span
            key={i}
            initial={reduce ? false : { scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 220, damping: 24, delay: earned ? 0.25 * (i + 1) : 0.1 }}
            className={cn('grid place-items-center', earned ? 'text-gold' : 'text-faint')}
          >
            <Star size={56} strokeWidth={1.75} fill={earned ? 'currentColor' : 'none'} aria-hidden />
          </motion.span>
        )
      })}
    </div>
  )
}
