import { z } from 'zod'
import { DIFFICULTIES, PROMPT_STYLES } from '../drills/config'

/** Chaves de persistência (com versão). */
export const STORAGE_KEYS = {
  settings: 'keyz.settings.v1',
  best: 'keyz.best.v1',
  drill: 'keyz.drill.v1',
  onboarding: 'keyz.onboarding.v1',
} as const

export const settingsSchema = z.object({
  latchKeys: z.boolean().default(false),
  microphoneSensitivity: z.number().min(0).max(1).default(0.5),
  microphoneEnabled: z.boolean().default(false),
  showNoteNames: z.boolean().default(false),
  showShortcuts: z.boolean().default(false),
  showKeyboard: z.boolean().default(true),
  keyboardZoom: z.number().int().min(7).max(21).default(10),
  accidental: z.enum(['sharp', 'flat']).default('sharp'),
  pianoSound: z.boolean().default(true),
  pianoVolume: z.number().min(0).max(1).default(0.8),
  feedbackSounds: z.boolean().default(true),
  haptics: z.boolean().default(true),
  theme: z.enum(['system', 'dark', 'light']).default('system'),
  extraTime: z.union([z.literal(1), z.literal(1.5), z.literal(2)]).default(1),
  showTrail: z.boolean().default(true),
  welcomeSeen: z.boolean().default(false),
  /** Última versão cujas novidades o usuário viu ('' = primeiro uso). */
  seenVersion: z.string().max(40).default(''),
})
export type Settings = z.infer<typeof settingsSchema>
export const defaultSettings: Settings = settingsSchema.parse({})

/** Lê um valor persistido; dado inválido cai no padrão, sem quebrar a tela. */
export function parseSettings(raw: unknown): Settings {
  const result = settingsSchema.safeParse(raw)
  if (result.success) return result.data
  // Aproveita os campos válidos e descarta o resto.
  if (raw && typeof raw === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, schema] of Object.entries(settingsSchema.shape)) {
      const field = schema.safeParse((raw as Record<string, unknown>)[key])
      if (field.success) out[key] = field.data
    }
    return settingsSchema.parse(out)
  }
  return defaultSettings
}

export const bestMarksSchema = z.partialRecord(
  z.enum([...DIFFICULTIES, ...DIFFICULTIES.map((d) => `chords-${d}`)] as unknown as [string, ...string[]]),
  z.object({ stars: z.number().int().min(0).max(3), bestStreak: z.number().int().min(0) }),
)
export type BestMarks = z.infer<typeof bestMarksSchema>

export const drillOverridesSchema = z.object({
  difficulty: z.enum(DIFFICULTIES as unknown as [string, ...string[]]),
  promptStyle: z.enum(PROMPT_STYLES as unknown as [string, ...string[]]).optional(),
  timePerNote: z.number().min(1).max(60).optional(),
  rounds: z.number().int().min(1).max(200).nullable().optional(),
  includeAccidentals: z.boolean().optional(),
  matchOctave: z.boolean().optional(),
  autoAdvance: z.boolean().optional(),
  pauseBetweenNotes: z.number().min(0.3).max(10).optional(),
  lowest: z.number().int().min(21).max(108).optional(),
  highest: z.number().int().min(21).max(108).optional(),
  accidental: z.enum(['sharp', 'flat']).optional(),
  hint: z.boolean().optional(),
})
export type DrillOverrides = z.infer<typeof drillOverridesSchema>

/** Mensagem MIDI crua (3 bytes) validada nas bordas. */
export const midiMessageSchema = z.object({
  data: z.array(z.number().int().min(0).max(255)).min(1).max(3),
})

export type MidiEvent = { kind: 'on' | 'off'; note: number; velocity: number } | { kind: 'other' }

/** Interpreta uma mensagem MIDI; qualquer coisa inválida vira `other`. */
export function parseMidiMessage(data: ArrayLike<number> | null | undefined): MidiEvent {
  if (!data) return { kind: 'other' }
  const parsed = midiMessageSchema.safeParse({ data: Array.from(data) })
  if (!parsed.success) return { kind: 'other' }
  const [status, note = 0, velocity = 0] = parsed.data.data
  const command = status & 0xf0
  if (command === 0x90 && velocity > 0) return { kind: 'on', note: note & 0x7f, velocity }
  if (command === 0x80 || command === 0x90) return { kind: 'off', note: note & 0x7f, velocity }
  return { kind: 'other' }
}
