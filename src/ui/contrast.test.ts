import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Validador de pares do design system (SPEC › Cor): lê os tokens de theme.css e mede o contraste. */
const css = readFileSync('src/ui/theme.css', 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  const open = css.indexOf('{', start)
  let depth = 0
  let end = open
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) {
      end = i
      break
    }
  }
  const out: Record<string, string> = {}
  for (const m of css.slice(open, end).matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const dark = block(':root {')
const light = { ...dark, ...block(":root[data-theme='light'] {") }

function resolve(theme: Record<string, string>, name: string): string {
  let v = theme[name]
  for (let i = 0; i < 6 && v?.startsWith('var('); i++) v = theme[v.slice(4, -1).split(',')[0].trim()]
  return v
}
const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}
function lum([r, g, b]: [number, number, number]): number {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a: string, b: string): number => {
  const [x, y] = [lum(rgb(a)), lum(rgb(b))]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const themes = { escuro: dark, claro: light }
const surfaces = ['--surface-stage', '--surface-panel', '--surface-raised']

for (const [name, t] of Object.entries(themes)) {
  describe(`contraste · tema ${name}`, () => {
    for (const text of ['--text', '--text-muted', '--text-faint']) {
      for (const surface of surfaces) {
        it(`${text} sobre ${surface} ≥ 4,5:1`, () => {
          expect(ratio(resolve(t, text), resolve(t, surface))).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
    for (const track of ['--track-chords', '--track-drill', '--track-free', '--track-input', '--success', '--failure', '--warning']) {
      for (const surface of surfaces) {
        it(`${track} sobre ${surface} ≥ 4,5:1`, () => {
          expect(ratio(resolve(t, track), resolve(t, surface))).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
    for (const [bg, fg] of [['--track-chords', '--on-track-chords'], ['--track-drill', '--on-track-drill'], ['--track-free', '--on-track-free'], ['--track-input', '--on-track-input'], ['--success', '--on-success'], ['--failure', '--on-failure'], ['--warning', '--on-warning']]) {
      it(`${fg} sobre ${bg} ≥ 4,5:1`, () => {
        expect(ratio(resolve(t, bg), resolve(t, fg))).toBeGreaterThanOrEqual(4.5)
      })
    }
  })
}
