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

## Versões e publicação (SemVer + GitHub Actions)

A versão segue [SemVer](https://semver.org/lang/pt-BR/) e é calculada automaticamente pelos commits ([Conventional Commits](https://www.conventionalcommits.org/pt-br/)), com o [release-please](https://github.com/googleapis/release-please). Enquanto a versão for `0.x`, mudança incompatível sobe o *minor* e `feat` também; a `1.0.0` é decisão explícita.

### Como o fluxo funciona

Passo a passo detalhado (mudança, release, rollback e como tratar os PRs do Dependabot): [`docs/FLUXO.md`](docs/FLUXO.md). Como a pipeline funciona por dentro e como reproduzi-la em outro projeto: [`docs/PIPELINE.md`](docs/PIPELINE.md).

1. Você trabalha em uma branch e abre um **Pull Request** para `main` (a `main` não aceita push direto). O título do PR vira o commit por squash, então ele leva o prefixo do tipo:

   | Prefixo | Efeito na versão | Aparece no CHANGELOG |
   | --- | --- | --- |
   | `fix:` | patch (`0.1.0` → `0.1.1`) | Correções |
   | `feat:` | minor (`0.1.0` → `0.2.0`) | Novidades |
   | `feat!:` ou rodapé `BREAKING CHANGE:` | minor enquanto `0.x`; major depois | Novidades |
   | `perf:`, `refactor:` | nenhum até o próximo `feat`/`fix` | sim |
   | `docs:`, `chore:`, `ci:`, `test:` | nenhum | não (o changelog aparece para o usuário no app) |

   Exemplo: `feat(desafio): contagem regressiva com som` (descrição em português).
2. A cada merge em `main`, o workflow **Release** abre (ou atualiza) um PR "chore(main): release X.Y.Z" com o `package.json` e o `CHANGELOG.md` novos.
3. **Mergear esse PR** cria a tag `vX.Y.Z` e a Release no GitHub. É o único passo manual: você decide quando lançar. Como esse PR é criado pelo `GITHUB_TOKEN`, o CI não roda nele: mergeie com *Merge without waiting for requirements to be met* (bypass de admin, só para PRs).
4. Só então o job `deploy` roda: instala com lockfile congelado, audita dependências, testa, builda e publica na Cloudflare Pages (projeto `keyz`, domínio `keyz-9ir.pages.dev`; branch `main` = produção).
5. A versão aparece no cabeçalho e em Ajustes ("Keyz vX.Y.Z"), e a folha *Novidades* mostra o `CHANGELOG.md` dentro do app. Quem atualiza vê um ponto de aviso até abrir as novidades.

O CI (`ci.yml`) roda em todo PR e push: auditoria (`bun audit --audit-level=high`), testes, build e e2e.

### Configuração única (já feita no repositório, ou a fazer)

| Item | Estado |
| --- | --- |
| Token do Actions só-leitura por padrão; Actions podem abrir PRs | feito |
| Ambiente `production` no GitHub | feito |
| Secret scanning, bloqueio de segredos no push, Dependabot (alertas e correções) | feito |
| Secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` | **a criar** (abaixo) |

Passo a passo completo em [`docs/DEPLOY-SECRETS.md`](docs/DEPLOY-SECRETS.md). Resumo: criar o token em Cloudflare › *My Profile › API Tokens › Create Token › Custom*, com a permissão única **Account › Cloudflare Pages › Edit** e restrito à sua conta. O Account ID aparece em `bunx wrangler whoami`. Guarde no ambiente `production` sem colar em chat ou arquivo (no Claude Code, use o prefixo `!`):

```sh
gh secret set CLOUDFLARE_API_TOKEN --env production --repo alsantosrafael/keyz
gh secret set CLOUDFLARE_ACCOUNT_ID --env production --repo alsantosrafael/keyz
```

Para republicar a versão atual sem nova release: *Actions › Release › Run workflow* com `redeploy` marcado.

### Publicação manual (emergência)

```sh
bunx wrangler login     # abre o navegador; o token expira
bun run deploy          # build + wrangler pages deploy dist (projeto em wrangler.toml)
```

Prefira a pipeline: ela garante que o que vai ao ar foi testado e tem tag.

### O que vai no `dist/` (vem de `public/`)

| Arquivo | Para quê |
| --- | --- |
| `_redirects` | `/* /index.html 200`: rotas diretas como `/desafio` funcionam ao recarregar |
| `_headers` | Cabeçalhos de segurança (abaixo) e cache imutável em `/assets/*` |
| `mic-worklet.js` | AudioWorklet do microfone (JS puro, servido como arquivo) |

### Segurança

Todas as proteções (cabeçalhos HTTP, GitHub, pipeline, segredos), como conferir e as lacunas conhecidas estão em [`docs/SEGURANCA.md`](docs/SEGURANCA.md). Resumo:

- **Cabeçalhos:** CSP restritiva (só a própria origem, sem `blob:`, sem `form-action`, `frame-ancestors 'none'`, `upgrade-insecure-requests`), HSTS, COOP/CORP `same-origin`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` e `Permissions-Policy` que libera só microfone e MIDI na própria origem. O teste `e2e/csp.spec.ts` aplica esses cabeçalhos reais e falha se o app ou o microfone gerarem qualquer violação.
- **Cadeia de suprimentos:** as Actions são fixadas por SHA (o comentário ao lado indica a versão) e o Dependabot propõe as atualizações; dependências com lockfile congelado e `bun audit` no CI e no deploy; workflows com permissões mínimas e `persist-credentials: false`.
- **Dados:** sem backend, contas ou analytics; o áudio nunca sai do aparelho. Vulnerabilidades: veja `SECURITY.md`.
- Depois de publicar, confira: `curl -sI https://keyz-9ir.pages.dev | grep -i -E "content-security|strict-transport"` e abra `/desafio` direto.

## Contribuir e licença

Veja `CONTRIBUTING.md` (PRs com título em Conventional Commits) e `SECURITY.md`. O código do Keyz é licenciado sob a [MIT](LICENSE). Arquivos de terceiros em `.claude/skills/` mantêm as licenças originais deles.

Segurança dos deploys diante de contribuições externas: PRs de forks nunca recebem segredos (o CI usa `pull_request`, não `pull_request_target`) e esperam aprovação do mantenedor para rodar; só `main` acessa o ambiente `production` (onde ficam os tokens da Cloudflare); o `release.yml` só executa no repositório original; e o ruleset `proteger-main` faz a `main` aceitar só Pull Request com CI verde, sem force-push nem deleção (o dono tem bypass apenas ao mergear PR, nunca para push direto).
