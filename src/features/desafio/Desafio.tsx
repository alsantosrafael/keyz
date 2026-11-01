import { useEffect } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { RotateCcw, Repeat2, Undo2 } from 'lucide-react'
import { difficultyName } from '@keyz/shared'
import { Button } from '../../ui/controls'
import { LiveRegion } from '../../ui/LiveRegion'
import { StaffCard } from '../../ui/StaffCard'
import { getApp, useDrill } from '../../state/app'
import { SessionSummary } from '../common/Summary'
import { fmtSeconds, useMicChords, usePublishKeyStates } from '../common/hooks'
import { Lobby } from './Lobby'
import { Round } from './Round'

const NONE = new Map<number, never>()

/** Desafio: jogo de reflexo e leitura de notas. Lobby → Contagem 3·2·1 → Rodada ↔ Resultado → Resumo. */
export function Desafio() {
  const { drill } = getApp()
  const screen = useDrill((s) => s.screen)
  const announce = useDrill((s) => s.announce)
  useMicChords(false)

  // Sair da tela durante o jogo volta ao lobby (sem timers soltos).
  useEffect(() => () => drill.backToLobby(), [drill])

  return (
    <div>
      <LiveRegion text={announce} />
      {screen === 'lobby' && <><h1 className="sr-only">Desafio</h1><Lobby /></>}
      {screen === 'countdown' && <Countdown3 />}
      {(screen === 'round' || screen === 'result') && <Round />}
      {screen === 'summary' && <Summary />}
    </div>
  )
}

function Countdown3() {
  const count = useDrill((s) => s.count)
  const reduce = useReducedMotion()
  usePublishKeyStates(NONE)
  const label = count === null ? '' : count === 0 ? 'Já!' : String(count)
  return (
    <div className="grid min-h-[360px] place-items-center" role="timer" aria-label="Contagem">
      <h1 className="sr-only">Prepare-se</h1>
      <motion.div
        key={label}
        initial={reduce ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 220, damping: 24 }}
        className="t-display text-track"
        style={{ fontSize: label === 'Já!' ? 'clamp(64px, 18vw, 120px)' : 'clamp(96px, 28vw, 180px)' }}
      >
        {label}
      </motion.div>
    </div>
  )
}

function Summary() {
  const { drill } = getApp()
  const s = useDrill((x) => x)
  const sum = s.summary
  usePublishKeyStates(NONE)
  if (!sum) return null
  const acc = s.config.accidental
  return (
    <>
      <h1 className="sr-only">Resumo do Desafio</h1>
      <SessionSummary
        title={sum.newBest ? 'Nova melhor marca!' : `${difficultyName[s.difficulty]} concluído`}
        stars={sum.stars}
        accuracy={sum.accuracy}
        chips={[
          { label: 'Maior sequência', value: sum.bestStreak },
          { label: 'Tempo médio', value: sum.averageResponseTime === null ? '—' : `${fmtSeconds(sum.averageResponseTime)} s` },
          { label: 'Notas', value: sum.attempts },
        ]}
        actions={
          <>
            <Button variant="primary" onClick={() => drill.play()}><RotateCcw size={18} strokeWidth={1.75} aria-hidden /> Jogar de novo</Button>
            <Button onClick={() => drill.backToLobby()}><Undo2 size={18} strokeWidth={1.75} aria-hidden /> Mudar nível</Button>
            {sum.hardest.length > 0 && <Button onClick={() => drill.practiceHard()}><Repeat2 size={18} strokeWidth={1.75} aria-hidden /> Treinar notas difíceis</Button>}
          </>
        }
      >
        {sum.hardest.length > 0 && (
          <div className="w-full text-left">
            <p className="t-caption mb-2 text-faint">Notas mais difíceis</p>
            <StaffCard notes={sum.hardest.map((midi) => ({ midi, role: 'target' as const }))} accidental={acc} />
          </div>
        )}
      </SessionSummary>
    </>
  )
}
