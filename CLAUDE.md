# Keyz

App de prática de piano/teclado com quatro modos: **Acordes**, **Desafio**, **Livre** e **Entrada**. Entradas: teclado MIDI, microfone e teclado na tela (ou do computador). Idioma do projeto: português do Brasil, em interface, docs, commits e comentários.

Este arquivo é o ponto de entrada para agentes. Ele aponta para as docs duráveis; **não** dependa de `docs/SPEC.md` (ver "Fontes de verdade").

## Mapa do repositório

| Caminho | O que é |
| --- | --- |
| `src/` | App web (Vite + React 19 + TypeScript). Camadas: `platform/`, `application/`, `state/`, `features/`, `ui/` |
| `shared/` | `@keyz/shared`: domínio puro (música, DSP, exercícios, onboarding, schemas Zod, changelog). Workspace do Bun |
| `e2e/` | Playwright (desktop e celular simulado) |
| `functions/` | Cloudflare Pages Functions. Hoje só `api/reportar.ts` (cria a issue do relatório de problema) |
| `public/` | `_headers` (CSP e cabeçalhos) e `_redirects` (SPA) |
| `docs/` | Documentação durável (ver mapa abaixo) |
| `.claude/skills/` | Skills do projeto (design, UI, apresentações) |

O app Swift original (`keyz-mac/`) **foi removido do repositório**. Continua no histórico do git (até o commit `f0d1e34`). Não recrie nem edite essa pasta sem pedido explícito.

## Mapa de documentação

| Doc | Quando ler | Quando atualizar |
| --- | --- | --- |
| `docs/ARQUITETURA.md` | Antes de mexer em camadas, estado, áudio, MIDI, persistência ou testes | Ao mudar estrutura, dependências entre camadas, chaves de armazenamento ou pipeline de áudio |
| `docs/DESIGN.md` | Antes de qualquer trabalho de UI (cor, tipo, movimento, componentes, acessibilidade) | Ao mudar tokens, princípios, componentes ou regras de movimento |
| `docs/MODOS.md` | Antes de mudar o comportamento de um modo ou do onboarding | Ao mudar qualquer regra de produto de um modo |
| `docs/QUESTOES.md` | Antes de decidir algo de produto | Ao abrir, fechar ou decidir uma questão |
| `docs/FLUXO.md` | Para branch, PR, release, rollback e Dependabot | Ao mudar o fluxo de trabalho |
| `docs/PIPELINE.md` | Para CI/CD | **Sempre** que mudar qualquer workflow em `.github/` |
| `docs/SEGURANCA.md` | Para cabeçalhos HTTP, CSP, workflows, ruleset e proteções | **Sempre** que mudar cabeçalho, workflow, ruleset ou proteção |
| `docs/DEPLOY-SECRETS.md` | Para configurar segredos de deploy | Ao mudar a forma de configurar segredos |
| `docs/OBSERVABILIDADE.md` | Antes de adicionar log, evento ou telemetria, e antes de depurar um erro de produção | Ao mudar eventos, atributos, teto de envios ou privacidade da telemetria |
| `docs/SPEC.md` | **Só histórico** da migração Swift → web | Não atualizar. Está congelada |

## Comandos

```sh
bun install --frozen-lockfile   # instala (o lockfile não pode mudar sem motivo)
bun run dev                     # servidor de desenvolvimento
bun run typecheck               # tsc --noEmit
bun run test                    # Vitest: shared (bun run test:shared) e app (bun run test:app)
bun run build                   # typecheck + build em dist/
bun run e2e                     # Playwright (precisa de `bunx playwright install chromium` na primeira vez)
```

Não use `bun test`: o Vitest tem o próprio runner.

## Regras de arquitetura (não negociáveis)

- `shared/` não importa nada de fora dele: sem DOM, React, Web Audio ou `window`.
- Dependências apontam para dentro: `shared` ← `platform` (implementa portas) ← `application` ← `state` ← `features`/`ui`.
- `features/` não importa `platform/` diretamente. Usa `services()` e as portas de `application`.
- Regra de negócio fica em `shared/` ou `application/`, nunca em store (Zustand) nem em componente.
- Dado vindo de fora (armazenamento, MIDI, arquivos) é validado com Zod na borda. Os tipos vêm de `z.infer`.
- Análise de áudio roda em Web Worker; a thread principal só recebe resultados.

## Regras de design (resumo; detalhes em `docs/DESIGN.md`)

- Dark-first, com tema claro completo. Teclado fixo na base da tela; os modos mudam o que está acima dele.
- Componentes usam só tokens semânticos (variáveis CSS do Tailwind v4). **Nunca hexadecimal solto.**
- Tecla reage no `pointerdown` ou no evento MIDI, no mesmo quadro (≤ 16 ms). Animar só `transform` e `opacity`.
- Toda animação é interrompível, nunca bloqueia entrada e tem versão para `prefers-reduced-motion`.
- Cor nunca é o único sinal: ícone e texto acompanham. Alvos de toque ≥ 44 px. Foco visível. Resultados anunciados com `aria-live="polite"`, sem roubar o foco.
- Ícones só de `lucide-react`. Nunca emoji.

## Regras de produto (resumo; detalhes em `docs/MODOS.md`)

- **Desafio é jogo**: contagem, anel de tempo, sequência, estrelas. Erro e tempo esgotado nunca punem forte: mostram a resposta certa e seguem.
- **Livre prioriza passagem de nota estável**: histerese no microfone, nota mantida após soltar a tecla, sem layout que pula.
- **Onboarding é um tutorial de acordes**, feito no teclado real, retomável e completável a qualquer momento. Aparece uma vez como convite; depois só por Ajustes › Aprender ou pelo lembrete do Acordes. Detalhes em `docs/MODOS.md`.

## Fontes de verdade

Em caso de conflito: **código e testes** > docs duráveis (`ARQUITETURA`, `DESIGN`, `MODOS`) > `CLAUDE.md`. `docs/SPEC.md` é histórica: se algo nela contradiz o código, o código manda. Não cite a spec como referência de regra.

## Como trabalhar

1. **Antes de editar**: leia o doc da área (tabela acima). Se a tarefa muda comportamento, leia também `docs/QUESTOES.md`: dúvida de produto em aberto não se resolve no código.
2. **Escreva o teste junto da regra**: domínio em `shared/test/` (Vitest); sessões e portas em `src/application/*.test.ts`; fluxo visível em `e2e/`.
3. **Antes de dizer que terminou**, rode, nesta ordem: `bun run typecheck`, `bun run test` e, se mexeu em tela ou fluxo, `bun run e2e`. Reporte o resultado real, inclusive falhas.
4. **Atualize a doc no mesmo trabalho** quando mudar comportamento, design, arquitetura, workflow ou proteção (tabela acima).
5. **Não pare no meio de uma tarefa** por causa de detalhe que você pode decidir sozinho: escolha, registre a escolha na resposta final e siga.

## Git e publicação

- **Não commite, não dê push e não publique sem pedido explícito.** Trabalhe na árvore de trabalho.
- Quando for commitar: nunca direto na `main` (ela só aceita PR). Branch `feat/…` ou `fix/…`, PR com `gh pr create`, espere o CI.
- Commits e títulos de PR seguem Conventional Commits, com descrição em português (`feat(desafio): …`). A versão (SemVer) e o CHANGELOG saem deles via release-please. **Nunca edite versão ou CHANGELOG à mão.** Lançar = mergear o PR de release.
- Segredos (token da Cloudflare etc.) nunca entram no repositório nem na conversa; ficam em GitHub Secrets.
