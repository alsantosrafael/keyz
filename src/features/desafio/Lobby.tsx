import { useState } from 'react'
import { Play, SignalHigh, SignalLow, SignalMedium, SlidersHorizontal, Star } from 'lucide-react'
import { DIFFICULTIES, type Difficulty, difficultyName, drillPreset, noteSolfege, notePool } from '@keyz/shared'
import { Button } from '../../ui/controls'
import { cn } from '../../ui/cn'
import { getApp, useDrill } from '../../state/app'
import { CustomizeSheet } from './CustomizeSheet'

const ICON = { easy: SignalLow, medium: SignalMedium, advanced: SignalHigh } as const
const ACCENT = { easy: 'var(--success)', medium: 'var(--warning)', advanced: 'var(--failure)' } as const
const TONE = { easy: 'calmo · nome da nota', medium: 'equilibrado · nome e pauta', advanced: 'rápido · só pauta' } as const

function describe(d: Difficulty): string {
  const c = drillPreset(d)
  const pool = notePool(c)
  return `${c.timePerNote} s · ${noteSolfege(pool[0])} a ${noteSolfege(pool[pool.length - 1])}${c.includeAccidentals ? '' : ' · só brancas'}`
}

/** Lobby: três cartões de nível, a melhor marca de cada um e `Jogar` sempre a um toque. */
export function Lobby() {
  const { drill } = getApp()
  const selected = useDrill((s) => s.difficulty)
  const best = useDrill((s) => s.best)
  const [custom, setCustom] = useState(false)
  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Nível" className="grid gap-3 sm:grid-cols-3">
        {DIFFICULTIES.map((d) => {
          const Icon = ICON[d]
          const mark = (best as Record<string, { stars: number; bestStreak: number } | undefined>)[d]
          const on = d === selected
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => drill.selectDifficulty(d)}
              className={cn(
                'relative flex min-h-[132px] cursor-pointer flex-col items-start gap-1 overflow-hidden rounded-card border bg-panel p-4 text-left transition-[transform,box-shadow] duration-[120ms] active:scale-[0.985]',
                on ? 'border-track shadow-[0_0_0_2px_var(--track),0_0_24px_var(--glow-track)]' : 'border-line',
              )}
            >
              <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: ACCENT[d] }} />
              <span className="flex items-center gap-2">
                <Icon size={22} strokeWidth={1.75} aria-hidden style={{ color: ACCENT[d] }} />
                <span className="t-headline">{difficultyName[d]}</span>
              </span>
              <span className="text-[14px] text-muted">{describe(d)}</span>
              <span className="text-[14px] text-faint">{TONE[d]}</span>
              <span className="mt-auto flex items-center gap-3 pt-2 text-[14px]">
                {mark ? (
                  <>
                    <span className="inline-flex items-center gap-1 text-gold" aria-label={`Melhor: ${mark.stars} estrelas`}>
                      {[0, 1, 2].map((i) => <Star key={i} size={16} strokeWidth={1.75} fill={i < mark.stars ? 'currentColor' : 'none'} aria-hidden />)}
                    </span>
                    <span className="text-muted">melhor sequência {mark.bestStreak}</span>
                  </>
                ) : <span className="text-faint">Sem marca ainda</span>}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <Button variant="primary" className="min-h-14 flex-1 text-[18px]" onClick={() => drill.play()}>
          <Play size={22} strokeWidth={1.75} fill="currentColor" aria-hidden /> Jogar
        </Button>
        <Button onClick={() => setCustom(true)} aria-haspopup="dialog"><SlidersHorizontal size={18} strokeWidth={1.75} aria-hidden /> Personalizar</Button>
      </div>
      <CustomizeSheet open={custom} onClose={() => setCustom(false)} />
    </div>
  )
}
