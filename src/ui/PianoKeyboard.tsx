import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { type Accidental, isBlackKey, noteLabel, pitchClass, solfegeName } from '@keyz/shared'
import { type InputHub, computerKeyLabel, baseNoteForOctave } from '../application'
import { type KeyVisual, WHITE_MIDIS, useUi } from '../state/app'
import { cn } from './cn'

export type { KeyVisual }

interface Props {
  hub: InputHub
  /** Estados visuais além de "pressionada" (que é imperativa, no mesmo quadro). */
  keyStates?: ReadonlyMap<number, KeyVisual>
  zoom: number
  showNames: boolean
  showShortcuts: boolean
  accidental: Accidental
  className?: string
}

const MIN_WHITE_PX = 44

/** Notas visíveis: das brancas [first, first+count) mais as pretas entre elas. */
function visibleKeys(first: number, count: number): { midi: number; black: boolean; whiteIndex: number }[] {
  const out: { midi: number; black: boolean; whiteIndex: number }[] = []
  const lo = WHITE_MIDIS[first]
  const hi = WHITE_MIDIS[Math.min(WHITE_MIDIS.length - 1, first + count - 1)]
  let w = -1
  for (let m = lo; m <= hi; m++) {
    if (isBlackKey(m)) out.push({ midi: m, black: true, whiteIndex: w })
    else {
      w += 1
      out.push({ midi: m, black: false, whiteIndex: w })
    }
  }
  return out
}

function PianoKeyboardImpl({ hub, keyStates, zoom, showNames, showShortcuts, accidental, className }: Props) {
  const firstWhite = useUi((s) => s.firstWhite)
  const visibleWhites = useUi((s) => s.visibleWhites)
  const octave = useUi((s) => s.octave)
  const setVisible = useUi((s) => s.setVisibleWhites)
  const rootRef = useRef<HTMLDivElement>(null)
  const refs = useRef(new Map<number, HTMLButtonElement>())
  const pointers = useRef(new Map<number, number>())
  const [focusNote, setFocusNote] = useState<number | null>(null)

  // Teclas ≥ 44 px: a janela cabe na largura, limitada pelo zoom do ajuste.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const measure = () => {
      const fit = Math.max(5, Math.floor(el.clientWidth / MIN_WHITE_PX))
      setVisible(Math.max(5, Math.min(zoom, fit)), fit)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [zoom, setVisible])

  const keys = useMemo(() => visibleKeys(firstWhite, visibleWhites), [firstWhite, visibleWhites])
  const whiteW = 100 / visibleWhites

  // Pressionada = atributo imperativo no mesmo quadro do evento (sem passar pelo React).
  const paint = useCallback((note: number) => {
    const el = refs.current.get(note)
    if (!el) return
    const source = hub.active.get(note)
    if (source) {
      el.setAttribute('data-pressed', '')
      el.setAttribute('data-source', source)
      el.setAttribute('aria-pressed', 'true')
    } else {
      el.removeAttribute('data-pressed')
      el.removeAttribute('data-source')
      el.setAttribute('aria-pressed', 'false')
    }
  }, [hub])
  useLayoutEffect(() => {
    for (const k of keys) paint(k.midi)
  }, [keys, paint])
  useEffect(() => hub.events.subscribe((e) => paint(e.note)), [hub, paint])

  const noteAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-note]')
    return el && rootRef.current?.contains(el) ? Number(el.dataset.note) : null
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const note = noteAt(e.clientX, e.clientY)
    if (note === null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, note)
    hub.tap(note, 'screen', true)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId) || hub.latch) return
    const prev = pointers.current.get(e.pointerId)!
    const note = noteAt(e.clientX, e.clientY)
    if (note === null || note === prev) return
    // Glissando: toca as teclas por onde o dedo passa.
    hub.tap(prev, 'screen', false)
    pointers.current.set(e.pointerId, note)
    hub.tap(note, 'screen', true)
  }
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const note = pointers.current.get(e.pointerId)
    if (note === undefined) return
    pointers.current.delete(e.pointerId)
    hub.tap(note, 'screen', false)
  }

  // Teclado do navegador: setas movem o foco; Enter e Espaço tocam.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const note = Number((e.target as HTMLElement).closest<HTMLElement>('[data-note]')?.dataset.note)
    if (!Number.isFinite(note)) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!e.repeat) hub.tap(note, 'screen', true)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const sorted = keys.map((k) => k.midi)
      const next = sorted[sorted.indexOf(note) + (e.key === 'ArrowRight' ? 1 : -1)]
      if (next !== undefined) {
        setFocusNote(next)
        refs.current.get(next)?.focus()
      }
    }
  }
  const onKeyUp = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const note = Number((e.target as HTMLElement).closest<HTMLElement>('[data-note]')?.dataset.note)
    if (Number.isFinite(note) && (e.key === 'Enter' || e.key === ' ')) hub.tap(note, 'screen', false)
  }

  const tabbable = focusNote !== null && keys.some((k) => k.midi === focusNote) ? focusNote : (keys.find((k) => !k.black && k.midi % 12 === 0)?.midi ?? keys[0]?.midi)
  const base = baseNoteForOctave(octave)

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Teclado de piano"
      className={cn('relative w-full select-none overflow-hidden bg-[var(--key-bed)]', className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="relative size-full">
        {keys.map((k) => {
          const visual = keyStates?.get(k.midi)
          const left = k.black ? (k.whiteIndex + 1) * whiteW - whiteW * 0.31 : k.whiteIndex * whiteW
          const width = k.black ? whiteW * 0.62 : whiteW
          const label = noteLabel(k.midi, accidental)
          const shortcut = showShortcuts ? computerKeyLabel(k.midi - base) : null
          const alwaysName = visual === 'target' || visual === 'correct' || visual === 'wrong'
          const name = showNames || alwaysName ? solfegeName(pitchClass(k.midi), accidental) : null
          return (
            <button
              key={k.midi}
              ref={(el) => {
                if (el) refs.current.set(k.midi, el)
                else refs.current.delete(k.midi)
              }}
              type="button"
              tabIndex={k.midi === tabbable ? 0 : -1}
              data-note={k.midi}
              data-white={!k.black}
              data-state={visual}
              aria-label={label}
              aria-pressed="false"
              onFocus={() => setFocusNote(k.midi)}
              className={cn('piano-key flex flex-col items-center justify-end gap-0.5 pb-2 text-center outline-offset-[-3px] focus-visible:z-30', k.black ? 'z-20' : 'z-10')}
              style={{
                left: `${left}%`,
                width: `${width}%`,
                top: 0,
                height: k.black ? '62%' : '100%',
                outlineWidth: 3,
              }}
            >
              {/* Área de toque da preta se estende 6 px para fora da forma visual. */}
              {k.black && <span aria-hidden className="absolute inset-y-0 -inset-x-[6px]" />}
              {visual === 'correct' && <Check size={16} strokeWidth={2.5} aria-hidden />}
              {visual === 'wrong' && <X size={16} strokeWidth={2.5} aria-hidden />}
              {shortcut && <span className="t-caption rounded bg-black/15 px-1 normal-case tracking-normal">{shortcut}</span>}
              {name && <span className="t-label leading-none">{name}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
export const PianoKeyboard = memo(PianoKeyboardImpl)

/**
 * Faixa de navegação (como a do GarageBand): miniatura das 88 teclas com uma janela que mostra
 * a região visível. Arrastar tem alternativa por setas `‹ ›` (44 px) e por teclado (role=slider).
 */
export function KeyboardNav({ hub }: { hub: InputHub }) {
  const first = useUi((s) => s.firstWhite)
  const visible = useUi((s) => s.visibleWhites)
  const setFirst = useUi((s) => s.setFirstWhite)
  const total = WHITE_MIDIS.length
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [marks, setMarks] = useState<number[]>([])

  useEffect(() => hub.events.subscribe(() => setMarks(hub.activeNotes)), [hub])

  const fromX = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect()
    const ratio = (clientX - r.left) / r.width
    setFirst(Math.round(ratio * total - visible / 2))
  }
  const maxFirst = total - visible
  return (
    <div className="flex items-center gap-1 bg-panel px-2" style={{ borderTop: '1px solid var(--line)' }}>
      <button type="button" aria-label="Oitava abaixo" className="inline-flex size-11 cursor-pointer items-center justify-center text-muted hover:text-ink" onClick={() => setFirst(first - 7)}>
        <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
      </button>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Região visível do teclado"
        aria-valuemin={0}
        aria-valuemax={maxFirst}
        aria-valuenow={first}
        aria-valuetext={`de ${noteLabel(WHITE_MIDIS[first])} a ${noteLabel(WHITE_MIDIS[Math.min(total - 1, first + visible - 1)])}`}
        className="relative h-11 flex-1 cursor-grab touch-none"
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          fromX(e.clientX)
        }}
        onPointerMove={(e) => dragging.current && fromX(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'PageUp' ? 7 : e.key === 'PageDown' ? -7 : 0
          if (step) {
            e.preventDefault()
            setFirst(first + step)
          }
        }}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-2.5 bottom-2.5 overflow-hidden rounded-[6px] bg-inset"
          style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 calc(100% / 52 - 1px), var(--line) calc(100% / 52 - 1px) calc(100% / 52))' }}
        >
          {marks.map((m) => (
            <i key={m} className="absolute bottom-0 h-1/2 w-[3px] rounded-sm bg-track" style={{ left: `${(Math.max(0, WHITE_MIDIS.findIndex((w) => w >= m)) / total) * 100}%` }} />
          ))}
        </div>
        <div
          aria-hidden
          className="absolute top-1.5 bottom-1.5 rounded-[8px] border-2 border-track bg-[var(--glow-track)]"
          style={{ left: `${(first / total) * 100}%`, width: `${(visible / total) * 100}%` }}
        />
      </div>
      <button type="button" aria-label="Oitava acima" className="inline-flex size-11 cursor-pointer items-center justify-center text-muted hover:text-ink" onClick={() => setFirst(first + 7)}>
        <ChevronRight size={20} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  )
}
