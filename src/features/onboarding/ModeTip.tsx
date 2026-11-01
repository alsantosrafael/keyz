import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Lightbulb, X } from 'lucide-react'
import type { TipMode } from '@keyz/shared'
import { IconButton } from '../../ui/controls'
import { useOnboarding, tutorialActions } from '../../state/onboarding'

const SPRING = { type: 'spring', stiffness: 260, damping: 30 } as const

/**
 * Dica de uma linha com um exemplo, mostrada na primeira visita ao modo. Depois de vista,
 * não volta; fechar também não volta.
 */
export function ModeTip({ mode, children }: { mode: TipMode; children: React.ReactNode }) {
  const seen = useOnboarding((s) => s.progress.tipsSeen.includes(mode))
  const [visible, setVisible] = useState(!seen)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!seen) tutorialActions.tipSeen(mode)
  }, [mode, seen])

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.aside
          key={mode}
          aria-label="Dica do modo"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={reduce ? { duration: 0.12 } : SPRING}
          className="mb-3 flex items-start gap-3 rounded-card border border-line bg-panel p-3"
        >
          <Lightbulb size={20} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-muted" />
          <p className="min-w-0 flex-1 text-muted">{children}</p>
          <IconButton label="Fechar dica" onClick={() => setVisible(false)}>
            <X size={18} strokeWidth={1.75} aria-hidden />
          </IconButton>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
