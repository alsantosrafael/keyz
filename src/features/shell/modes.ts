import { AudioWaveform, Music2, Plug, Target } from 'lucide-react'

export type ModeId = 'chords' | 'drill' | 'free' | 'input'
export const MODES = [
  { id: 'chords', path: '/acordes', label: 'Acordes', Icon: Music2, text: 'text-chords' },
  { id: 'drill', path: '/desafio', label: 'Desafio', Icon: Target, text: 'text-drill' },
  { id: 'free', path: '/livre', label: 'Livre', Icon: AudioWaveform, text: 'text-free' },
  { id: 'input', path: '/entrada', label: 'Entrada', Icon: Plug, text: 'text-input' },
] as const

export const modeForPath = (pathname: string): (typeof MODES)[number] => MODES.find((m) => pathname.startsWith(m.path)) ?? MODES[2]
