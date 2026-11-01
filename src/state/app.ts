import { create } from 'zustand'
import {
  ChordSession, DrillSession, type Emitter, FreeSession, InputHub, MicController, type MicSnapshot, connectSound, services,
  type ChordSnapshot, type DrillSnapshot, type FreeSnapshot,
} from '../application'
import { STORAGE_KEYS, type Settings, defaultSettings, parseSettings } from '@keyz/shared'

/** Instâncias de `application` vivas durante a sessão. Criadas uma vez em `initApp`. */
export interface App {
  hub: InputHub
  mic: MicController
  free: FreeSession
  chords: ChordSession
  drill: DrillSession
}

let app: App | null = null
export const getApp = (): App => {
  if (!app) throw new Error('app não inicializado')
  return app
}

function bridge<T>(initial: T, emitter: Emitter<T>) {
  const store = create<{ snap: T }>(() => ({ snap: initial }))
  emitter.subscribe((snap) => store.setState({ snap }))
  return store
}

// ---------- ajustes (persistidos, validados com Zod) ----------
export const useSettings = create<{ settings: Settings; update: (patch: Partial<Settings>) => void }>((set, get) => ({
  settings: defaultSettings,
  update: (patch) => {
    const settings = parseSettings({ ...get().settings, ...patch })
    set({ settings })
    try {
      services().storage.write(STORAGE_KEYS.settings, settings)
    } catch {
      /* sem serviços (testes de UI): só em memória */
    }
  },
}))

// ---------- interface: janela do teclado, oitava do teclado do computador ----------
/** Teclas brancas de A0 (21) a C8 (108): 52. */
export const WHITE_MIDIS: number[] = Array.from({ length: 88 }, (_, i) => 21 + i).filter((m) => ![1, 3, 6, 8, 10].includes(m % 12))
export const whiteIndexOf = (midi: number): number => {
  const i = WHITE_MIDIS.indexOf(midi)
  if (i >= 0) return i
  return WHITE_MIDIS.findIndex((m) => m > midi) - 1
}

interface UiState {
  /** Índice (0..51) da primeira tecla branca visível. */
  firstWhite: number
  /** Teclas brancas visíveis (calculado pelo teclado a partir da largura e do zoom). */
  visibleWhites: number
  /** Oitava base das teclas do computador (A = Dó dessa oitava). */
  octave: number
  micPrompt: boolean
  settingsOpen: boolean
  changelogOpen: boolean
  setFirstWhite: (i: number) => void
  setVisibleWhites: (n: number) => void
  /** Garante que a nota apareça, deslocando a janela o mínimo possível. */
  reveal: (midi: number) => void
  shiftOctave: (delta: number) => void
  setOctave: (o: number) => void
  setMicPrompt: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  setChangelogOpen: (v: boolean) => void
}
const clampFirst = (i: number, visible: number) => Math.max(0, Math.min(WHITE_MIDIS.length - visible, i))

export const useUi = create<UiState>((set, get) => ({
  firstWhite: whiteIndexOf(60) - 3,
  visibleWhites: 10,
  octave: 4,
  micPrompt: false,
  settingsOpen: false,
  changelogOpen: false,
  setFirstWhite: (i) => set({ firstWhite: clampFirst(i, get().visibleWhites) }),
  setVisibleWhites: (n) => set({ visibleWhites: n, firstWhite: clampFirst(get().firstWhite, n) }),
  reveal: (midi) => {
    const { firstWhite, visibleWhites } = get()
    const idx = whiteIndexOf(midi)
    if (idx >= firstWhite && idx < firstWhite + visibleWhites) return
    // Centraliza a nota-alvo; evita deslocar quando já cabe.
    set({ firstWhite: clampFirst(idx - Math.floor(visibleWhites / 2), visibleWhites) })
  },
  shiftOctave: (d) => set({ octave: Math.max(1, Math.min(7, get().octave + d)) }),
  setOctave: (octave) => set({ octave }),
  setMicPrompt: (micPrompt) => set({ micPrompt }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setChangelogOpen: (changelogOpen) => set({ changelogOpen }),
}))

/** Estado visual das teclas além de "pressionada"; cada modo publica o seu. */
export type KeyVisual = 'target' | 'correct' | 'wrong' | 'ghost' | 'chord-member'
export const useKeyStates = create<{ states: ReadonlyMap<number, KeyVisual>; set: (m: ReadonlyMap<number, KeyVisual>) => void }>((set) => ({
  states: new Map(),
  set: (states) => set({ states }),
}))

// ---------- sessões (snapshots vindos de application) ----------
let freeStore: ReturnType<typeof bridge<FreeSnapshot>>
let chordStore: ReturnType<typeof bridge<ChordSnapshot>>
let drillStore: ReturnType<typeof bridge<DrillSnapshot>>
let micStore: ReturnType<typeof bridge<MicSnapshot>>
export const useFree = <T,>(select: (s: FreeSnapshot) => T): T => freeStore((s) => select(s.snap))
export const useChords = <T,>(select: (s: ChordSnapshot) => T): T => chordStore((s) => select(s.snap))
export const useDrill = <T,>(select: (s: DrillSnapshot) => T): T => drillStore((s) => select(s.snap))
export const useMic = <T,>(select: (s: MicSnapshot) => T): T => micStore((s) => select(s.snap))

export function initApp(): App {
  const svc = services()
  const hub = new InputHub(svc.clock)
  const settings = parseSettings(svc.storage.read(STORAGE_KEYS.settings))
  useSettings.setState({ settings })

  const mic = new MicController(hub, svc.microphone, svc.clock, svc.scheduler)
  const free = new FreeSession(hub, svc.clock)
  const chords = new ChordSession(hub, svc)
  const drill = new DrillSession(hub, svc, () => useSettings.getState().settings.extraTime)
  app = { hub, mic, free, chords, drill }

  freeStore = bridge(free.snapshot, free.changes)
  chordStore = bridge(chords.snapshot, chords.changes)
  drillStore = bridge(drill.snapshot, drill.changes)
  micStore = bridge(mic.snapshot, mic.changes)

  connectSound(hub, svc.piano)
  // Piano real tocado fora da janela visível: traz a região para a tela (toque na tela não desloca nada).
  hub.events.subscribe((e) => {
    if (e.type === 'on' && (e.source === 'midi' || e.source === 'mic')) useUi.getState().reveal(e.note)
  })
  svc.midi.onNote((kind, note) => (kind === 'on' ? hub.press(note, 'midi') : hub.release(note, 'midi')))
  svc.midi.onDevices((names) => useDevices.setState({ midi: names }))
  void svc.midi.start().then((status) => useDevices.setState({ midiStatus: status }))

  const apply = (s: Settings) => {
    hub.latch = s.latchKeys
    svc.piano.setEnabled(s.pianoSound)
    svc.piano.setVolume(s.pianoVolume)
    svc.feedback.setEnabled(s.feedbackSounds)
    svc.haptics.enabled = s.haptics
    free.setAccidental(s.accidental)
    mic.setSensitivity(s.microphoneSensitivity)
    document.documentElement.dataset.theme = s.theme === 'system' ? '' : s.theme
    if (s.theme === 'system') delete document.documentElement.dataset.theme
  }
  apply(settings)
  useSettings.subscribe((state, prev) => state.settings !== prev.settings && apply(state.settings))
  return app
}

/** Dispositivos MIDI conectados (hot-plug) e estado do acesso. */
export const useDevices = create<{ midi: string[]; midiStatus: 'pending' | 'ready' | 'unsupported' | 'denied' }>(() => ({
  midi: [],
  midiStatus: 'pending',
}))

/** Liga ou desliga o microfone, guardando a escolha. */
export async function setMicrophone(enabled: boolean): Promise<void> {
  const { mic } = getApp()
  await services().piano.resume()
  await mic.setEnabled(enabled)
  const ok = mic.snapshot.status.kind !== 'denied' && mic.snapshot.status.kind !== 'unsupported' && mic.snapshot.status.kind !== 'no-device' && mic.snapshot.status.kind !== 'failed'
  useSettings.getState().update({ microphoneEnabled: enabled && ok })
}
