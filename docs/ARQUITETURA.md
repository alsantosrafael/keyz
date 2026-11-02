# Arquitetura

Como o código está organizado e por que. Doc durável: atualize quando a estrutura, as dependências entre camadas, as chaves de armazenamento ou o pipeline de áudio mudarem.

## Visão geral

SPA estática (Vite + React 19 + TypeScript), sem servidor próprio, publicada na Cloudflare Pages. O app não tem backend, contas nem analytics: o áudio nunca sai do aparelho.

| Camada | Pasta | Papel | Pode importar |
| --- | --- | --- | --- |
| Domínio | `shared/src/` | Música, DSP, exercícios, onboarding, schemas Zod | Só ele mesmo |
| Plataforma | `src/platform/` | Adaptadores do navegador: áudio, piano, MIDI, microfone, armazenamento, vibração | `shared`, `application` (portas) |
| Aplicação | `src/application/` | Sessões (Livre, Acordes, Desafio, Tutorial), InputHub, portas | `shared` |
| Estado | `src/state/` | Stores Zustand finas que expõem a aplicação para a UI | `application`, `shared` |
| Interface | `src/features/`, `src/ui/` | Telas por modo, shell, componentes do instrumento | `state`, `application` (via `services()`), `shared` |

Regras:

- `shared` não importa nada de fora dele: sem DOM, React ou Web Audio. Por isso as regras de acorde e de desafio são testáveis em Node.
- `platform` só implementa portas definidas em `application`; nunca chama a UI.
- `features` não importa `platform` diretamente. Usa `services()` (a raiz de composição em `src/bootstrap.ts`).
- Estado não tem regra: store guarda snapshot para a UI. Quem decide é `application` ou `shared`.
- Comunicação entre camadas usa eventos tipados (`Emitter`) e dados validados com Zod.

## Estrutura de pastas (atual)

```text
keyz/
├─ src/
│  ├─ main.tsx, App.tsx, bootstrap.ts     entrada e raiz de composição
│  ├─ platform/                            audio, piano (SynthPiano), midi, microphone + mic.worker,
│  │                                       feedback (sons de jogo), haptics, storage
│  ├─ application/                         InputHub, ChordSession, DrillSession, FreeSession,
│  │                                       TutorialSession, MicController, ports, services, test-kit
│  ├─ state/                               app.ts (ajustes, UI, sessões), onboarding.ts (tutorial)
│  ├─ features/
│  │  ├─ shell/                            Layout, ModeBar, InputPill, SettingsSheet, MicPrompt, modes
│  │  ├─ acordes/ desafio/ livre/ entrada/ telas por modo
│  │  ├─ onboarding/                       Tutorial, TutorialPrompt (convite e lembrete), ModeTip, TutorialSettings
│  │  └─ common/                           Hud, Summary, Stars, hooks
│  └─ ui/                                  theme.css (tokens), controls, PianoKeyboard, StaffCard,
│                                          NoteReadout, NoteTrail, Meter, TimeRing, LiveRegion
├─ shared/
│  ├─ src/music/      Note, PitchClass, Chord, StaffPlacement, keyboard
│  ├─ src/dsp/        YIN (pitch-detector), chroma, FFT, stabilizers, display-stabilizer, held-notes, mic-pipeline
│  ├─ src/drills/     NoteDrill, ChordGenerator, ChordEvaluator, ChordRecognizer, DrillConfig, rating (estrelas)
│  ├─ src/onboarding/ passos do tutorial, transições de progresso, schema
│  ├─ src/schemas/    Zod: ajustes, chaves de armazenamento, exercícios, MIDI
│  ├─ src/changelog/  parser do CHANGELOG (texto puro)
│  └─ test/           testes de domínio e DSP, com fixtures
├─ e2e/               Playwright: app, CSP e tutorial
└─ public/            _headers, _redirects, mic-worklet.js, favicon
```

## Pipeline de áudio e MIDI

**Microfone** (`platform/microphone.ts` + `platform/mic.worker.ts` + `public/mic-worklet.js`):

1. `getUserMedia` com `echoCancellation`, `noiseSuppression` e `autoGainControl` **desligados**: esses filtros distorcem o som de piano.
2. Um AudioWorklet recebe blocos de 128 amostras, junta em janelas de 10 ms (`HOP_SECONDS = 0.01`) e envia `Float32Array` transferível a um Web Worker.
3. O worker roda YIN e chroma (`shared/src/dsp`) e devolve frequência, confiança, nota e ataques.
4. A estabilização acontece no domínio, com as mesmas regras do app Swift original: nota estável após 3 quadros, conjunto de classes de acorde após 5 quadros, e ataque novo só depois de 8 quadros do anterior. A exibição tem histerese: a nota só troca depois de 3 quadros, e a leitura esmaece em 200 ms quando a confiança cai (não pisca para vazio).
5. Sensibilidade mapeia para a relação sinal/ruído com a fórmula `12 − 8·s`, onde `s` é a sensibilidade de 0 a 1.

**Portão de saída** (`application/output-gate.ts`): sem cancelamento de eco, o microfone ouve o próprio som do app (cues, acorde do tutorial, piano) e o transforma em notas, que disparam mais som: um laço. Por isso o `bootstrap` envolve o piano e o feedback (`gated-ports.ts`) para marcar quando o app está soando; o `MicController` ignora o microfone enquanto o portão está fechado, mais uma cauda de 600 ms. Uma nota presa sem `noteOff` expira em 10 s. Efeito colateral: com o som do piano ligado, o microfone fica cego para o que o app toca, inclusive notas de MIDI e da tela.

**MIDI** (`platform/midi.ts`): `navigator.requestMIDIAccess({ sysex: false })`, com `onstatechange` para conexão a quente. Cada mensagem passa por `parseMidiMessage` (Zod) antes de chegar à aplicação. Safari e Firefox não têm MIDI: a tela de Entrada explica isso.

**Teclado do computador e na tela**: `keydown`/`keyup` (`features/shell/useComputerKeyboard.ts`) e pointer events na tecla. Tudo entra pelo `InputHub`.

**InputHub** (`application/input-hub.ts`): une as fontes (`screen`, `computer`, `midi`, `mic`) em eventos `on`/`off` por nota. Uma nota só solta quando todas as fontes soltam. Suporta modo "segurar teclas" (latch).

**Som do piano**: `platform/piano.ts` (`SynthPiano`) é síntese aditiva em Web Audio, sem samples. A porta `PianoPort` isola a escolha; trocar por samples é questão aberta (`docs/QUESTOES.md`).

**Sons de jogo**: `platform/feedback.ts`, osciladores curtos (≤ 300 ms) no mesmo `AudioContext`. Nenhum som toca antes do primeiro gesto do usuário; o `AudioContext` nasce suspenso e é retomado no primeiro toque.

**Restrições de navegador**: o `AudioContext` só inicia após um gesto (`bootstrap.ts` escuta o primeiro `pointerdown`/`keydown`). O microfone exige HTTPS.

## Estado, validação e persistência

**Sessões** (`application/`): cada modo é uma classe com um `snapshot` e um `Emitter`. A UI assina pelo Zustand (`state/app.ts` cria as stores de ponte). Sessões não conhecem React. As sessões vivem durante todo o app e assinam o `InputHub`; por isso uma sessão que julga notas (`ChordSession`) só escuta enquanto a tela dela está aberta (`setActive`, chamado pelo componente). O Desafio já ignora notas fora da rodada.

**Stores** (`state/`):

- `app.ts`: ajustes (persistidos), estado da UI (janela do teclado, oitava, painéis abertos), estado das teclas (`KeyVisual`, publicado por cada modo), dispositivos MIDI. `initApp()` monta tudo uma vez.
- `onboarding.ts`: progresso do tutorial, persistido a cada mudança, e a ponte entre o progresso e a `TutorialSession`.

**Persistência**: `platform/storage.ts` (`LocalStorageAdapter`) encapsula `localStorage` com try/catch: modo privado ou dados bloqueados nunca quebram a tela. Cada chave tem sufixo de versão:

| Chave | Conteúdo | Schema |
| --- | --- | --- |
| `keyz.settings.v1` | Ajustes do app | `settingsSchema` |
| `keyz.best.v1` | Melhor marca por nível do Desafio | `bestMarksSchema` |
| `keyz.drill.v1` | Ajustes personalizados do Desafio | `drillOverridesSchema` |
| `keyz.onboarding.v1` | Progresso do tutorial e das dicas | `onboardingSchema` |

Regras de validação:

- Dado inválido vira o padrão, sem quebrar a tela (`parseSettings`, `parseOnboarding`). Os campos válidos de um ajuste parcialmente corrompido são aproveitados.
- Os tipos vêm de `z.infer`; o schema é a única fonte.
- Se uma chave mudar de formato, cria-se nova versão (`.v2`) em vez de reinterpretar a antiga.

## Testes

| Camada | Ferramenta | Onde | O que cobre |
| --- | --- | --- | --- |
| Domínio | Vitest | `shared/test/` | Música, DSP (com fixtures WAV), exercícios, estrelas, onboarding |
| Aplicação | Vitest | `src/application/*.test.ts` | Sessões, InputHub, microfone, tutorial, com relógio e agendador falsos (`test-kit.ts`) |
| UI | Vitest | `src/ui/contrast.test.ts` | Contraste de tokens (74 pares, nos dois temas). Ainda não há testes de componente; o Testing Library está configurado (`src/test-setup.ts`) mas sem uso |
| Ponta a ponta | Playwright | `e2e/` | Modos, teclado, Desafio, Acordes, tutorial, tema claro, sem rolagem horizontal, CSP real |

Comandos: `bun run test` (Vitest, `shared` e app), `bun run e2e` (Playwright, desktop e celular simulado; sobe `vite preview` sozinho).

Paridade: a lógica de domínio foi portada do app Swift com os mesmos nomes de teste e a mesma entrada, com tolerância de 1 cent. O app Swift saiu do repositório; os testes em `shared/test/` passaram a ser a referência.

## Relatório de problema

Qualquer pessoa, sem conta no GitHub, reporta um problema ou ideia em Ajustes › Reportar um problema ou ideia.

- **Catálogo** (`shared/src/reports`): os tipos (bug, microfone, MIDI, acessibilidade, melhoria, dúvida), seus campos, o schema Zod do relatório e `formatIssue`, que monta título, corpo e rótulos. É a única fonte do formulário, da validação e da issue.
- **Porta** `ReportPort` (`application/ports.ts`), implementada por `platform/report.ts`, que faz `POST /api/reportar` e valida a resposta com Zod.
- **Tela** `features/reportar/ReportSheet.tsx`, carregada sob demanda. Mostra o contexto técnico que vai junto (versão, modo, entrada, tema, tela, navegador); nunca áudio nem notas.
- **Endpoint** `functions/api/reportar.ts` (Cloudflare Pages Function): só `POST` do mesmo site, corpo ≤ 16 KB, valida com o mesmo schema, recusa a isca (`website`), neutraliza menções (`@`) e comentários HTML, e chama a API de Issues do GitHub com o token guardado como segredo do Cloudflare. Erros do GitHub viram mensagem genérica.
- Os modelos de `.github/ISSUE_TEMPLATE` continuam existindo para quem abre issue direto no GitHub; manter os rótulos coerentes com o catálogo.

## Observabilidade

Detalhes, privacidade, cota e depuração em `docs/OBSERVABILIDADE.md`. Aqui, só a estrutura.

- **Schema e sanitização** (`shared/src/telemetry`): `clientEventSchema` (Zod, formato `{ event, outcome, attrs }`) e `sanitizeTelemetryText`. Pura, sem DOM.
- **Porta** `TelemetryPort` e `TelemetrySink` (`application/ports.ts`). Implementação em `application/telemetry.ts`: `ClientTelemetry` envia cada evento com fire and forget, até um teto de 5 por sessão. `SemTelemetria` entra quando há Sec-GPC ou Do Not Track (`platform/telemetry.ts`). O envio em si é `FetchSink`, com `keepalive`.
- **Fontes de falha** ficam onde o erro existe: microfone e MIDI recebem a porta no construtor (`platform/microphone.ts`, `platform/midi.ts`). Armazenamento inválido é registrado em `state/app.ts` e `state/onboarding.ts`.
- **Erros globais**: `installErrorHandlers` em `bootstrap.ts` (`error` e `unhandledrejection`). Erro de render: `ErrorBoundary` da biblioteca `react-error-boundary`, em `main.tsx`, com `onError` que registra e `fallback` com `ui/TelaDeRecuperacao.tsx`.
- **Servidor**: `functions/_lib/log.ts` (`registrar`, uma linha JSON por chamada no `console`, sem amostragem; a versão vem do `package.json`). Endpoints `functions/api/reportar.ts` (`report.submit`) e `functions/api/eventos.ts` (um evento do navegador por requisição).
- **Nomes fixos**: eventos, desfechos e motivos de recusa são constantes em `shared/src/telemetry` (`EVENTO`, `OUTCOME`, `MOTIVO`, `ORIGEM_ERRO`, `FONTE_ENTRADA`, `ETAPA_ENTRADA`). O schema do navegador sai dessas constantes.
- Não há destino persistente: tudo vai para o tail do Pages.

## Build e deploy

`bun run build` roda `tsc --noEmit` e `vite build`. O CI (`.github/workflows/ci.yml`) roda auditoria, testes, build e e2e em todo PR. Deploy automático só a partir da `main`, por Release (release-please + Cloudflare Pages). Detalhes em `docs/FLUXO.md` e `docs/PIPELINE.md`.

`wrangler pages deploy` publica também a pasta `functions/`, sem passo extra no workflow.

O JS inicial deve ficar em até 200 KB gzip. Os modos fora do Livre e o changelog são carregados sob demanda (`React.lazy`).

## Cabeçalhos e segurança

CSP restritiva, `Permissions-Policy` com microfone e MIDI só na própria origem. Detalhes e verificação em `docs/SEGURANCA.md`. `e2e/csp.spec.ts` aplica os cabeçalhos reais de `public/_headers` e falha em qualquer violação.
