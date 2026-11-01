/** Leitor do CHANGELOG.md gerado pelo release-please (puro: sem DOM nem rede). */
export interface ChangelogItem {
  scope: string | null
  text: string
  hash: string | null
}
export interface ChangelogSection {
  title: string
  items: ChangelogItem[]
}
export interface ChangelogEntry {
  version: string
  /** AAAA-MM-DD, quando o cabeçalho traz a data. */
  date: string | null
  /** Link de comparação com a versão anterior. */
  url: string | null
  sections: ChangelogSection[]
}

const HEADING = /^##\s+\[?(\d+\.\d+\.\d+(?:-[\w.]+)?)\]?(?:\((https?:[^)\s]+)\))?\s*(?:\((\d{4}-\d{2}-\d{2})\))?\s*$/
const LINK = /\[([^\]]+)\]\([^)]*\)/g

/** Remove marcação Markdown simples; o texto vai para a tela como texto puro, nunca como HTML. */
const plain = (s: string): string => s.replace(LINK, '$1').replace(/\*\*|__|`/g, '').trim()

function parseItem(raw: string): ChangelogItem {
  let line = raw.trim()
  // Rodapés do release-please: ` ([abc1234](url))` e `, closes [#1](url)`.
  line = line.replace(/,?\s*closes\s+.*$/i, '').trim()
  let hash: string | null = null
  const tail = line.match(/\s*\(\[([0-9a-f]{7,40})\]\([^)]*\)\)\s*$/)
  if (tail) {
    hash = tail[1]
    line = line.slice(0, tail.index).trim()
  }
  let scope: string | null = null
  const sc = line.match(/^\*\*([^*:]+):\*\*\s*/)
  if (sc) {
    scope = sc[1].trim()
    line = line.slice(sc[0].length)
  }
  return { scope, text: plain(line), hash }
}

/** Entradas em ordem de aparição (a mais nova primeiro, como no arquivo). */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let entry: ChangelogEntry | null = null
  let section: ChangelogSection | null = null
  for (const line of markdown.split(/\r?\n/)) {
    const h = line.match(HEADING)
    if (h) {
      entry = { version: h[1], url: h[2] ?? null, date: h[3] ?? null, sections: [] }
      entries.push(entry)
      section = null
      continue
    }
    if (!entry) continue
    const s = line.match(/^###\s+(.+?)\s*$/)
    if (s) {
      section = { title: plain(s[1]), items: [] }
      entry.sections.push(section)
      continue
    }
    const item = line.match(/^[*-]\s+(.+)$/)
    if (item) {
      if (!section) entry.sections.push((section = { title: 'Mudanças', items: [] }))
      const parsed = parseItem(item[1])
      if (parsed.text) section.items.push(parsed)
    }
  }
  return entries
}

/** Compara versões SemVer simples (ignora pré-lançamento). Positivo se a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('-')[0].split('.').map(Number)
  const pb = b.split('-')[0].split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}
