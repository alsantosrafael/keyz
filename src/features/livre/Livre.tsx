import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Eraser, Mic } from 'lucide-react'
import { StaffCard, type StaffNote } from '../../ui/StaffCard'
import { NoteReadout } from '../../ui/NoteReadout'
import { NoteTrail } from '../../ui/NoteTrail'
import { TuningArc } from '../../ui/Meter'
import { Button, Chip, Segmented, Slider, Switch } from '../../ui/controls'
import { LiveRegion } from '../../ui/LiveRegion'
import { cn } from '../../ui/cn'
import { getApp, useFree, useMic, useSettings, useUi } from '../../state/app'
import { usePublishKeyStates } from '../common/hooks'
import { computerKeyLabel } from '../../application'

const NO_STATES = new Map<number, never>()

/** Livre: a mesa de som. O display nunca apaga: ao soltar a tecla, só aquieta (SPEC › Regras de leitura estável). */
export function Livre() {
  const { free, hub } = getApp()
  const shown = useFree((s) => s.shown)
  const held = useFree((s) => s.held)
  const fromMic = useFree((s) => s.fromMic)
  const active = useFree((s) => s.active)
  const history = useFree((s) => s.history)
  const announce = useFree((s) => s.announce)
  const { settings, update } = useSettings()
  const micStatus = useMic((s) => s.status.kind)
  const stable = useMic((s) => s.stable)
  const setMicPrompt = useUi((s) => s.setMicPrompt)
  const lastMidi = useRef<number | null>(null)
  usePublishKeyStates(NO_STATES)

  // Primeiro toque: o cartão de boas-vindas some e nunca volta.
  useEffect(() => {
    if (settings.welcomeSeen) return
    return hub.events.subscribe((e) => e.type === 'on' && useSettings.getState().update({ welcomeSeen: true }))
  }, [hub, settings.welcomeSeen])

  const getBlocks = useCallback(() => free.trail, [free])

  // Direção do crossfade: nota mais aguda sobe.
  const midi = shown?.kind === 'note' ? shown.midi : shown ? shown.midis[shown.midis.length - 1] : null
  const dir = midi !== null && lastMidi.current !== null && midi < lastMidi.current ? 'down' : 'up'
  useEffect(() => {
    lastMidi.current = midi
  }, [midi])

  const staffNotes = useMemo<StaffNote[]>(() => {
    const midis = shown ? (shown.kind === 'note' ? [shown.midi] : shown.midis) : []
    return midis.map((m) => ({ midi: m, role: 'played' as const }))
  }, [shown])

  const chordRoot = shown?.kind === 'chord' ? shown.name.replace(/ (maior|menor)$/, '') : ''
  const chordQuality = shown?.kind === 'chord' ? (shown.name.endsWith('menor') ? 'menor' : 'maior') : ''
  const title = !shown ? '—' : shown.kind === 'note' ? shown.name : shown.kind === 'chord' ? chordRoot : shown.names.join(' ')
  const sub = !shown
    ? ''
    : shown.kind === 'note'
      ? `${shown.octave} · ${shown.hz.toFixed(1).replace('.', ',')} Hz`
      : shown.kind === 'chord'
        ? `${chordQuality} · ${shown.inversion}`
        : `${shown.midis.length} notas`
  const micOn = micStatus !== 'off'
  const cents = fromMic && stable ? stable.cents : null

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
    <div className="flex min-w-0 flex-col gap-4">
      <h1 className="sr-only">Modo Livre</h1>
      <LiveRegion text={announce} />

      {!settings.welcomeSeen && !shown && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-panel p-4">
          <div>
            <p className="t-headline">Toque uma tecla para começar</p>
            <p className="text-[14px] text-muted">
              No teclado do computador: {['A', 'S', 'D', 'F', 'G', 'H', 'J'].map((k) => k).join(' ')} tocam as brancas e {['W', 'E', 'T', 'Y', 'U'].join(' ')} as pretas (começando em {computerKeyLabel(0)}).
            </p>
          </div>
          {!micOn && (
            <Button variant="primary" onClick={() => setMicPrompt(true)}>
              <Mic size={18} strokeWidth={1.75} aria-hidden /> Ativar microfone
            </Button>
          )}
        </div>
      )}

      {settings.showTrail && <NoteTrail getBlocks={getBlocks} />}

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <NoteReadout
          title={title}
          sub={sub}
          muted={held}
          dir={dir}
          compact={shown?.kind === 'notes'}
          minHeight={150}
          fade={fromMic && held ? 0.6 : 1}
          tag={held ? 'última nota' : fromMic && active.length ? 'do microfone · aproximado' : undefined}
        />
        <div className={cn('transition-opacity duration-200', held && 'opacity-60')}>
          <StaffCard notes={staffNotes} accidental={settings.accidental} empty="Toque para ver a nota na pauta" />
        </div>
      </div>

      {micOn && <TuningArc cents={cents} strength={stable ? 1 : 0.3} active={fromMic && active.length > 0} />}

      <div className="flex min-h-10 items-center gap-2 overflow-x-auto pb-1" aria-label="Histórico" role="list">
        {history.length === 0 && <span className="text-[14px] text-faint">As últimas 12 notas aparecem aqui.</span>}
        {history.map((h, i) => (
          <Chip key={h.id} className={cn(i === history.length - 1 && 'border-track text-track')}>
            <span role="listitem">{h.label}</span>
          </Chip>
        ))}
      </div>

    </div>
      <aside aria-label="Ajustes do Livre" className="grid gap-y-1 rounded-card border border-line bg-panel p-4 sm:grid-cols-2 lg:sticky lg:top-0 lg:grid-cols-1">
        <div className="flex items-center justify-between py-1 sm:col-span-2 lg:col-span-1">
          <span className="text-[16px]">Notas pretas</span>
          <Segmented label="Sustenido ou bemol" value={settings.accidental} onChange={(accidental) => update({ accidental })} options={[{ value: 'sharp', label: '♯', aria: 'Sustenido' }, { value: 'flat', label: '♭', aria: 'Bemol' }]} />
        </div>
        <Switch label="Mostrar nomes nas teclas" checked={settings.showNoteNames} onChange={(showNoteNames) => update({ showNoteNames })} />
        <Switch label="Mostrar trilha" checked={settings.showTrail} onChange={(showTrail) => update({ showTrail })} />
        <Switch label="Som do piano" checked={settings.pianoSound} onChange={(pianoSound) => update({ pianoSound })} />
        <Slider label="Volume" valueText={`${Math.round(settings.pianoVolume * 100)}%`} value={settings.pianoVolume} onChange={(pianoVolume) => update({ pianoVolume })} />
        <div className="sm:col-span-2 lg:col-span-1">
          <Button onClick={() => free.clear()}><Eraser size={18} strokeWidth={1.75} aria-hidden /> Limpar</Button>
        </div>
      </aside>
    </div>
  )
}
