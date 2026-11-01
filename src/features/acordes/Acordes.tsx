import { useMemo } from 'react'
import { Check, Eye, RotateCcw, SkipForward } from 'lucide-react'
import { chordOrderedPitchClasses, pitchClass, solfegeName } from '@keyz/shared'
import { StaffCard, type StaffNote } from '../../ui/StaffCard'
import { TimeRing } from '../../ui/TimeRing'
import { Button, Switch } from '../../ui/controls'
import { LiveRegion } from '../../ui/LiveRegion'
import { cn } from '../../ui/cn'
import { type KeyVisual, WHITE_MIDIS, getApp, useChords, useSettings, useUi } from '../../state/app'
import { Hud } from '../common/Hud'
import { SessionSummary } from '../common/Summary'
import { usePublishKeyStates } from '../common/hooks'

/** Nota com a classe `pc` mais perto do centro da janela visível do teclado. */
function nearestVisible(pc: number, first: number, count: number): number {
  const lo = WHITE_MIDIS[first]
  const hi = WHITE_MIDIS[Math.min(WHITE_MIDIS.length - 1, first + count - 1)]
  const center = (lo + hi) / 2
  let best = lo
  let bestD = Infinity
  for (let m = lo; m <= hi; m++) {
    if (pitchClass(m) !== pc) continue
    const d = Math.abs(m - center)
    if (d < bestD) (best = m), (bestD = d)
  }
  return best
}

/** Acordes: monte o acorde segurando as teclas; o anel fecha conforme as notas certas entram. */
export function Acordes() {
  const { chords } = getApp()
  const s = useChords((x) => x)
  const accidental = useSettings((x) => x.settings.accidental)
  const first = useUi((x) => x.firstWhite)
  const visible = useUi((x) => x.visibleWhites)

  const keyStates = useMemo(() => {
    const m = new Map<number, KeyVisual>()
    if (!s.chord || s.finished) return m
    const expected = new Set(chordOrderedPitchClasses(s.chord))
    for (const n of s.played) {
      if (expected.has(pitchClass(n))) m.set(n, s.state === 'correct' ? 'correct' : 'chord-member')
      else m.set(n, 'wrong')
    }
    // O que falta aparece como ghost (depois de julgar ou com "Mostrar resposta").
    if (s.state === 'wrong' || s.showAnswer) {
      const missing = s.evaluation ? [...s.evaluation.missing] : [...expected].filter((pc) => !s.played.some((n) => pitchClass(n) === pc))
      for (const pc of missing) m.set(nearestVisible(pc, first, visible), 'ghost')
    }
    return m
  }, [s.chord, s.played, s.state, s.showAnswer, s.evaluation, s.finished, first, visible])
  usePublishKeyStates(keyStates)

  const staff = useMemo<StaffNote[]>(() => {
    if (!s.chord) return []
    const base = chords.chordMidis(s.chord)
    const out: StaffNote[] = base.map((m) => ({ midi: m, role: s.state === 'correct' ? 'correct' : 'target' }))
    for (const n of s.played) if (!base.some((b) => b % 12 === n % 12)) out.push({ midi: n, role: 'wrong' })
    return out
  }, [s.chord, s.played, s.state, chords])

  if (s.finished) {
    return (
      <div>
        <h1 className="sr-only">Modo Acordes</h1>
        <LiveRegion text={s.announce} />
        <SessionSummary
          title="Fim da sessão"
          stars={s.stars}
          accuracy={s.attempts ? s.correct / s.attempts : 0}
          chips={[
            { label: 'Acertos', value: `${s.correct} de ${s.attempts}` },
            { label: 'Rodadas', value: s.rounds },
            { label: 'Primeira tentativa', value: `${s.attempts ? Math.round((s.correct / s.attempts) * 100) : 0}%` },
          ]}
          actions={<Button variant="primary" onClick={() => chords.restart()}><RotateCcw size={18} strokeWidth={1.75} aria-hidden /> Jogar de novo</Button>}
        />
      </div>
    )
  }

  const ringState = s.state === 'correct' ? 'correct' : 'running'
  const status =
    s.state === 'correct' ? (
      <span className="t-label inline-flex items-center gap-1 text-success"><Check size={18} strokeWidth={2} aria-hidden /> Acertou</span>
    ) : s.state === 'wrong' && s.evaluation ? (
      <span className="t-label text-failure">
        {s.evaluation.missing.size > 0 && <>Faltou {[...s.evaluation.missing].map((p) => solfegeName(p, accidental)).join(', ')}. </>}
        {s.evaluation.extra.size > 0 && <>Nota a mais: {[...s.evaluation.extra].map((p) => solfegeName(p, accidental)).join(', ')}.</>}
      </span>
    ) : (
      <span className="t-label text-muted">Segure as teclas do acorde</span>
    )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
    <div className="flex min-w-0 flex-col gap-4">
      <h1 className="sr-only">Modo Acordes</h1>
      <LiveRegion text={s.announce} />
      <Hud index={s.round} total={s.rounds} streak={s.streak} milestone={false} />

      <TimeRing duration={1} elapsed={0} roundKey={s.round} paused={false} state={ringState} progress={s.total ? s.matched / s.total : 0}>
        <div key={s.chordName} className="k-note-in t-title min-h-9 text-center text-[32px] sm:text-[40px]" style={{ fontFamily: 'var(--font-rounded)' }}>
          {s.chordName.replace(' maior', '').replace(' menor', '')}
        </div>
        <div className="t-headline text-muted">{s.chord?.quality === 'minor' ? 'menor' : 'maior'}</div>
        <div className="t-readout mt-1 text-muted" aria-label={`${s.matched} de ${s.total} notas`}>{s.matched}/{s.total}</div>
      </TimeRing>

      <div className={cn('min-h-7 text-center', s.state === 'wrong' && 'k-shake')} key={`${s.state}-${s.played.length}`}>{status}</div>

      <StaffCard notes={staff} accidental={accidental} empty="O acorde aparece na pauta" />
    </div>
      <aside aria-label="Opções dos acordes" className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4 lg:sticky lg:top-0">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => chords.setShowAnswer(!s.showAnswer)} aria-pressed={s.showAnswer}><Eye size={18} strokeWidth={1.75} aria-hidden /> Mostrar resposta</Button>
          <Button onClick={() => chords.nextChord()}><SkipForward size={18} strokeWidth={1.75} aria-hidden /> Pular</Button>
        </div>
        <div className="divide-y divide-line">
          <Switch label="Maiores" checked={s.includeMajor} onChange={(v) => chords.setQualities(v, s.includeMinor)} />
          <Switch label="Menores" checked={s.includeMinor} onChange={(v) => chords.setQualities(s.includeMajor, v)} />
          <Switch label="Avançar sozinho" checked={s.autoAdvance} onChange={(v) => chords.setAutoAdvance(v)} />
        </div>
      </aside>
    </div>
  )
}
