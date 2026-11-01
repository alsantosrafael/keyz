import { type Note } from '../music/note'
import { type Accidental, isBlackKey } from '../music/pitch-class'

export type Difficulty = 'easy' | 'medium' | 'advanced'
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'advanced']
export const difficultyName: Record<Difficulty, string> = { easy: 'Fácil', medium: 'Médio', advanced: 'Avançado' }

/** Como a nota sorteada aparece para o usuário. */
export type PromptStyle = 'name' | 'nameAndStaff' | 'staff'
export const PROMPT_STYLES: readonly PromptStyle[] = ['name', 'nameAndStaff', 'staff']
export const promptStyleName: Record<PromptStyle, string> = { name: 'Nome', nameAndStaff: 'Nome e partitura', staff: 'Só partitura' }

export interface DrillConfig {
  difficulty: Difficulty
  promptStyle: PromptStyle
  lowest: Note
  highest: Note
  /** Inclui notas pretas (sustenidos/bemóis). */
  includeAccidentals: boolean
  /** Como escrever as notas pretas. */
  accidental: Accidental
  /** Tempo para tocar a nota, em segundos. */
  timePerNote: number
  /** Avança sozinho para a próxima nota depois do resultado. */
  autoAdvance: boolean
  /** Segundos que o resultado fica na tela antes da próxima nota (com `autoAdvance`). */
  pauseBetweenNotes: number
  /** Exige a oitava certa; senão, só a nota (qualquer oitava). */
  matchOctave: boolean
  /** Quantidade de notas da sessão; `null` = sem fim. */
  rounds: number | null
  /** Restringe o sorteio a estas notas ("Treinar notas difíceis"). */
  onlyNotes?: Note[]
}

const base = {
  accidental: 'sharp' as Accidental,
  autoAdvance: true,
  matchOctave: true,
  rounds: 20 as number | null,
}

/** Configuração inicial para cada dificuldade; tudo pode ser ajustado depois. */
export function drillPreset(difficulty: Difficulty): DrillConfig {
  switch (difficulty) {
    case 'easy':
      // Uma oitava, só teclas brancas, bastante tempo.
      return { ...base, difficulty, lowest: 60, highest: 71, includeAccidentals: false, timePerNote: 10, pauseBetweenNotes: 1.5, promptStyle: 'name' }
    case 'medium':
      // Duas oitavas com sustenidos/bemóis.
      return { ...base, difficulty, lowest: 60, highest: 83, includeAccidentals: true, timePerNote: 6, pauseBetweenNotes: 1.2, promptStyle: 'nameAndStaff' }
    case 'advanced':
      // Três oitavas, clave de sol e de fá, pouco tempo, leitura só pela partitura.
      return { ...base, difficulty, lowest: 48, highest: 84, includeAccidentals: true, timePerNote: 3, pauseBetweenNotes: 1.0, promptStyle: 'staff' }
  }
}

/** Notas que podem ser sorteadas. */
export function notePool(config: Pick<DrillConfig, 'lowest' | 'highest' | 'includeAccidentals' | 'onlyNotes'>): Note[] {
  if (config.onlyNotes && config.onlyNotes.length > 0) return [...config.onlyNotes]
  if (config.lowest > config.highest) return []
  const pool: Note[] = []
  for (let midi = config.lowest; midi <= config.highest; midi++) {
    if (config.includeAccidentals || !isBlackKey(midi)) pool.push(midi)
  }
  return pool
}
