# Keyz

App de prática de piano/teclado (modos Acordes, Desafio, Livre e Entrada). Idioma do projeto: português do Brasil, em código de interface, docs e commits.

## Estado do repositório

- `keyz-mac/`: app SwiftUI atual (`Keyz/`, `KeyzCore/`, `Keyz.xcodeproj`). **Não alterar** até a paridade com a web, salvo pedido explícito. É a referência de comportamento.
- `docs/SPEC.md`: fonte da verdade da migração para web e do design system. Leia antes de qualquer trabalho de UI ou arquitetura.
- Raiz: app web (Vite + React: `package.json`, `index.html`, `vite.config.ts`, `src/`, `e2e/`). Workspaces: `["shared"]`.
- `shared/`: `@keyz/shared`, domínio puro (music, dsp, drills, schemas).

## Comandos

Swift (a partir de `keyz-mac/`):

```sh
(cd KeyzCore && swift test)
xcodebuild -project Keyz.xcodeproj -scheme Keyz -destination 'platform=macOS' -derivedDataPath xcode build
```

Web: `bun install --frozen-lockfile`, `bun run test` (Vitest: `shared` e app), `bun run build`, `bun run e2e` (Playwright). Não use `bun test`: o Vitest tem o próprio runner.

## Arquitetura da versão web

Camadas, de dentro para fora: `shared` (domínio puro) → `platform` (adaptadores do navegador) → `application` (casos de uso, InputHub) → `state` (Zustand fino) → `features` e `ui`.

- `shared` não importa nada de fora dele: sem DOM, React ou Web Audio.
- `features` não importa `platform` diretamente.
- Regra de negócio fica em `shared` ou `application`, nunca em store ou componente.
- Zod valida nas bordas (ajustes salvos, MIDI, arquivos); os tipos vêm de `z.infer`.
- A análise de áudio roda em Web Worker.
- Portar do Swift mantendo o nome e a entrada de cada teste: os 55 testes XCTest são o critério de paridade (tolerância de 1 cent).

## Design system (resumo; detalhes em `docs/SPEC.md`)

- Inspiração: GarageBand focado em piano. Dark-first, com tema claro completo. Teclado fixo na base, cor por modo.
- Só tokens semânticos em componentes; nunca hexadecimal solto. Tokens são variáveis CSS do Tailwind v4.
- Tecla reage no `pointerdown`/evento MIDI no mesmo quadro. Animar só `transform` e `opacity`.
- Toda animação é interrompível e tem versão para `prefers-reduced-motion`.
- Cor nunca é o único sinal: ícone e texto sempre acompanham.
- Alvos de toque ≥ 44 px; foco visível; resultados anunciados com `aria-live="polite"`.
- Ícones só de `lucide-react`, nunca emoji.
- Desafio é jogo (contagem, anel de tempo, sequência, estrelas, sem punição forte). Livre prioriza passagem de nota estável (histerese, nota mantida após soltar a tecla, sem layout que pula).

## Convenções

- Não commitar nem publicar sem pedido do usuário.
- Mudou comportamento ou decisão de design? Atualize `docs/SPEC.md` no mesmo trabalho.
- Dúvidas de produto vão para "Questões em aberto" da spec, não para decisões silenciosas no código.
