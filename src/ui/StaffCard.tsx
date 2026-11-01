import { type Accidental, staffPlacement } from '@keyz/shared'
import { Check, Circle, Music2, Target, X } from 'lucide-react'
import { cn } from './cn'

export type StaffRole = 'target' | 'played' | 'correct' | 'wrong' | 'ghost'
export interface StaffNote {
  midi: number
  role: StaffRole
}

const ROLE_COLOR: Record<StaffRole, string> = {
  target: 'var(--text)',
  played: 'var(--track)',
  correct: 'var(--success)',
  wrong: 'var(--failure)',
  ghost: 'var(--success)',
}
const ROLE_LABEL: Record<StaffRole, string> = { target: 'alvo', played: 'tocada', correct: 'certa', wrong: 'errada', ghost: 'resposta' }
const ROLE_ICON = { target: Target, played: Music2, correct: Check, wrong: X, ghost: Circle } as const

const GAP = 12
const TREBLE_BOTTOM = 92
const BASS_BOTTOM = 200
const stepY = (clef: 'treble' | 'bass', step: number) => (clef === 'treble' ? TREBLE_BOTTOM : BASS_BOTTOM) - (step * GAP) / 2

/**
 * Pauta dupla em SVG. Altura fixa (nada salta quando a nota muda de região). Cada nota
 * colorida tem um rótulo de texto na legenda: a cor nunca é o único sinal.
 */
export function StaffCard({
  notes, accidental = 'sharp', empty, className,
}: { notes: StaffNote[]; accidental?: Accidental; empty?: string; className?: string }) {
  const placed = notes
    .map((n) => ({ ...n, p: staffPlacement(n.midi, accidental) }))
    .sort((a, b) => a.midi - b.midi)
  // Segundas adjacentes dividem a coluna: a de cima vai para a direita.
  let lastStep: number | null = null
  const columns = placed.map((n) => {
    const shift = lastStep !== null && n.p.step - lastStep === 1 ? 1 : 0
    lastStep = shift ? null : n.p.step
    return shift
  })
  const roles = [...new Set(placed.map((n) => n.role))]

  const lines = (bottom: number) => [0, 1, 2, 3, 4].map((i) => bottom - i * GAP)
  return (
    <div className={cn('rounded-card border border-line bg-panel p-3', className)}>
      <svg viewBox="0 -12 280 232" className="h-[132px] w-full sm:h-[200px]" role="img" aria-label={placed.length ? `Pauta com ${placed.length} ${placed.length === 1 ? 'nota' : 'notas'}` : 'Pauta vazia'}>
        {[TREBLE_BOTTOM, BASS_BOTTOM].map((bottom) =>
          lines(bottom).map((y) => <line key={`${bottom}-${y}`} x1="10" x2="270" y1={y} y2={y} stroke="var(--line-strong)" strokeWidth="1.2" />),
        )}
        <line x1="10" x2="10" y1={TREBLE_BOTTOM - 4 * GAP} y2={BASS_BOTTOM} stroke="var(--line-strong)" strokeWidth="1.2" />
        <text x="16" y={TREBLE_BOTTOM + 8} fontSize="62" fill="var(--text-muted)" aria-hidden fontFamily="'Noto Music','Bravura','Apple Symbols',serif">𝄞</text>
        <text x="16" y={BASS_BOTTOM - 10} fontSize="50" fill="var(--text-muted)" aria-hidden fontFamily="'Noto Music','Bravura','Apple Symbols',serif">𝄢</text>
        {placed.map((n, i) => {
          const x = 150 + columns[i] * 15
          const y = stepY(n.p.clef, n.p.step)
          const color = ROLE_COLOR[n.role]
          const bottom = n.p.clef === 'treble' ? TREBLE_BOTTOM : BASS_BOTTOM
          const ledgers: number[] = []
          for (let k = 1; k <= n.p.ledgerLines; k++) {
            const stepAt = n.p.step < 0 ? -2 * k : 8 + 2 * k
            ledgers.push(bottom - (stepAt * GAP) / 2)
          }
          return (
            <g key={`${n.midi}-${n.role}`} className="k-note-in" style={{ transformOrigin: `${x}px ${y}px` }}>
              {ledgers.map((ly) => <line key={ly} x1={x - 14} x2={x + 14} y1={ly} y2={ly} stroke="var(--line-strong)" strokeWidth="1.4" />)}
              {n.p.accidental && (
                <text x={x - 26} y={y + 6} fontSize="20" fill={color} fontFamily="var(--font-ui)" aria-hidden>{n.p.accidental === 'sharp' ? '♯' : '♭'}</text>
              )}
              <ellipse
                cx={x} cy={y} rx="9.5" ry="6.6" transform={`rotate(-18 ${x} ${y})`}
                fill={n.role === 'ghost' ? 'var(--surface-panel)' : color}
                stroke={color} strokeWidth="2.4" strokeDasharray={n.role === 'ghost' ? '3 2.5' : undefined}
              />
              {placed.length === 1 && <line x1={n.p.step >= 4 ? x - 8 : x + 8} x2={n.p.step >= 4 ? x - 8 : x + 8} y1={y} y2={n.p.step >= 4 ? y + 38 : y - 38} stroke={color} strokeWidth="1.8" />}
            </g>
          )
        })}
      </svg>
      <div className="flex min-h-8 flex-wrap items-center justify-center gap-2" aria-hidden={roles.length === 0}>
        {roles.length === 0 && empty && <span className="text-[14px] text-faint">{empty}</span>}
        {roles.map((r) => {
          const Icon = ROLE_ICON[r]
          return (
            <span key={r} className="t-label inline-flex items-center gap-1 text-muted">
              <Icon size={16} strokeWidth={1.75} aria-hidden style={{ color: ROLE_COLOR[r] }} />
              {ROLE_LABEL[r]}
            </span>
          )
        })}
      </div>
    </div>
  )
}
