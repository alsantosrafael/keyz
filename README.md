# Keyz

App de prática de piano/teclado. Os quatro modos são **Acordes**, **Desafio**, **Livre** e **Entrada**. As entradas são MIDI, microfone e teclado na tela.

O repositório tem duas partes:

| Pasta | O que é | Estado |
| --- | --- | --- |
| `keyz-mac/` | App SwiftUI para iPhone, iPad e Mac (`Keyz`, `KeyzCore`, `Keyz.xcodeproj`) | Atual. Fica intocado até a paridade com a versão web |
| Raiz (`src/`, `index.html`, `package.json`) e `shared/` | Versão web (Bun, Vite, React, TypeScript); `shared/` é o domínio puro | Funcional; ver "Estado da implementação" na spec |
| `docs/` | Documentação | `docs/SPEC.md`: spec da migração para a web e do design system |

## Onde começar

- Quer entender a migração, o design system e a experiência dos modos? Leia `docs/SPEC.md`.
- Quer rodar o app Swift? Veja `keyz-mac/README.md`.

## Resumo rápido do app Swift

```sh
cd keyz-mac
(cd KeyzCore && swift test)
xcodebuild -project Keyz.xcodeproj -scheme Keyz -destination 'platform=macOS' -derivedDataPath xcode build
```

## Rodar a versão web

```sh
bun install --frozen-lockfile
bun run dev      # servidor de desenvolvimento
bun run test     # Vitest: shared e app
bun run build    # typecheck + build em dist/
bun run e2e      # Playwright (precisa de `bunx playwright install chromium`)
```
