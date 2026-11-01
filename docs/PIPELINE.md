# Pipeline de CI/CD: como funciona e como reproduzir

Explicação completa da pipeline do Keyz: o que cada peça faz, **por que** foi desenhada assim, como o ciclo inteiro roda (com um caso real, incluindo uma falha) e um roteiro para montar a mesma coisa em outro projeto. Atualizado em 2026-11-01.

Documentos relacionados: `docs/FLUXO.md` (uso do dia a dia), `docs/SEGURANCA.md` (proteções), `docs/DEPLOY-SECRETS.md` (criar os secrets).

## Sumário

1. [A ideia em uma página](#1-a-ideia-em-uma-página)
2. [Mapa das peças](#2-mapa-das-peças)
3. [Conventional Commits e SemVer](#3-conventional-commits-e-semver)
4. [CI: validar toda mudança](#4-ci-validar-toda-mudança)
5. [Release: o release-please por dentro](#5-release-o-release-please-por-dentro)
6. [Deploy: só depois da versão](#6-deploy-só-depois-da-versão)
7. [Confiança: ambiente, secrets e `GITHUB_TOKEN`](#7-confiança-ambiente-secrets-e-github_token)
8. [Proteção da `main` e como ela conversa com a pipeline](#8-proteção-da-main-e-como-ela-conversa-com-a-pipeline)
9. [Dependabot: manter tudo atualizado](#9-dependabot-manter-tudo-atualizado)
10. [O ciclo completo, passo a passo (caso real)](#10-o-ciclo-completo-passo-a-passo-caso-real)
11. [Reproduzir em outro projeto](#11-reproduzir-em-outro-projeto)
12. [Variações](#12-variações)
13. [Armadilhas e lições do Keyz](#13-armadilhas-e-lições-do-keyz)
14. [Cola de comandos](#14-cola-de-comandos)

---

## 1. A ideia em uma página

A pipeline separa **três perguntas** que costumam ser misturadas:

| Pergunta | Quem responde | Quando |
| --- | --- | --- |
| *Esta mudança está correta?* | **CI** (testes, build, e2e, auditoria, título do PR) | Em todo Pull Request e em todo push na `main` |
| *Qual é a próxima versão e o que mudou?* | **release-please** (lê os commits e abre um PR de release) | A cada merge na `main` |
| *Quando isso vai para o ar?* | **Uma pessoa**, mergeando o PR de release; então o **deploy** roda | Só quando você decide |

O ponto central, e o que torna o fluxo bom: **merge na `main` não publica nada**. A `main` representa "código aprovado"; o site só muda quando uma **Release** (tag `vX.Y.Z`) é criada, e essa criação é um ato deliberado (mergear o PR de release). Consequências:

- Dá para juntar várias mudanças e lançar de uma vez, ou lançar uma correção urgente sozinha.
- Cada versão no ar tem **tag, changelog e número SemVer** rastreáveis.
- O deploy roda **os testes de novo** sobre exatamente o commit da tag, então o que vai ao ar foi testado.
- O número da versão **nunca é digitado à mão**: sai dos commits.

Princípios usados em todo o desenho:

1. **Automatizar o previsível, deixar o humano na decisão** (quando lançar).
2. **Menor privilégio:** cada workflow e job pede só a permissão que usa; segredos só chegam ao job que os precisa, e só na `main`.
3. **Reprodutível:** lockfile congelado, Actions fixadas por SHA, mesmo comando local e no CI.
4. **Falhar seguro:** se o deploy falha, o site continua na versão anterior.
5. **A pipeline é código revisado:** mudanças nela passam pelo mesmo PR e CI que o resto.

## 2. Mapa das peças

```text
 você ── PR ──────────────▶ ci.yml (test, e2e) + pr-title.yml (title)
                                   │ verdes
                                   ▼
                         squash merge na main  ──────────────┐
                                   │                          │ (push na main)
                                   ▼                          ▼
                            release.yml ──▶ job release-please
                                                │
              houve feat/fix desde a última?    │
                    sim ─▶ abre/atualiza o "PR de release" (versão + CHANGELOG)
                                                │
                       você mergeia o PR de release (bypass de admin)
                                                │
                                                ▼
                            release.yml (de novo, no push do merge)
                              release-please: cria tag vX.Y.Z + Release
                              outputs: release_created=true, tag_name=vX.Y.Z
                                                │
                                                ▼
                                          job deploy (ambiente production)
                          checkout da TAG → install → audit → test → build
                                                │
                                                ▼
                              wrangler pages deploy → Cloudflare Pages
```

| Arquivo | Papel |
| --- | --- |
| `.github/workflows/ci.yml` | Valida: auditoria, testes, build, e2e |
| `.github/workflows/pr-title.yml` | Garante que o título do PR segue Conventional Commits |
| `.github/workflows/release.yml` | Mantém o PR de release, cria a Release e **faz o deploy** |
| `release-please-config.json` | Regras: tipo de projeto, seções do changelog, regras `0.x` |
| `.release-please-manifest.json` | Estado: a **última versão lançada** (`{".":"0.2.0"}`) |
| `CHANGELOG.md` | Gerado e atualizado pelo release-please; o app o exibe |
| `wrangler.toml` | Nome do projeto Cloudflare e pasta de saída (`dist`) |
| `.github/dependabot.yml` | Atualizações semanais de dependências e Actions |
| `.github/CODEOWNERS`, ruleset `proteger-main` | Quem pode mexer no quê; regras da `main` |
| Ambiente `production` + secrets | Onde ficam o token e o ID da conta Cloudflare |

## 3. Conventional Commits e SemVer

A versão é **calculada** a partir do histórico. Para isso, o commit que chega na `main` precisa dizer o que é. Como o repositório só aceita **squash merge** e o **título do PR vira a mensagem do commit**, o que importa é o **título do PR**:

```text
tipo(escopo opcional)!: descrição curta em português
```

| Tipo | Efeito no SemVer (`0.x`) | Efeito (`≥ 1.0`) | No changelog? |
| --- | --- | --- | --- |
| `fix` | patch (0.2.0 → 0.2.1) | patch | Correções |
| `feat` | minor (0.2.0 → 0.3.0) | minor | Novidades |
| `feat!`, `fix!` ou rodapé `BREAKING CHANGE:` | minor | **major** | Novidades |
| `perf`, `refactor` | nenhum sozinho | nenhum sozinho | Desempenho, Refatorações |
| `docs`, `chore`, `ci`, `test`, `build` | nenhum | nenhum | Não (ocultos, ver `hidden: true`) |

Regras pré-1.0 vêm de duas chaves do `release-please-config.json`: `bump-minor-pre-major: true` (quebra de compatibilidade vira *minor*, não *major*) e `bump-patch-for-minor-pre-major: false` (`feat` sobe o *minor*, não o *patch*). A `1.0.0` é uma decisão explícita (por exemplo, `release-as: 1.0.0`).

**Quando vários commits entram no mesmo release, vale o maior efeito**: um `feat` e três `fix` resultam em *minor*.

### Por que validar o título do PR (`pr-title.yml`)

Se alguém mergeasse com título `Arrumei coisas`, o release-please ignoraria o commit e a versão não subiria. O workflow barra isso com uma expressão regular. Detalhe de segurança importante: **o título é texto controlado por quem abre o PR**. Ele entra no script por variável de ambiente (`env: TITLE: ${{ ... }}` e `"$TITLE"` no shell), **nunca** interpolado direto no `run:`. Interpolar permitiria um título malicioso executar comandos na pipeline (injeção de script).

## 4. CI: validar toda mudança

Arquivo: `.github/workflows/ci.yml`. Dispara em `pull_request` e em `push` na `main`.

| Trecho | O que faz | Por quê |
| --- | --- | --- |
| `permissions: contents: read` | O token do workflow só lê | Menor privilégio; um passo comprometido não consegue escrever |
| `concurrency: group: ci-${{ github.ref }}`, `cancel-in-progress: true` | Um novo push na mesma branch cancela a execução antiga | Economiza minutos e evita resultado velho |
| `timeout-minutes` | Limite por job | Um travamento não consome horas |
| `actions/checkout` com `persist-credentials: false` | Não grava o token no `.git` | Passos seguintes (scripts de dependências) não conseguem reaproveitá-lo |
| `oven-sh/setup-bun` | Instala o Bun | O projeto usa Bun |
| `bun install --frozen-lockfile` | Instala exatamente o que o lockfile diz; falha se estiver desatualizado | Reprodutibilidade; barra mudança de dependência "escondida" |
| `bun audit --audit-level=high` | Falha com vulnerabilidade alta/crítica conhecida | Segurança de dependências como porta do pipeline |
| `bun run test` | Testes do domínio (`shared`) e do app, incluindo o validador de contraste | Correção |
| `bun run build` | `tsc --noEmit` + build do Vite | Typecheck e garantia de que compila |
| `upload-artifact` do `dist` | Guarda o build por 7 dias | Inspecionar o que foi gerado |
| Job `e2e` separado | `playwright install --with-deps chromium` + `bun run e2e` | Roda em paralelo ao `test`; testa o app de verdade em navegador (desktop e celular simulado) |

Os **nomes dos jobs** (`test`, `e2e`, `title`) importam: são eles que o ruleset da `main` exige como *status checks* obrigatórios. Renomear um job quebra a regra silenciosamente (o check "esperado" nunca aparece e o merge fica travado).

**O e2e de CSP** (`e2e/csp.spec.ts`) merece menção: ele aplica os cabeçalhos reais do `public/_headers` e falha em qualquer violação, inclusive avisos de `Permissions-Policy`. Foi ele que pegou o recurso `bluetooth` não reconhecido no Chromium do CI (seção 13).

## 5. Release: o release-please por dentro

[release-please](https://github.com/googleapis/release-please) (Google) é uma ferramenta que **não publica nada**: ela mantém um **PR** e, quando ele é mergeado, cria uma **tag** e uma **Release no GitHub**. O que você faz com a tag (deploy, publicar no npm, imagem Docker) é problema do resto da pipeline.

### O estado: o manifesto

`.release-please-manifest.json` guarda a última versão lançada:

```json
{ ".": "0.2.0" }
```

O `"."` é o pacote raiz. A cada execução, o release-please:

1. Lê a versão do manifesto (`0.2.0`) e procura a tag correspondente (`v0.2.0`).
2. Lista os commits da `main` **desde essa tag**.
3. Classifica cada um pelo prefixo (tabela da seção 3) e descarta os que não são Conventional Commits.
4. Calcula a **maior** mudança de versão entre eles.
5. Se houver algo que mereça versão, **abre ou atualiza** o PR `chore(main): release X.Y.Z` com: `package.json` (campo `version`), `.release-please-manifest.json` e `CHANGELOG.md`. Se não houver, não abre nada.

Por isso o PR de release é "vivo": a cada merge na `main` ele é reescrito, acumulando as mudanças. Ele fica aberto o tempo que você quiser.

### A configuração: `release-please-config.json`

| Chave | Valor | Efeito |
| --- | --- | --- |
| `release-type` | `node` | Atualiza o `version` do `package.json` |
| `include-component-in-tag` | `false` | Tag `v0.2.0` (sem prefixo do componente) |
| `bump-minor-pre-major` | `true` | Antes da 1.0, quebra de compatibilidade só sobe o minor |
| `bump-patch-for-minor-pre-major` | `false` | Antes da 1.0, `feat` sobe o minor |
| `changelog-path` | `CHANGELOG.md` | Onde escrever |
| `changelog-sections` | lista de `type`/`section`/`hidden` | Quais tipos aparecem e com que título (em português) |
| `packages` | `{ ".": {} }` | Um pacote só, na raiz |

### Mergear o PR de release = lançar

Ao mergear, o push resultante dispara `release.yml` de novo. Dessa vez o release-please vê que o commit é o de release: **cria a tag `v0.2.0` e a Release** e expõe saídas no workflow:

```yaml
outputs:
  release_created: ${{ steps.rp.outputs.release_created }}   # 'true' só nesta execução
  tag_name:        ${{ steps.rp.outputs.tag_name }}          # 'v0.2.0'
```

Essas saídas são o **gatilho do deploy**: o job seguinte lê `release_created`. Em qualquer outra execução (um merge comum), ela vem vazia e o deploy é pulado.

## 6. Deploy: só depois da versão

Está no mesmo arquivo (`release.yml`), no job `deploy`. É a parte que mais interessa reproduzir.

```yaml
deploy:
  needs: release-please
  if: ${{ github.repository == 'dono/repo' && (needs.release-please.outputs.release_created == 'true' || inputs.redeploy) }}
  environment: production
  permissions: { contents: read }
  steps:
    - uses: actions/checkout@<sha>
      with:
        ref: ${{ needs.release-please.outputs.tag_name || github.ref }}
        persist-credentials: false
    - uses: oven-sh/setup-bun@<sha>
    - run: bun install --frozen-lockfile
    - run: bun audit --audit-level=high
    - run: bun run test
    - run: bun run build
    - uses: cloudflare/wrangler-action@<sha>
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        command: pages deploy dist --project-name=keyz --branch=main --commit-dirty=true
```

Linha por linha:

| Elemento | Significado |
| --- | --- |
| `needs: release-please` | O deploy só começa depois do job de release terminar e **recebe as saídas dele** |
| `if: ... release_created == 'true'` | **É aqui que o deploy fica atrelado à versão.** Sem Release nova, o job é pulado |
| `|| inputs.redeploy` | Válvula de escape: *Run workflow* com `redeploy` marcado republica sem nova release (útil depois de uma falha) |
| `github.repository == 'dono/repo'` | Forks com Actions ligado não tentam lançar nem publicar |
| `environment: production` | Libera os secrets do ambiente e aplica a regra "só a branch `main`" |
| `permissions: contents: read` | O job de deploy não precisa escrever no repositório |
| `ref: tag_name \|\| github.ref` | Faz checkout **da tag lançada** (o código exato da versão). No `redeploy`, não há tag nova e cai para a ref atual (a `main`) |
| `install`/`audit`/`test`/`build` de novo | O CI já validou o PR, mas o deploy **revalida o commit da tag** antes de publicar. Custa minutos e garante que nada quebrou entre o PR e a tag |
| `wrangler-action` | Envia o conteúdo de `dist/` ao Cloudflare Pages |
| `--project-name=keyz` | O **nome do projeto** na Cloudflare. Atenção: não é o domínio (ver seção 13) |
| `--branch=main` | No Pages, a branch `main` é **produção**; outras viram prévias |

### O que acontece se algo falha

A ordem dos passos é o seguro: `install → audit → test → build → deploy`. **Se qualquer passo antes do `wrangler` falhar, nada é enviado** e o site permanece na versão anterior. Se o próprio `wrangler` falhar (token, projeto), também nada muda. Isso foi exercitado de verdade (seção 10).

### Rollback

Cloudflare › Workers & Pages › projeto › *Deployments* › deployment anterior › *Rollback to this deployment* (instantâneo, sem build). Depois, corrija por PR e lance outra versão. Nunca apague tags.

## 7. Confiança: ambiente, secrets e `GITHUB_TOKEN`

### Secrets só onde precisam

`CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` ficam no **ambiente** `production` (não no repositório). O ambiente tem uma **política de branches**: só a `main` o acessa. Uma execução em outra branch (inclusive de um PR de fork) simplesmente não recebe os secrets. O token da Cloudflare tem uma única permissão (*Cloudflare Pages: Edit*), então até um vazamento tem alcance limitado.

### Dois tokens diferentes

| Token | Quem cria | Para quê | Alcance |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | O GitHub, automático, por execução | Falar com o GitHub (criar PR, tag, Release) | Definido por `permissions:` no workflow/job |
| `CLOUDFLARE_API_TOKEN` | Você, no painel da Cloudflare | Publicar no Pages | Só *Pages: Edit* em uma conta |

No repositório, o padrão do `GITHUB_TOKEN` foi configurado como **somente leitura**; só o job `release-please` o eleva (`contents: write`, `pull-requests: write`).

### A regra do `GITHUB_TOKEN` que explica um comportamento "estranho"

O GitHub **não dispara novos workflows a partir de eventos criados pelo `GITHUB_TOKEN`** (exceto `workflow_dispatch` e `repository_dispatch`). É uma proteção contra laços infinitos. Efeitos aqui:

- O **PR de release**, aberto pelo release-please com `GITHUB_TOKEN`, **não dispara o `ci.yml`**. Por isso `test`, `e2e` e `title` nunca ficam verdes nele, e é preciso o **bypass de admin** para mergeá-lo.
- A tag e a Release criadas por ele também não disparam workflows (por isso o deploy vive **dentro do mesmo workflow**, ligado por `needs`/saídas, e não em um workflow separado "on: release").

Alternativas (seção 12): usar um **PAT** ou um **GitHub App** no release-please, para o PR de release rodar o CI e disparar outros workflows.

## 8. Proteção da `main` e como ela conversa com a pipeline

Ruleset `proteger-main` (detalhes e comandos em `docs/SEGURANCA.md`):

- **PR obrigatório**, histórico linear, sem force-push, sem deleção.
- **Status checks obrigatórios:** `test`, `e2e`, `title`.
- **Bypass** só para a função *admin*, e **somente ao mergear PR** (`bypass_mode: pull_request`), nunca para push direto.
- Merge **só por squash**; o título do PR vira o commit.

Como isso se encaixa:

| Peça | Dependência |
| --- | --- |
| Só squash + título validado | Garante um commit Conventional por PR, o que o release-please precisa |
| Checks obrigatórios com nomes fixos | Dependem dos nomes dos jobs em `ci.yml` e `pr-title.yml` |
| Bypass só em PR | Existe por causa do PR de release (sem CI); permite lançar sem abrir a porta para push direto |
| Ambiente `production` só na `main` | Garante que só código já mergeado acessa os secrets |

Ordem de montagem importa: o ruleset **vem depois** do primeiro push dos workflows, senão você se tranca para fora (seção 11).

## 9. Dependabot: manter tudo atualizado

`.github/dependabot.yml` abre PRs semanais para as dependências (`bun`) e para as Actions. Eles passam pelo mesmo CI e pelo `pr-title` (o prefixo `chore(deps)`/`ci(deps)` já é Conventional). `chore` e `ci` não geram versão, então atualizar dependência não cria release sozinha.

Ponto de atenção: **as Actions estão fixadas por SHA**. O Dependabot propõe o novo SHA e atualiza o comentário `# vX`. Atualizações *major* de Actions que tocam release ou deploy (`release-please-action`, `wrangler-action`) merecem teste manual (`redeploy`). Roteiro completo em `docs/FLUXO.md` (seção 3).

## 10. O ciclo completo, passo a passo (caso real)

Linha do tempo real do Keyz em 2026-11-01 (horários UTC):

| Hora | Evento | O que a pipeline fez |
| --- | --- | --- |
| 16:10 | Push dos workflows na `main` | CI roda (`test` ok, `e2e` falha) e o release-please **abre o PR #1 "release 0.2.0"** (havia `feat` desde a `0.1.0`) |
| 16:11 | Correção do aviso de `Permissions-Policy` | `e2e` volta a ficar verde |
| 16:35 | PR #11 (`feat`) mergeado | release-please **atualiza o PR #1** em 18 s com a nova entrada |
| 16:39 | PR #12 (`ci:` esconde `docs` do changelog) mergeado | #1 é regenerado sem a seção de Documentação |
| 16:40:14 | PR #1 mergeado (bypass) | release-please **cria a tag `v0.2.0` e a Release**; `release_created=true` |
| 16:40:46 | Job `deploy` roda | `install`, `audit`, `test`, `build` passam |
| 16:40:47 | `wrangler pages deploy` | **Falha:** `Project not found [code: 8000007]` |

O que esse caso ensina:

1. **O gating funcionou:** a Release foi criada, o deploy falhou, e o **site seguiu na versão anterior**. Nada quebrou para o usuário.
2. **O erro era de configuração, não de código:** o workflow usava `--project-name=keyz-9ir`, mas `keyz-9ir` é só o prefixo do domínio (`keyz-9ir.pages.dev`); o **nome do projeto** é `keyz` (confirmado com `wrangler pages project list`). Corrigido em PR próprio.
3. **A válvula `redeploy` existe para isso:** depois de corrigir, *Run workflow* com `redeploy` marcado publica a versão sem criar outra release.
4. A falha apareceu **no primeiro deploy real**: nada testa o deploy de verdade antes de uma Release. Vale rodar um `redeploy` assim que a pipeline for montada, antes de depender dela.

## 11. Reproduzir em outro projeto

Pré-requisitos: repositório no GitHub (público, para CI gratuito ilimitado; em privado há cota de minutos), projeto no Cloudflare Pages (ou outro destino), `gh` e `wrangler` instalados e logados. Substitua `OWNER/REPO`, `PROJETO` e os comandos do seu gerenciador de pacotes.

### Passo 1: base do projeto

- Scripts `test` e `build` que funcionam localmente e **falham com código de saída ≠ 0**.
- Lockfile versionado.
- `package.json` com `"version": "0.1.0"` (ou a versão atual).
- `.gitignore` sem artefatos de build nem segredos.

### Passo 2: CI (`.github/workflows/ci.yml`)

Esqueleto mínimo (fixe as Actions por SHA depois, ver passo 9):

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }
permissions: { contents: read }
concurrency: { group: "ci-${{ github.ref }}", cancel-in-progress: true }
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with: { persist-credentials: false }
      - uses: oven-sh/setup-bun@v2          # ou setup-node
      - run: bun install --frozen-lockfile
      - run: bun audit --audit-level=high   # npm: `npm audit --audit-level=high`
      - run: bun run test
      - run: bun run build
```

### Passo 3: validação do título (`pr-title.yml`)

Copie o `pr-title.yml` deste repositório. Mantenha o título em variável de ambiente.

### Passo 4: release-please

`release-please-config.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "node",
  "include-component-in-tag": false,
  "bump-minor-pre-major": true,
  "bump-patch-for-minor-pre-major": false,
  "changelog-path": "CHANGELOG.md",
  "changelog-sections": [
    { "type": "feat", "section": "Novidades" },
    { "type": "fix", "section": "Correções" },
    { "type": "perf", "section": "Desempenho" },
    { "type": "refactor", "section": "Refatorações" },
    { "type": "docs", "hidden": true },
    { "type": "chore", "hidden": true },
    { "type": "ci", "hidden": true },
    { "type": "test", "hidden": true }
  ],
  "packages": { ".": {} }
}
```

`.release-please-manifest.json`, com a versão **que já está lançada** (ou `0.0.0` se nunca lançou):

```json
{ ".": "0.1.0" }
```

Dica: se o repositório já tem histórico não convencional, crie **antes** a tag da versão atual (`git tag v0.1.0 && git push --tags`) para o release-please não varrer o histórico inteiro; ele só olha commits depois dessa tag.

### Passo 5: workflow de release e deploy (`release.yml`)

Use o da seção 6 e acrescente o job `release-please`:

```yaml
name: Release
on:
  push: { branches: [main] }
  workflow_dispatch:
    inputs:
      redeploy: { description: "Republicar a versão atual", type: boolean, default: false }
permissions: { contents: read }
concurrency: { group: release, cancel-in-progress: false }
jobs:
  release-please:
    if: github.repository == 'OWNER/REPO'
    runs-on: ubuntu-latest
    permissions: { contents: write, pull-requests: write }
    outputs:
      release_created: ${{ steps.rp.outputs.release_created }}
      tag_name: ${{ steps.rp.outputs.tag_name }}
    steps:
      - id: rp
        uses: googleapis/release-please-action@v4
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
  deploy:
    needs: release-please
    if: ${{ github.repository == 'OWNER/REPO' && (needs.release-please.outputs.release_created == 'true' || inputs.redeploy) }}
    runs-on: ubuntu-latest
    environment: production
    permissions: { contents: read }
    steps:
      # ...igual à seção 6, com --project-name=PROJETO
```

`cancel-in-progress: false` no `release` é intencional: não se cancela uma release/deploy em andamento.

### Passo 6: configurar o GitHub (antes do primeiro push que lança)

```sh
R=OWNER/REPO
# token do Actions só-leitura; Actions podem abrir PRs (necessário ao release-please)
gh api -X PUT repos/$R/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
# ambiente de produção restrito à main
gh api -X PUT repos/$R/environments/production --input - <<< '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
gh api -X POST repos/$R/environments/production/deployment-branch-policies -f name=main -f type=branch
# só squash, título do PR vira o commit, branch apagada após merge
gh api -X PATCH repos/$R -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK -F delete_branch_on_merge=true
```

Sem "*Allow GitHub Actions to create and approve pull requests*" (o primeiro comando), o release-please não consegue abrir o PR.

### Passo 7: secrets

Siga `docs/DEPLOY-SECRETS.md`: token Cloudflare com permissão única *Pages: Edit*, depois `gh secret set ... --env production`. Descubra o **nome real** do projeto Pages com `wrangler pages project list` (**não** use o prefixo do domínio).

### Passo 8: primeiro push e teste do deploy

1. Faça o push da pipeline para a `main` (ainda sem ruleset).
2. Faça um commit `feat:` (via PR) e veja o PR de release aparecer.
3. Antes de depender dela, rode um **`redeploy`**: *Actions › Release › Run workflow*, `redeploy` marcado. Isso valida token, nome do projeto e `wrangler`, sem criar versão.

### Passo 9: endurecer

- **Fixar Actions por SHA**: `gh api repos/<dono>/<repo>/commits/<tag> --jq .sha` e escrever `uses: dono/repo@<sha> # vX`.
- **Lista de Actions permitidas** em *Settings › Actions*.
- **Ruleset da `main`** (PR obrigatório, checks `test`/`e2e`/`title`, histórico linear, bypass de admin só em PR). Comandos em `docs/SEGURANCA.md`. Só depois do passo 8.
- **Secret scanning, push protection, Dependabot, denúncia privada.**
- **Aprovação para PRs de fora** (`all_external_contributors`).
- Dependabot (`dependabot.yml`), `CODEOWNERS`, `SECURITY.md`.

### Passo 10: convenções para o time

Documente (como em `CLAUDE.md` e `CONTRIBUTING.md`): Conventional Commits em PR, só PR na `main`, "mergear o PR de release = lançar".

### Checklist final

- [ ] `test` e `build` locais passam e falham com código ≠ 0
- [ ] CI verde em um PR de teste; títulos de PR inválidos são barrados
- [ ] Um `feat:` mergeado abre o PR de release com a versão esperada
- [ ] `redeploy` manual funciona (token, nome do projeto, conta)
- [ ] Mergear o PR de release cria tag + Release e dispara o deploy
- [ ] Um deploy forçado a falhar não altera o site (e o rollback funciona)
- [ ] Ruleset ativo e um push direto na `main` é recusado
- [ ] Secrets só no ambiente `production`, ambiente só na `main`

## 12. Variações

| Quero... | Como |
| --- | --- |
| **Outro destino de deploy** | Troque só o último passo do job `deploy`: Vercel (`vercel --prod --prebuilt`), Netlify (`netlify deploy --prod`), GitHub Pages (`actions/deploy-pages`), npm (`npm publish --provenance`), Docker (`docker/build-push-action`). O gatilho (`release_created`) e o restante não mudam |
| **O CI rodar no PR de release** | Dar ao release-please um **PAT** ou **GitHub App** em vez do `GITHUB_TOKEN` (`token: ${{ secrets.RELEASE_PLEASE_TOKEN }}` na action). Eventos criados com esse token disparam workflows. Dá para então tirar o bypass de admin. Custo: gerenciar mais um segredo |
| **Deploy em workflow separado, disparado pela tag** | Exige o item acima (a tag criada com `GITHUB_TOKEN` não dispara `on: push: tags`/`on: release`). Vantagem: deploy independente do `release.yml` |
| **Ambiente de homologação** | Segundo ambiente (`staging`) com deploy a cada merge na `main`, e `production` só na Release. O `deploy --branch` do Pages ou projetos separados ajudam |
| **Pré-lançamentos** (`-rc.1`) | Configuração `prerelease` do release-please ou branches de release dedicadas |
| **Monorepo com vários pacotes** | `packages` com um caminho por pacote, um item por pacote no manifesto e `include-component-in-tag: true` |
| **Aprovação humana antes do deploy** | Adicionar *required reviewers* ao ambiente `production`: o job pausa até alguém aprovar |
| **Hotfix** | Branch a partir da tag, `fix:` via PR, e o fluxo normal gera o patch |

## 13. Armadilhas e lições do Keyz

Todas aconteceram de verdade neste projeto.

| Problema | Sintoma | Causa | Solução |
| --- | --- | --- | --- |
| **Nome do projeto Pages** | Deploy falha com `Project not found [code: 8000007]` | O workflow usava o prefixo do domínio (`keyz-9ir`) como nome; o projeto se chama `keyz` | `wrangler pages project list` e coluna *Project Name*. O domínio `*.pages.dev` pode ter sufixo aleatório e **não é** o nome |
| **Aviso em `Permissions-Policy` quebrou o e2e** | `Unrecognized feature: 'bluetooth'` só no CI | O Chromium do CI é mais antigo que o local e não conhece esse recurso | Usar só recursos amplamente suportados; o teste de CSP trata o aviso como falha, o que expôs o problema |
| **PR de release sem CI** | Checks obrigatórios nunca ficam verdes; PR `BLOCKED` | Eventos criados pelo `GITHUB_TOKEN` não disparam workflows | Bypass de admin **só para PR** (`pull_request`), ou PAT/App |
| **Trancar-se para fora** | Push direto na `main` recusado | Ruleset aplicado antes de o dono precisar de push | Aplicar o ruleset por último; manter bypass `pull_request` |
| **Versão não subia** | Release PR não aparece depois de mergear | Título do PR sem prefixo Conventional (ou só `docs`/`chore`) | `pr-title.yml` obrigatório; lembrar que `docs`/`chore`/`ci` não geram versão |
| **Conflito de testes nos PRs** | Dois PRs acrescentaram testes no fim do mesmo arquivo | Edições concorrentes no mesmo trecho | Resolver mantendo os dois; marcadores de conflito deixados em arquivo quebram a sintaxe (rode os testes antes do push) |
| **PRs do Dependabot vermelhos** | `e2e` falhava em todos | Branches criadas antes de uma correção na `main` | `@dependabot rebase` |
| **Checks "esperados" que nunca aparecem** | Merge travado | Renomear um job muda o nome do check exigido | Manter nomes (`test`, `e2e`, `title`) ou atualizar o ruleset junto |
| **Status do PR desatualizado** | `CONFLICTING` logo após o rebase | O GitHub recalcula `mergeable` de forma assíncrona | Esperar alguns segundos e consultar de novo |
| **Falso "não atualizou"** | PR de release parecia velho | Cache da página; o release-please atualiza em ~20 s depois do merge | Recarregar; conferir `gh run list` e o conteúdo da branch do PR |
| **Teste de segurança bloqueado** | Tentativa de provar o bloqueio com push direto | Tentar contornar a proteção, mesmo para testar, é barrado por quem opera as permissões | Validar com `gh api repos/$R/rules/branches/main` e provar com o primeiro PR real |

Lições gerais:

1. **Teste o deploy antes de precisar dele** (`redeploy`); testes e CI não provam o deploy.
2. **Consulte o nome real** de cada recurso externo (projeto, conta) em vez de deduzir.
3. **Mudanças que "só" mexem em pipeline são as de maior risco**: revise-as como código de produção.
4. **Documente as armadilhas na hora**: o custo de redescobri-las é alto.

## 14. Cola de comandos

```sh
R=alsantosrafael/keyz

# Execuções e estado
gh run list --repo $R --workflow release.yml --limit 5
gh run view <id> --repo $R --log-failed        # só os passos que falharam
gh run watch <id> --repo $R --exit-status      # acompanhar até terminar

# PR de release e Releases
gh pr list --repo $R --search "release" --state open
gh release list --repo $R
gh api repos/$R/contents/CHANGELOG.md?ref=release-please--branches--main--components--keyz --jq .content | base64 -d | head -30

# Disparar manualmente
gh workflow run release.yml --repo $R -f redeploy=true

# Cloudflare
bunx wrangler whoami                  # conta(s) e ID
bunx wrangler pages project list      # NOME do projeto (coluna Project Name)
bunx wrangler pages deployment list --project-name=keyz

# Segredos (só nomes) e proteções
gh secret list --env production --repo $R
gh api repos/$R/rules/branches/main --jq '[.[].type]'
gh api repos/$R/rulesets --jq '.[]|{name,enforcement}'
```
