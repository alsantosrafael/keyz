import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { type ChangelogEntry, compareVersions, parseChangelog } from '@keyz/shared'
import { Sheet } from '../../ui/controls'
import { cn } from '../../ui/cn'
import { useUi } from '../../state/app'

const fmtDate = (iso: string | null): string =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

/**
 * Novidades de cada versão, lidas do CHANGELOG.md (gerado pelo release-please) embutido no build.
 * Carregada sob demanda: o arquivo só entra no JS quando a folha abre. O texto vai para a tela como
 * texto puro, nunca como HTML.
 */
export default function ChangelogSheet() {
  const open = useUi((s) => s.changelogOpen)
  const setOpen = useUi((s) => s.setChangelogOpen)
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null)
  useEffect(() => {
    let alive = true
    import('../../../CHANGELOG.md?raw').then((m) => alive && setEntries(parseChangelog(m.default))).catch(() => alive && setEntries([]))
    return () => {
      alive = false
    }
  }, [])
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Novidades">
      <p className="mb-4 text-[16px] text-muted">
        Você está na versão <strong className="text-ink">{__APP_VERSION__}</strong>.
      </p>
      {entries === null && <p className="text-muted">Carregando…</p>}
      {entries?.length === 0 && <p className="text-muted">Ainda não há novidades registradas.</p>}
      <ol className="flex flex-col gap-6">
        {entries?.map((e) => {
          const current = e.version === __APP_VERSION__
          const newer = compareVersions(e.version, __APP_VERSION__) > 0
          return (
            <li key={e.version}>
              <h3 className="t-headline flex flex-wrap items-center gap-2">
                <span>v{e.version}</span>
                {current && <span className="t-caption rounded-full bg-track px-2 py-0.5 text-on-track">atual</span>}
                {newer && <span className="t-caption rounded-full border border-line px-2 py-0.5 text-muted">mais nova</span>}
              </h3>
              {e.date && <p className="text-[14px] text-faint">{fmtDate(e.date)}</p>}
              {e.sections.map((s) => (
                <section key={s.title} className="mt-3">
                  <h4 className="t-caption text-faint">{s.title}</h4>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {s.items.map((it, i) => (
                      <li key={i} className="text-[16px]">
                        {it.scope && <span className="mr-1 font-semibold">{it.scope}:</span>}
                        {it.text}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {e.url && (
                <a href={e.url} target="_blank" rel="noopener noreferrer" className={cn('t-label mt-2 inline-flex min-h-11 items-center gap-1 text-track underline-offset-2 hover:underline')}>
                  Ver mudanças no GitHub <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
                </a>
              )}
            </li>
          )
        })}
      </ol>
    </Sheet>
  )
}
