import { RotateCcw } from 'lucide-react'
import { type DrillConfig, type PromptStyle, difficultyName } from '@keyz/shared'
import { Button, Section, Segmented, Sheet, Slider, Switch } from '../../ui/controls'
import { getApp, useDrill } from '../../state/app'

/** Painel "Personalizar": os mesmos ajustes do app Swift, em Tempo, Notas, Exibição e Sessão. */
export function CustomizeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { drill } = getApp()
  const config = useDrill((s) => s.config) as DrillConfig
  const difficulty = useDrill((s) => s.difficulty)
  const hint = useDrill((s) => s.hint)
  const chords = useDrill((s) => s.content) === 'chords'
  const set = drill.customize.bind(drill)
  return (
    <Sheet open={open} onClose={onClose} title={`Personalizar · ${difficultyName[difficulty]}`}>
      <Section title="Tempo">
        <Slider label="Tempo por nota" valueText={`${config.timePerNote} s`} min={1} max={20} step={1} value={config.timePerNote} onChange={(timePerNote) => set({ timePerNote })} />
        <Switch label="Avançar sozinho" checked={config.autoAdvance} onChange={(autoAdvance) => set({ autoAdvance })} />
        <Slider label="Pausa entre notas" valueText={`${config.pauseBetweenNotes.toFixed(1).replace('.', ',')} s`} min={0.5} max={5} step={0.1} value={config.pauseBetweenNotes} onChange={(pauseBetweenNotes) => set({ pauseBetweenNotes })} />
      </Section>
      <Section title={chords ? 'Acordes' : 'Notas'}>
        <Switch label={chords ? 'Incluir raízes com sustenido e bemol' : 'Incluir sustenidos e bemóis'} checked={config.includeAccidentals} onChange={(includeAccidentals) => set({ includeAccidentals })} />
        <div className="flex items-center justify-between py-2">
          <span>Escrever como</span>
          <Segmented label="Sustenido ou bemol" value={config.accidental} onChange={(accidental) => set({ accidental })} options={[{ value: 'sharp', label: '♯', aria: 'Sustenido' }, { value: 'flat', label: '♭', aria: 'Bemol' }]} />
        </div>
        {!chords && <Switch label="Exigir a oitava certa" checked={config.matchOctave} onChange={(matchOctave) => set({ matchOctave })} />}
      </Section>
      <Section title="Exibição">
        <div className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>Mostrar nota como</span>
          <Segmented<PromptStyle> label="Mostrar nota como" value={config.promptStyle} onChange={(promptStyle) => set({ promptStyle })} options={[{ value: 'name', label: 'Nome' }, { value: 'nameAndStaff', label: 'Nome e pauta', aria: 'Nome e partitura' }, { value: 'staff', label: 'Pauta', aria: 'Só partitura' }]} />
        </div>
        <Switch label="Dica no teclado" hint={chords ? 'Marca as teclas do acorde' : 'Marca a tecla-alvo'} checked={hint} onChange={(h) => set({ hint: h })} />
      </Section>
      <Section title="Sessão">
        <div className="flex items-center justify-between py-2">
          <span>{chords ? 'Quantidade de acordes' : 'Quantidade de notas'}</span>
          <Segmented<number> label={chords ? 'Quantidade de acordes' : 'Quantidade de notas'} value={config.rounds ?? 0} onChange={(n) => set({ rounds: n === 0 ? null : n })} options={[{ value: 10, label: '10' }, { value: 20, label: '20' }, { value: 40, label: '40' }, { value: 0, label: '∞', aria: 'Sem fim' }]} />
        </div>
      </Section>
      <Button className="mt-2" onClick={() => drill.resetCustomization()}><RotateCcw size={18} strokeWidth={1.75} aria-hidden /> Restaurar padrão do nível</Button>
    </Sheet>
  )
}
