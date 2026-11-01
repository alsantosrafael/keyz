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

## Publicar na Cloudflare Pages

O app é uma SPA estática (`dist/`). A publicação atual é **manual, por upload direto**, sem ligação entre a Cloudflare e o GitHub.

Pré-requisitos: conta na Cloudflare e o Wrangler autenticado.

```sh
bunx wrangler login          # uma vez; abre o navegador (no Claude Code: `! bunx wrangler login`)
bunx wrangler whoami         # confere a conta
bun run deploy               # build + wrangler pages deploy dist --project-name keyz --branch main
```

- Na primeira vez, o Wrangler pergunta se pode criar o projeto `keyz`. Se o nome estiver em uso, a URL vira `keyz-xxx.pages.dev`.
- `--branch main` publica em produção. Qualquer outro nome de branch gera uma URL de pré-visualização.
- O token de login expira. Em CI ou terminal sem navegador, use a variável `CLOUDFLARE_API_TOKEN` (permissão *Cloudflare Pages: Edit*) e `CLOUDFLARE_ACCOUNT_ID`. Nunca commite esses valores.

O que vai junto no `dist/` (vem de `public/`):

| Arquivo | Para quê |
| --- | --- |
| `_redirects` | `/* /index.html 200`: rotas diretas como `/desafio` funcionam ao recarregar |
| `_headers` | CSP restritiva (só a própria origem; `worker-src` com `blob:`), `Permissions-Policy` (microfone e MIDI só na própria origem), `no-referrer`, `nosniff` |
| `mic-worklet.js` | AudioWorklet do microfone (JS puro, precisa ser servido como arquivo) |

Depois de publicar, confira:

1. A URL abre em `/livre` e `/desafio` carrega direto (sem 404).
2. Cabeçalhos: `curl -sI <url> | grep -i content-security-policy`.
3. Microfone e MIDI só funcionam em HTTPS (o `pages.dev` já é). O console não deve mostrar bloqueios de CSP.
4. Em Safari e Firefox o MIDI não existe, e a tela Entrada explica isso.

Se o build falhar no deploy, rode `bun run test` e `bun run build` antes. O CI (`.github/workflows/ci.yml`) roda os mesmos passos em cada push.
