import { Moon, Sun, SunMoon } from 'lucide-react'
import { Section, Segmented, Sheet, Slider, Switch } from '../../ui/controls'
import { useSettings, useUi } from '../../state/app'

export function SettingsSheet() {
  const open = useUi((s) => s.settingsOpen)
  const setOpen = useUi((s) => s.setSettingsOpen)
  const { settings: s, update } = useSettings()
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Ajustes">
      <Section title="Aparência">
        <div className="flex items-center justify-between py-2">
          <span id="theme-label">Tema</span>
          <Segmented
            label="Tema"
            value={s.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: 'system', label: <SunMoon size={18} strokeWidth={1.75} aria-hidden />, aria: 'Seguir o sistema' },
              { value: 'dark', label: <Moon size={18} strokeWidth={1.75} aria-hidden />, aria: 'Escuro' },
              { value: 'light', label: <Sun size={18} strokeWidth={1.75} aria-hidden />, aria: 'Claro' },
            ]}
          />
        </div>
      </Section>
      <Section title="Teclado">
        <Switch label="Mostrar o teclado na tela" hint="MIDI, microfone e teclado do computador continuam funcionando" checked={s.showKeyboard} onChange={(showKeyboard) => update({ showKeyboard })} />
        <Switch label="Mostrar nomes nas teclas" checked={s.showNoteNames} onChange={(showNoteNames) => update({ showNoteNames })} />
        <Switch label="Mostrar atalhos" hint="Letras do teclado do computador (A–L, W E T Y U O P; Z e X mudam a oitava)" checked={s.showShortcuts} onChange={(showShortcuts) => update({ showShortcuts })} />
        <Switch label="Segurar teclas" hint="Um toque liga, outro desliga" checked={s.latchKeys} onChange={(latchKeys) => update({ latchKeys })} />
        <Slider label="Zoom do teclado" valueText={`${s.keyboardZoom} teclas brancas`} min={7} max={21} step={1} value={s.keyboardZoom} onChange={(keyboardZoom) => update({ keyboardZoom })} />
      </Section>
      <Section title="Som e toque">
        <Switch label="Som do piano" checked={s.pianoSound} onChange={(pianoSound) => update({ pianoSound })} />
        <Slider label="Volume do piano" valueText={`${Math.round(s.pianoVolume * 100)}%`} value={s.pianoVolume} onChange={(pianoVolume) => update({ pianoVolume })} />
        <Switch label="Sons de acerto e erro" hint="Ligados por padrão no Desafio" checked={s.feedbackSounds} onChange={(feedbackSounds) => update({ feedbackSounds })} />
        <Switch label="Vibração" hint="Quando o aparelho permite" checked={s.haptics} onChange={(haptics) => update({ haptics })} />
      </Section>
      <Section title="Desafio">
        <div className="flex items-center justify-between py-2">
          <span>Mais tempo</span>
          <Segmented
            label="Mais tempo"
            value={s.extraTime}
            onChange={(extraTime) => update({ extraTime })}
            options={[{ value: 1, label: '1×' }, { value: 1.5, label: '1,5×' }, { value: 2, label: '2×' }]}
          />
        </div>
      </Section>
      <button
        type="button"
        onClick={() => {
          setOpen(false)
          useUi.getState().setChangelogOpen(true)
          update({ seenVersion: __APP_VERSION__ })
        }}
        className="t-label mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control text-muted hover:text-ink"
      >
        Keyz v{__APP_VERSION__} · Ver novidades
      </button>
    </Sheet>
  )
}
