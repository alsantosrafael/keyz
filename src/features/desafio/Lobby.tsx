import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Award, Check, Play, SignalHigh, SignalLow, SignalMedium, SlidersHorizontal, Star } from 'lucide-react'
import { DIFFICULTIES, type Difficulty, difficultyName, drillPreset, noteSolfege, notePool } from '@keyz/shared'
import { Button, Segmented } from '../../ui/controls'
import { cn } from '../../ui/cn'
import type { DrillContent } from '../../application'
import { getApp, useDrill } from '../../state/app'
import { CustomizeSheet } from './CustomizeSheet'

const ICON = { easy: SignalLow, medium: SignalMedium, advanced: SignalHigh, professional: Award } as const
const ACCENT = { easy: 'var(--success)', medium: 'var(--warning)', advanced: 'var(--failure)', professional: 'var(--track-chords)' } as const
const TONE = {
  easy: 'Calmo · lê o nome da nota',
  medium: 'Equilibrado · nome e pauta',
  advanced: 'Rápido · nome e pauta',
  professional: 'Exigente · só pauta',
} as const

/** Duas fichas por nível: o tempo e o que entra no sorteio. */
function facts(d: Difficulty, content: DrillContent): { time: string; scope: string } {
  const c = drillPreset(d)
  if (content === 'chords') {
    const scope =
      d === 'professional' ? 'Sextas, nonas, alterados, meio-dim. e inversões'
      : d === 'advanced' ? 'Sétimas, sus, dim., aum. e inversões'
      : d === 'medium' ? 'Maiores e menores, ♯ e ♭, tríades invertidas'
      : 'Maiores e menores · raízes brancas'
    return { time: `${Math.round(c.timePerNote * 1.5)}–${Math.round(c.timePerNote * 3)} s`, scope }
  }
  const pool = notePool(c)
  return {
    time: `${c.timePerNote} s`,
    scope: `${noteSolfege(pool[0])} a ${noteSolfege(pool[pool.length - 1])}${c.includeAccidentals ? ' · ♯ e ♭' : ' · só brancas'}`,
  }
}

type Mark = { stars: number; bestStreak: number } | undefined

/** Lobby: o tipo de treino, quatro cartões de nível com a melhor marca e `Jogar` sempre a um toque. */
export function Lobby() {
  const { drill } = getApp()
  const selected = useDrill((s) => s.difficulty)
  const best = useDrill((s) => s.best)
  const content = useDrill((s) => s.content)
  const [custom, setCustom] = useState(false)
  const reduce = useReducedMotion()
  return (
    <div className="flex flex-col gap-8 pt-2">
      <div className="flex flex-col items-center gap-2">
        <p className="t-caption text-faint">O que treinar</p>
        <Segmented<DrillContent>
          label="Treinar"
          value={content}
          onChange={(c) => drill.selectContent(c)}
          options={[{ value: 'notes', label: 'Notas', aria: 'Notas, uma por vez' }, { value: 'chords', label: 'Acordes', aria: 'Acordes' }]}
        />
      </div>

      <div className="flex flex-col gap-3">
        <p className="t-caption text-faint">Nível</p>
        <div role="radiogroup" aria-label="Nível" className="grid gap-4 sm:grid-cols-2">
          {DIFFICULTIES.map((d, i) => {
            const Icon = ICON[d]
            const mark = (best as Record<string, Mark>)[content === 'chords' ? `chords-${d}` : d]
            const on = d === selected
            const { time, scope } = facts(d, content)
            return (
              <motion.button
                key={d}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => drill.selectDifficulty(d)}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduce ? { duration: 0.12 } : { delay: i * 0.04, type: 'spring', stiffness: 240, damping: 26 }}
                className={cn(
                  'group relative flex cursor-pointer flex-col gap-4 overflow-hidden rounded-card border bg-panel p-5 text-left transition-[transform,box-shadow,border-color] duration-[120ms] active:scale-[0.985]',
                  on ? 'border-track shadow-[0_0_0_2px_var(--track),0_0_24px_var(--glow-track)]' : 'border-line hover:border-line-strong',
                )}
              >
                <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: ACCENT[d] }} />
                <span className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="grid size-11 shrink-0 place-items-center rounded-control"
                    style={{ color: ACCENT[d], background: `color-mix(in srgb, ${ACCENT[d]} 16%, transparent)` }}
                  >
                    <Icon size={28} strokeWidth={2} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="t-headline">{difficultyName[d]}</span>
                      {/* Quatro degraus: a posição do nível na escada, sem depender de cor. */}
                      <span aria-hidden className="flex items-center gap-[3px]">
                        {DIFFICULTIES.map((_, step) => (
                          <span key={step} className="h-1.5 w-3.5 rounded-full" style={{ background: step <= i ? ACCENT[d] : 'var(--line)' }} />
                        ))}
                      </span>
                    </span>
                    <span className="t-label text-muted">{TONE[d]}</span>
                  </span>
                  <span
                    aria-hidden
                    className={cn('grid size-6 shrink-0 place-items-center rounded-full border transition-opacity duration-[120ms]', on ? 'border-track bg-track text-on-track opacity-100' : 'border-line opacity-60')}
                  >
                    {on && <Check size={14} strokeWidth={2.5} />}
                  </span>
                </span>

                <span className="flex flex-wrap items-center gap-x-2 gap-y-2">
                  <span className="t-label rounded-full bg-inset px-3 py-1 text-muted">{time}</span>
                  <span className="t-label rounded-full bg-inset px-3 py-1 text-muted">{scope}</span>
                  <span className="ml-auto inline-flex items-center gap-2 text-[14px]">
                    {mark ? (
                      <>
                        <span className="inline-flex items-center gap-0.5 text-gold" aria-label={`Melhor: ${mark.stars} estrelas`}>
                          {[0, 1, 2].map((s) => <Star key={s} size={16} strokeWidth={1.75} fill={s < mark.stars ? 'currentColor' : 'none'} aria-hidden />)}
                        </span>
                        <span className="text-muted">sequência {mark.bestStreak}</span>
                      </>
                    ) : <span className="text-faint">Sem marca</span>}
                  </span>
                </span>
              </motion.button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Button variant="primary" className="min-h-14 flex-1 text-[18px]" onClick={() => drill.play()}>
          <Play size={22} strokeWidth={1.75} fill="currentColor" aria-hidden /> Jogar · {difficultyName[selected]}
        </Button>
        <Button onClick={() => setCustom(true)} aria-haspopup="dialog"><SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden /> Personalizar</Button>
      </div>
      <CustomizeSheet open={custom} onClose={() => setCustom(false)} />
    </div>
  )
}
