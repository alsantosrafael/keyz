# Keyz Web — Spec da migração

2026-11-01 · @Rafa

## Estado da implementação

Atualizado em 2026-11-01. Comandos: `bun install --frozen-lockfile`, `bun run test` (Vitest em `shared` e no app), `bun run build`, `bun run e2e` (Playwright).

| Fase | Estado | Observações |
| --- | --- | --- |
| 0. Spike | Parcial | Pipeline completo (AudioWorklet de 10 ms → Web Worker → `MicPipeline`). YIN próprio, sem pitchy. **Falta** medir a latência p95 contra o Swift |
| 1. Shared | Concluída | Os 55 testes Swift portados com os mesmos nomes (67 testes em `shared/test`, contando os da SPEC). O Swift usa Swift Testing, não XCTest |
| 2. Platform e application | Concluída | `InputHub`, `MicController`, sessões e portas, com testes de unidade (relógio e agendador falsos). **Falta** validar com hardware MIDI real |
| 3. UI base | Concluída | Tokens (escuro e claro), shell, `ModeBar`, `PianoKeyboard` (multitoque, glissando, faixa de navegação), `StaffCard`, `NoteReadout`, `Meter`, `TimeRing`. **Falta** a galeria de componentes e as capturas visuais por estado |
| 4. Modos | Concluída | Livre, Acordes, Desafio e Entrada |
| 5. Encantamento | Concluída, sem samples | Fluxo do Desafio do Lobby ao Resumo, `NoteTrail`, sons de jogo, tátil e movimento reduzido |
| 6. Hardening | Parcial | CI de build e testes, CSP e `_headers` prontos, JS inicial ~141 KB gzip (orçamento: 200 KB), validador de contraste em `src/ui/contrast.test.ts`. **Faltam** axe no Playwright, PWA, a matriz de navegadores em CI |

Testes: `shared/test` (domínio e DSP), `src/application` (sessões, hub, microfone), `src/ui/contrast.test.ts` (74 pares, dois temas) e `e2e/` (desktop e iPhone 13 simulado: latência da tecla < 16 ms, quatro modos, Desafio do Lobby ao acerto, tema claro, sem rolagem horizontal).

## Contexto e objetivos

Migrar o Keyz, app SwiftUI para iPhone, iPad e Mac, para uma aplicação web que roda no navegador. A migração mantém as funcionalidades e as regras atuais e redesenha a experiência: o visual segue a inspiração do GarageBand, focado em piano (ver Direção de design).

- Paridade funcional com os quatro modos: Acordes, Desafio, Livre e Entrada.
- Lógica de domínio única, validada por paridade com os 55 testes Swift.
- Arquitetura em camadas, com o código compartilhado em `shared/`.
- Experiência fluida: resposta visual imediata, animações com propósito, som e feedback.
- Desafio com sensação de jogo (contagem, tempo, sequência, estrelas) e Livre com passagem de nota agradável e clara, ambos sobre um mesmo design system.

## Escopo

| Item | Dentro da v1 | Fora da v1 |
| --- | --- | --- |
| Modos Acordes, Desafio, Livre, Entrada | Sim |  |
| Microfone (YIN e chroma) | Sim |  |
| MIDI (USB e Bluetooth) | Sim, em navegadores Chromium | Safari e Firefox sem MIDI |
| Teclado na tela e do computador | Sim |  |
| Ajustes salvos no navegador | Sim |  |
| PWA instalável | Fase 6, opcional |  |
| Contas e sincronização na nuvem |  | Sim |
| Empacotamento nativo (Capacitor ou similar) |  | Fora da v1; revisitar se houver loja |
| Idiomas além do português |  | Sim |

## Stack e justificativas

Stack leve, sem servidor próprio. A aplicação é uma SPA estática, publicada na Cloudflare.

| Camada | Escolha | Motivo |
| --- | --- | --- |
| Runtime e gerenciador de pacotes | Bun | Instalação rápida, workspaces nativos e um único binário para dev, teste e build |
| Build e framework | Vite + React 19 + TypeScript | Leve, sem servidor, e é o alvo padrão do shadcn/ui |
| Componentes | Controles próprios sobre elementos nativos (`<dialog>`, `input`, `button`) | Decisão da implementação: Radix/shadcn não entraram na v1 para segurar o JS inicial; foco preso, Esc e `aria-*` vêm do HTML nativo. Reavaliar se surgirem menus e popovers |
| Estilo | Tailwind CSS v4 | Tokens em variáveis CSS, base do design system |
| Validação | Zod | Schemas de ajustes, persistência e mensagens externas (MIDI) |
| Estado | Zustand | Só estado de interface e orquestração; o domínio fica fora |
| Roteamento | React Router | Uma rota por modo, com links diretos |
| Partitura | SVG próprio (`StaffCard`) sobre o `StaffPlacement` do domínio | Decisão da implementação: pauta dupla, linhas suplementares e acidentes bastam para a v1 e não custam bytes. Claves usam glifos Unicode (`𝄞 𝄢`); VexFlow/Bravura ficam para partituras mais ricas |
| Teoria musical auxiliar | Não usado | O domínio (`Chord`, `ChordRecognizer`) já cobre os acordes maiores e menores da v1 |
| Som | Web Audio direto (`platform/audio`, `feedback`) | Decisão da implementação: osciladores e envelopes curtos no mesmo `AudioContext`, sem Tone.js. O tique da contagem e os sons de acerto, erro e estrela usam esse caminho |
| Piano | Síntese aditiva (`SynthPiano`) na v1; smplr como evolução | A porta `PianoPort` isola a escolha. Samples seguem em aberto (ver Questões) |
| Detecção de altura | YIN portado; pitchy como benchmark | Decisão na fase de spike |
| FFT | FFT radix-2 própria em `shared/dsp/fft.ts` | `shared` não importa nada de fora; a porta reproduz o Swift quadro a quadro |
| Animação | Motion | Transições com mola, com suporte a movimento reduzido |
| Ícones | lucide-react | Substitui os SF Symbols; traço único de 1,75 px |
| Testes | Vitest, Testing Library, Playwright | Unidade, componentes e ponta a ponta |
| Hospedagem | Cloudflare Pages | Deploy estático com build gerado pelo CI |

## Arquitetura em camadas

Cada camada conhece só as que estão abaixo dela. As dependências apontam para dentro, para o domínio.

1. **shared**: domínio puro em TypeScript, sem DOM, React ou Web Audio. Inclui música, DSP, exercícios e schemas Zod.
2. **platform**: adaptadores do navegador (microfone, MIDI, armazenamento, worker de análise). Implementa as portas definidas em application.
3. **application**: casos de uso e sessões (Acordes, Desafio, Livre) e o InputHub, que une microfone, MIDI e teclado em eventos de nota.
4. **state**: stores Zustand finas, que expõem application para a UI. Sem regra de negócio.
5. **features e ui**: telas por modo, componentes shadcn e componentes musicais (pauta e teclado em SVG).

Regras:

- `shared` não importa nada de fora dele.
- `platform` só implementa portas de `application`; nunca chama a UI.
- `features` não importa `platform` diretamente.
- Entre camadas, a comunicação usa eventos tipados, validados com Zod nas bordas.
- A análise de áudio roda em um Web Worker; a thread principal só recebe resultados.

## Estrutura de pastas

O app web fica na raiz do repositório (Vite, `src/`, `index.html`, `package.json` do app). `shared/` é um módulo ao lado dele, ligado por Bun workspaces. O app Swift continua isolado em `keyz-mac/`, com as suas particularidades, e fica intocado até a paridade.

```text
keyz/
├─ package.json              app web (Vite + React); workspaces: ["shared"]
├─ bun.lock                  lockfile versionado
├─ index.html, vite.config.ts, tsconfig.json
├─ src/                      app web
│  ├─ platform/              audio, midi, storage, worker de análise
│  ├─ application/           InputHub, sessões, portas
│  ├─ state/                 stores Zustand
│  ├─ features/              acordes, desafio, livre, entrada
│  └─ ui/                    shadcn, tokens (theme.css), componentes do instrumento
│                            (PianoKeyboard, StaffCard, NoteReadout, NoteTrail, Meter, TimeRing)
├─ e2e/                      Playwright
├─ shared/                   @keyz/shared, TypeScript puro
│  ├─ src/music/             Note, PitchClass, Chord, StaffPlacement
│  ├─ src/dsp/               YIN, chroma, RingFilter, NoteStabilizer
│  ├─ src/drills/            NoteDrill, ChordEvaluator, DrillConfig
│  ├─ src/schemas/           Zod: ajustes, exercícios, MIDI
│  └─ test/                  paridade com os testes Swift e fixtures de áudio
├─ docs/SPEC.md              esta spec
├─ CLAUDE.md                 instruções para o Claude Code
├─ .github/workflows/ci.yml  build em cada push e pull request
└─ keyz-mac/                 app Swift atual (KeyzCore + Keyz + Keyz.xcodeproj), sem alterações
```

O app importa o domínio como `@keyz/shared`. Os testes de `shared` rodam dentro do módulo; os do app ficam ao lado do código, em `src/`.

**Ferramentas e CI**

- Comandos: `bun install --frozen-lockfile`, `bun run build`, `bun test`.
- O CI (GitHub Actions) faz só o build: instala com `setup-bun`, roda `bun run build` e publica `dist` como artefato.
- Publicação automatizada: o workflow `release.yml` usa o release-please (SemVer pelos Conventional Commits). Mergear o PR de release cria a tag e a Release e dispara o deploy na Cloudflare Pages (`keyz-9ir`). Passo a passo e segredos no README. `bun run deploy` fica só como saída de emergência.
- Headers de segurança e o fallback do SPA vão em `public/_headers` e `public/_redirects` e seguem para o `dist/`.
- O build falha se o lockfile estiver desatualizado, o que mantém as dependências reprodutíveis.

## Pipeline de áudio e MIDI

O caminho do microfone replica o `MicrophoneInput.swift`: análise a cada 10 ms, estabilização e calibração de ruído.

1. `getUserMedia` com `echoCancellation`, `noiseSuppression` e `autoGainControl` desligados. Esses filtros distorcem o sinal de piano.
2. Um AudioWorklet recebe blocos de 128 amostras, junta em janelas de 10 ms e envia `Float32Array` transferível a um Web Worker.
3. O worker roda YIN e chroma (`shared/dsp`) e devolve frequência, confiança, nota estável e ataques.
4. O InputHub emite `NoteEvent` na thread principal, com a mesma semântica do Swift: 3 quadros para nota, 5 para acorde e 8 entre ataques.
5. Sensibilidade mapeia para SNR com a fórmula do Swift, `12 - 8 * s`.

Outras entradas:

- **MIDI**: `navigator.requestMIDIAccess({ sysex: false })`, com `onstatechange` para conexão a quente. Cada mensagem passa por Zod antes de chegar à aplicação.
- **Teclado**: `keydown` e `keyup`, com o modo latch dos ajustes.
- **Restrições**: o `AudioContext` só inicia após um gesto do usuário. O microfone exige HTTPS.

Um único `AudioContext`, dono do `platform/audio`, é compartilhado com Tone.js e smplr.

Meta de latência: captura até evento em p95 ≤ 80 ms, a validar contra a medição do app Swift no spike.

## Estado, validação e persistência

O domínio roda sem React, como classes e funções puras. O Zustand guarda snapshots para a interface e não contém regras.

- **Zod em ****`shared/schemas`**: os schemas são a única fonte dos tipos (`z.infer`).
- **Validação nas bordas**: ajustes lidos do `localStorage`, mensagens MIDI e arquivos de exercício. Dado inválido cai no padrão, sem quebrar a tela.
- **Versão de persistência**: cada chave tem sufixo de versão, como `keyz.settings.v1`.
- **Sem react-hook-form**: os ajustes são controles simples (slider, switch, select). Adicionar só se os formulários crescerem.

Chaves migradas do `@AppStorage` e do `UserDefaults` do Swift:

| Chave Swift | Chave web | Tipo |
| --- | --- | --- |
| `latchKeys` | `keyz.settings.v1.latchKeys` | boolean |
| `microphoneSensitivity` | `keyz.settings.v1.microphoneSensitivity` | número, 0 a 1 |
| chave de ativação do microfone (ver `NoteInputHub.swift`) | `keyz.settings.v1.microphoneEnabled` | boolean |

## Direção de design

A referência é o GarageBand da Apple, reduzida ao piano. Três ideias vêm de lá e guiam todas as telas:

1. **O instrumento é o herói.** O teclado fica sempre visível, preso à base da tela, como o teclado do GarageBand. Os modos mudam o que está acima dele; o teclado não muda de lugar.
2. **Estúdio escuro, cor por função.** Fundo escuro e quieto, para que as cores do feedback se destaquem. Cada modo tem uma cor de faixa, como as faixas coloridas do GarageBand.
3. **Controles que parecem físicos.** Teclas com profundidade, botões grandes, display com números de leitura "de equipamento". Nada de formulário no meio da prática.

O Keyz deixa de copiar os padrões do SwiftUI e passa a ter identidade própria. Isso substitui a meta de paridade visual com o app Swift: a paridade que fica é a **funcional** (regras, modos, entradas). A paridade visual deixa de ser critério de aceite.

### Princípios que valem para qualquer modo

| # | Princípio | Regra verificável |
| --- | --- | --- |
| 1 | **Tocar é instantâneo** | A tecla muda de estado no `pointerdown` ou no evento MIDI, no mesmo quadro (≤ 16 ms), sem esperar `click`, som ou React |
| 2 | **Um foco por vez** | Cada estado de tela tem um único elemento dominante (a nota-alvo, a nota tocada, o resumo). O resto fica em segundo plano |
| 3 | **Todo evento tem resposta em 3 canais** | Visual (tecla e pauta), sonoro (nota do piano) e, quando disponível, tátil. Nenhum canal é obrigatório para entender o resultado |
| 4 | **Estado estável, sem tremor** | Leituras vindas do microfone passam por histerese antes de aparecer. Texto numérico usa `tabular-nums` e largura fixa; nada pula de lugar |
| 5 | **Sem punição, com recuperação** | Erro mostra a resposta certa e segue em frente. Nenhum diálogo bloqueia a prática |
| 6 | **Movimento significa causa e efeito** | Toda animação responde a uma ação do usuário ou a uma mudança de estado do jogo. Sem animação decorativa em repouso |
| 7 | **Ninguém depende de cor, som ou movimento** | Cor sempre acompanha ícone ou texto; som tem equivalente visual; movimento tem versão reduzida |
| 8 | **Entrada igual em qualquer fonte** | Mouse, toque, teclado do computador, MIDI e microfone produzem o mesmo estado visual na tecla. O microfone só difere por ser mais lento, e a interface mostra isso (ver "Estados de entrada") |

## Design system

Dark-first, com tema claro completo. Os tokens são variáveis CSS no Tailwind v4 (`@theme`), em três camadas: **primitivos** (valores brutos), **semânticos** (papel na interface) e **de componente**. Componentes só usam tokens semânticos ou de componente, nunca hexadecimal.

### Cor

Superfícies, de trás para frente. Cada nível separa o painel do anterior por luminosidade e por uma borda fina de 1 px, não por sombra pesada.

| Token | Escuro | Claro | Uso |
| --- | --- | --- | --- |
| `--surface-stage` | `#0B0C10` | `#F4F5F8` | fundo da tela |
| `--surface-panel` | `#14161C` | `#FFFFFF` | painéis, pauta, cartões |
| `--surface-raised` | `#1D2029` | `#FFFFFF` + borda | controles, fichas, popovers |
| `--surface-inset` | `#07080B` | `#E6E8EE` | display "afundado" (leituras, medidores) |
| `--line` | `rgba(255,255,255,.08)` | `rgba(15,20,35,.12)` | bordas e divisores |
| `--text` | `#F2F4F8` | `#15171C` | texto principal |
| `--text-muted` | `#A9B0C2` | `#505769` | texto secundário |
| `--text-faint` | `#8A92A6` | `#5F667A` | legendas (use só em 14 px ou mais) |

Cor de faixa por modo. É a "cor do instrumento" do GarageBand: aparece no ícone da aba, no destaque das teclas pressionadas, no foco e nos botões primários do modo.

| Modo | Token | Escuro | Claro | Texto sobre a cor |
| --- | --- | --- | --- | --- |
| Acordes | `--track-chords` | `#B9A2FF` | `#6D4AE0` | escuro `#150D33` / claro `#FFFFFF` |
| Desafio | `--track-drill` | `#FF9F0A` | `#A65300` | escuro `#1A1100` / claro `#FFFFFF` |
| Livre | `--track-free` | `#2DD4C4` | `#007A70` | escuro `#00201D` / claro `#FFFFFF` |
| Entrada | `--track-input` | `#5AA9FF` | `#1F63C6` | escuro `#06182E` / claro `#FFFFFF` |

Cores de resultado. Sempre acompanhadas de ícone e texto.

| Papel | Token | Escuro | Claro | Ícone |
| --- | --- | --- | --- | --- |
| Acerto | `--success` | `#30D158` | `#1B7F37` | `check` |
| Erro | `--failure` | `#FF6961` | `#C4261D` | `x` |
| Tempo / atenção | `--warning` | `#FFD60A` | `#8A6A00` | `clock` |

Contrastes medidos: todo texto e ícone significativo fica em 4,5:1 ou mais sobre `--surface-stage`, `--surface-panel` e `--surface-raised`, nos dois temas (`--text-faint` no escuro: 5,2:1 no pior caso). Antes de cada release, rodar o validador de pares no CI. As cores de faixa e de resultado como fundo de botão usam o texto da tabela, com 6,6:1 ou mais no escuro.

Brilho (`--glow-*`) é a cor da faixa ou do resultado a 35% de opacidade em `box-shadow`. Só aparece em teclas ativas, no anel do Desafio e no medidor; nunca em texto.

### Tipografia

Fonte do sistema, como o resto do ecossistema Apple: `-apple-system, system-ui, sans-serif`, sem baixar fontes. Em Apple usa SF Pro. Para os números de leitura usa `ui-rounded` com `font-variant-numeric: tabular-nums`.

| Papel | Tamanho / peso | Uso |
| --- | --- | --- |
| `display` | 96 / 700, rounded (64 em telas < 480 px) | nome da nota-alvo e da nota tocada |
| `title` | 28 / 700 | título de tela e do resumo |
| `headline` | 20 / 600 | rótulos de seção, nome da dificuldade |
| `body` | 16 / 400 | texto corrido, ajustes |
| `label` | 14 / 500 | botões, abas, fichas |
| `caption` | 12 / 500, caixa alta com tracking leve | legenda de display ("CENTS", "TEMPO") |
| `readout` | 20 / 600 mono-tabular | tempo de resposta, Hz, cents |

Regras: o corpo nunca fica abaixo de 16 px; o texto cresce com o zoom do navegador sem quebrar o layout; nomes de nota usam fonte rounded e os sinais ♯ e ♭ vêm da mesma fonte, nunca de imagem.

### Espaço, raio, elevação e tamanhos

- **Espaço**: escala de 4 px (`4 8 12 16 24 32 48`). Margens laterais: 16 px no celular, 24 px no tablet, 32 px no desktop.
- **Raio**: `--radius-control` 12 px, `--radius-card` 16 px, `--radius-key` 0 0 6 px 6 px, `--radius-pill` 999 px.
- **Elevação**: três níveis (`flat`, `raised`, `overlay`). O teclado e a pauta ficam em `flat`; só diálogos e popovers usam `overlay`.
- **Alvos de toque**: mínimo de 44 × 44 px em qualquer controle. A tecla branca tem no mínimo 44 px de largura (ver "Teclado").
- **Largura de leitura**: o conteúdo central fica em até 720 px; o teclado ocupa a largura toda.
- **Camadas (z-index)**: `0` conteúdo, `10` teclado, `20` barra superior, `40` popover, `100` diálogo, `1000` aviso (Sonner).

### Movimento

Mola para o que responde a gesto ou muda de lugar; curva curta para estado. Tudo animável usa só `transform` e `opacity`.

| Token | Valor | Uso |
| --- | --- | --- |
| `--motion-instant` | 0 ms | tecla pressionada (sem transição na entrada) |
| `--motion-fast` | 120 ms, `ease-out` | soltar tecla, hover, foco |
| `--motion-base` | 220 ms, `ease-out` | troca de conteúdo, fichas, medidor |
| `--motion-slow` | 400 ms, `ease-in-out` | transição entre fases do jogo |
| `--spring-snappy` | rigidez 500, amortecimento 32 | acerto, nota que entra na pauta |
| `--spring-soft` | rigidez 220, amortecimento 24 | cartões, resumo, contagem |

Regras: saída 30% mais rápida que a entrada; toda animação é interrompível (um novo toque cancela e vai direto ao estado final); nunca bloqueia a entrada; escalonar listas em 40 ms por item. Com `prefers-reduced-motion`: molas viram `fade` de 120 ms, o tremor de erro some, o anel de tempo muda de cor em vez de pulsar, e a contagem 3-2-1 vira texto estático.

### Componentes do instrumento

Componentes próprios em SVG ou CSS. Cada um tem estados definidos e é testado em claro e escuro.

**`PianoKeyboard`** (a base de tudo)

- Teclas brancas em marfim com gradiente vertical sutil e sombra interna no topo; pretas quase pretas, com brilho fino na borda de cima. Aparência de tecla de verdade, sem fotorrealismo.
- Estados da tecla: `idle`, `hover` (só ponteiro fino), `pressed`, `target` (nota a tocar), `correct`, `wrong`, `ghost` (resposta mostrada depois do erro), `chord-member`, `disabled`.
- `pressed`: afunda 2 px (`translateY`), pinta com a cor da faixa do modo e acende o brilho. Entra sem transição; sai em `--motion-fast`.
- `target`: anel de cor da faixa que pulsa devagar (1,2 s). É o "alvo" do jogo. Com movimento reduzido, fica um contorno fixo mais grosso.
- Nome da nota impresso na tecla é opcional (ajuste "Mostrar nomes"), mas nas teclas `target`, `correct` e `wrong` o nome aparece sempre.
- **Faixa de navegação** no topo do teclado, como a do GarageBand: miniatura das 88 teclas com uma janela arrastável que mostra a região visível. Também há setas de oitava (`‹ ›`) com 44 px.
- **Tamanho**: no celular, a janela visível mostra 8 a 10 teclas brancas por padrão, com tecla branca ≥ 44 px; o ajuste "Zoom do teclado" vai de 7 a 21 teclas brancas. Altura mínima de 160 px no celular em retrato e 220 px nos demais; em paisagem no celular, o teclado ocupa 45% da altura.
- **Entrada por ponteiro**: `pointerdown`, `pointermove` e `pointerup` com multitoque. Deslizar o dedo (glissando) toca as teclas por onde passa. As áreas de toque das teclas pretas se estendem 6 px para fora da forma visual, para não exigir precisão.
- **Teclado do computador**: mapeamento em duas fileiras (A–L brancas, W E T Y U O P pretas), com a letra impressa na tecla quando o ajuste "Mostrar atalhos" está ligado. Z e X mudam de oitava.
- **Acessibilidade**: cada tecla é um botão com `aria-label` ("Dó 4"), `aria-pressed` e foco visível de 3 px. O teclado do navegador navega com setas; Enter e Espaço tocam. O som da tecla não depende de áudio visual.

**`StaffCard`** (pauta)

- Cartão `--surface-panel` com pauta dupla (VexFlow). Nota-alvo em `--text`; nota tocada na cor da faixa; correta em `--success`; errada em `--failure`. Cada nota colorida leva um rótulo de texto ("certa", "tocada").
- Altura fixa por modo (nada de salto de layout quando a nota muda de região).
- Entrada de nota: cabeça da nota desliza e assenta com `--spring-snappy`, em vez de aparecer de uma vez.

**`NoteReadout`** (display de nota)

- Painel `--surface-inset`, como um display de equipamento. Nome da nota em `display`; sublinha em `readout` (oitava, Hz).
- Largura mínima reservada para três caracteres e um sinal (`D♯`), para não deslocar nada ao trocar de nota.
- Trocar de nota é um `crossfade` de 120 ms com leve deslocamento vertical de 6 px, na direção do movimento (nota mais aguda sobe).

**`Meter`** (medidores)

- Barra em cápsula ou arco, sempre em `--surface-inset`, com marcações discretas. Atualiza por variável CSS via `requestAnimationFrame`, sem re-render do React.
- Variantes: nível do microfone, afinação (arco em cents), tempo.

**`TimeRing`**: anel SVG de tempo (ver Desafio). **`Chip`**: ficha de histórico. **`Button`**: três variantes (primário com a cor da faixa, secundário em `--surface-raised`, fantasma), sempre com 44 px de altura e ícone `lucide` quando ajuda.

**`ModeBar`**: navegação entre os quatro modos. No celular, barra inferior com ícone e rótulo, acima do teclado; no tablet e no desktop, abas no topo. A aba ativa mostra a cor da faixa, com ícone preenchido e sublinhado, nunca só cor. Troca de modo preserva o teclado e a posição dele.

Ícones: `lucide-react`, traço de 1,75 px, tamanhos 16, 20 e 24. Nomes finais conferidos na versão instalada.

| Uso | Ícone Lucide |
| --- | --- |
| Acordes | `music-2` |
| Desafio | `timer` ou `target` |
| Livre | `audio-waveform` |
| Entrada | `plug` ou `cable` |
| Ajustes | `settings` |
| Microfone | `mic` |

### Shell e layout

```text
┌ celular (retrato) ───────────┐   ┌ tablet / desktop ───────────────────────────┐
│ Barra: título · entrada · ⚙  │   │ Barra: Keyz · [Acordes|Desafio|Livre|Entrada]│
│                              │   │                  · entrada · ⚙              │
│  Área do modo                │   │  Área do modo (centralizada, ≤ 720 px)      │
│  (pauta, display, HUD)       │   │                                             │
│                              │   ├─────────────────────────────────────────────┤
├──────────────────────────────┤   │ Faixa de navegação do teclado               │
│ Faixa de navegação           │   │ PianoKeyboard (largura total)               │
│ PianoKeyboard                │   └─────────────────────────────────────────────┘
├──────────────────────────────┤
│ ModeBar                      │
└──────────────────────────────┘
```

- A área do modo rola; o teclado e a `ModeBar` não. A área do modo reserva espaço inferior igual à altura do teclado, para nada ficar escondido.
- Respeitar `env(safe-area-inset-*)` (iPhone com PWA ou tela cheia).
- Em paisagem no celular, a pauta e o display ficam lado a lado acima do teclado.
- Pontos de quebra: 375, 768, 1024, 1440 px. Sem rolagem horizontal em nenhum deles.

### Estados de entrada (todos os modos)

A barra superior mostra uma **pílula de entrada** com o ícone da fonte ativa e um ponto de estado.

| Estado | Pílula | Comportamento |
| --- | --- | --- |
| Teclado na tela | `Teclado` (sempre ativa) | resposta imediata |
| MIDI conectado | `MIDI · nome do aparelho` | resposta imediata; vira o padrão |
| Microfone ouvindo | `Microfone` + ponto pulsando com o nível | resposta com ~80 ms de atraso; a tecla acende como `pressed` mais suave |
| Microfone pedindo permissão | `Ativar microfone` (botão) | explica o motivo antes de pedir; o áudio nunca sai do aparelho |
| Sem permissão ou sem suporte | `Microfone desligado` + causa | oferece teclado na tela; nenhum erro em vermelho |
| Ruído alto | aviso `Ambiente barulhento` na pílula | sugere ajustar a sensibilidade, sem bloquear |

## Modo Desafio: experiência de jogo

O Desafio é um jogo de reflexo e leitura de notas. O jogador entra, vê o nível, joga rodadas rápidas e sai com uma sensação de progresso. A regra de ouro: **o ciclo nota → toque → resposta dura menos de 3 segundos e nunca tem tela parada esperando o usuário**.

### Fluxo de telas

```text
Lobby ──▶ Contagem 3·2·1 ──▶ Rodada ◀─┐
  ▲                           │       │ próxima nota
  │                      Resultado ───┘
  │                           │ fim das notas
  └──── Jogar de novo ◀── Resumo
```

| Fase | O que o jogador vê | Foco dominante |
| --- | --- | --- |
| **Lobby** | Três cartões de nível (Fácil, Médio, Avançado), cada um com sua cor, ícone de dificuldade e a melhor marca. Botão grande `Jogar`. Ajustes avançados num painel recolhido ("Personalizar") | o cartão do nível escolhido |
| **Contagem** | `3`, `2`, `1`, `Já!` em `display`, com tique do metrônomo. O teclado já está ativo, mas sem alvo | o número |
| **Rodada** | Nota-alvo, anel de tempo, HUD, teclado com o alvo marcado | a nota-alvo |
| **Resultado** | Acerto: anel fecha, tecla brilha. Erro ou tempo: resposta certa aparece na pauta e no teclado | a resposta certa |
| **Resumo** | Estrelas, três marcos revelados em sequência, botões | as estrelas |

Lobby: o nível guarda a última configuração usada. `Jogar` está sempre a um toque. Personalizar abre um painel lateral (celular: folha de baixo) com os mesmos ajustes do app Swift, agrupados em Tempo, Notas, Exibição e Sessão.

### A rodada

- **Nota-alvo**: nome em `display` e, conforme o ajuste "Mostrar nota como", a pauta. A nota entra com `--spring-snappy`; a anterior sai deslizando para o lado em 160 ms.
- **Anel de tempo (`TimeRing`)**: envolve a nota e esvazia de forma contínua (linear, pois é progresso constante). Cor: faixa do Desafio até 2/3 do tempo, depois `--warning`; nos últimos 3 s pulsa devagar e o tique do metrônomo acelera. O tempo restante em segundos aparece em `readout`, dentro do anel. O anel anima por `stroke-dashoffset` em CSS, fora do React.
- **Teclado**: a tecla-alvo **não** fica marcada por padrão no Médio e no Avançado, porque isso entregaria a resposta. No Fácil, o ajuste "Dica no teclado" começa ligado e mostra o alvo como `target`. O jogador pode ligar ou desligar nos três níveis.
- **HUD**, uma linha acima da nota, sem texto longo:
  - Progresso: pontos pequenos ou `7/20`, com o ponto atual destacado.
  - Sequência (combo): ícone `flame` e o número. Aumenta com um pulso quando acerta; ao errar, volta a 0 sem animação agressiva.
  - Contadores de acerto, erro e tempo esgotado ficam só no resumo, para não distrair.
- **Pausa**: Espaço, `Esc` ou o botão `pause` congelam o anel e escurecem a área com um véu (`blur` leve só no fundo). Retomar faz uma contagem curta de 1 s.

### Resultado de cada nota

O resultado aparece no mesmo lugar da nota-alvo, sem trocar de tela, e dura de 700 ms (padrão automático) até o toque do usuário (manual).

| Resultado | Visual | Som | Tátil | Texto |
| --- | --- | --- | --- | --- |
| Acerto | O anel fecha e vira `--success`; a tecla brilha; a nota na pauta pulsa uma vez; "+1" sobe e some; o tempo de resposta aparece ("0,8 s") | Nota tocada pelo piano + estalo agudo curto | `vibrate(10)` | "Acertou" e ícone `check` |
| Faixa de reflexo | Acerto em menos de 1 s mostra "Rápido" em dourado; entre 1 e 2,5 s, nada; depois disso, nenhum rótulo | | | |
| Erro | A nota tocada fica `--failure` na tecla e na pauta; a resposta certa aparece como `ghost` em `--success`; o painel dá um tremor de 2 px (desligável) | Tom grave curto e suave | `vibrate([20,40,20])` | "Era Ré. Você tocou Mi" e ícone `x` |
| Tempo esgotado | O anel esvazia e vira `--warning`; a resposta certa aparece como `ghost` | Tom neutro | nenhum | "Tempo esgotado. Era Ré" e ícone `clock` |

Regras: erro e tempo nunca usam tela vermelha cheia; o resultado fica visível o tempo suficiente para ler a resposta certa (mínimo de 1,2 s no erro, mesmo no automático, a menos que o jogador toque ou aperte Enter para pular); o jogador pode pular o resultado a qualquer momento; a próxima nota nunca entra antes de o resultado terminar.

### Sequência, estrelas e marcos

Esta proposta substitui a regra anterior "sem pontuação" por um sistema de progresso sem placar numérico (a confirmar nas questões em aberto):

- **Sequência**: acertos seguidos. Marcos em 5, 10, 20: o HUD ganha um destaque de faixa e um som de acento.
- **Estrelas (1 a 3)** ao fim da sessão, por acerto e velocidade: 1 estrela com 60% ou mais de acerto; 2 estrelas com 80% ou mais; 3 estrelas com 90% ou mais e tempo médio abaixo de metade do tempo da nota. As regras ficam numa função pura em `shared/drills` e são testáveis.
- **Melhor marca por nível** (estrelas e maior sequência), guardada no navegador, aparece no Lobby.
- **Sem vidas, sem game over.** A sessão sempre vai até o fim ou até o jogador parar.

### Resumo da sessão

Revelado em etapas de 250 ms, para dar a sensação de "recompensa":

1. Estrelas aparecem uma a uma, com mola e um tom ascendente a cada estrela.
2. Contagem do percentual de acerto de 0 até o valor.
3. Três marcos como fichas: "Maior sequência", "Tempo médio", "Notas mais difíceis" (as duas notas com mais erros, mostradas na pauta).
4. Botões: `Jogar de novo` (primário), `Mudar nível`, e `Treinar notas difíceis` (cria uma sessão curta só com as notas que erraram).

Com movimento reduzido ou "Pular animações", o resumo aparece completo de uma vez.

### Som do jogo

- Metrônomo e tique da contagem em Tone.js, no mesmo `AudioContext`.
- Sons de acerto, erro e estrela, curtos (≤ 300 ms) e com volume próprio. **Ligados por padrão no Desafio**, desligados nos outros modos. O jogador desliga num botão `volume` sempre visível no HUD.
- A nota tocada vem do piano (smplr), nunca é substituída pelo som de feedback.
- Nenhum som toca antes do primeiro gesto do usuário.

### Dificuldade percebida

Os níveis também mudam a sensação, não só os números:

| Nível | Tempo | Dica no teclado | Pausa automática | Tom |
| --- | --- | --- | --- | --- |
| Fácil | 10 s | ligada | 1,5 s | calmo, nome da nota |
| Médio | 6 s | desligada | 1 s | equilibrado, nome e pauta |
| Avançado | 3 s | desligada | 0,7 s | rápido, só pauta |

Os valores iniciais vêm do `DrillConfig.preset` do Swift; a tabela mostra só os pontos que a interface destaca. Qualquer ajuste feito pelo jogador vale para a sessão e continua no "Personalizar".

## Modo Livre: passagem de nota

O Livre é a mesa de som: tocar sem objetivo, ver e ouvir o que o app entendeu. O critério de sucesso é a **passagem de nota** agradável: quando o jogador toca uma sequência (escala, melodia, acordes), a interface acompanha sem tremer, sem atrasar e sem apagar a informação cedo demais.

### Anatomia da tela

De cima para baixo:

1. **Trilha de notas (`NoteTrail`)**: faixa horizontal em estilo rolo de piano. Cada nota tocada vira um bloco na altura da sua nota, que nasce na borda direita e se desloca devagar para a esquerda (≈ 120 px/s). O comprimento do bloco acompanha quanto tempo a tecla ficou pressionada. Blocos antigos ficam translúcidos até sumir em ~8 s. Mostra a passagem das notas como melodia, sem esforço de leitura.
2. **Display da nota (`NoteReadout`)**: o nome da nota atual em `display`; abaixo, oitava e Hz. Para acordes, o nome do acorde e a inversão.
3. **Pauta (`StaffCard`)**: a nota atual ou o acorde, na cor da faixa do Livre.
4. **Afinação** (só com microfone): arco em cents, com a faixa de ±10 cents em `--success`.
5. **Fichas de histórico** acima do teclado: últimas 12 notas ou acordes, mais recente à direita.
6. Teclado.

### Regras de leitura estável

Estas regras definem o "agradável":

| Situação | Comportamento |
| --- | --- |
| Nota nova | Nome troca por `crossfade` de 120 ms; pauta e tecla respondem no mesmo quadro |
| Soltar a tecla | O display **mantém** a última nota, em tom mais apagado (`--text-muted`), por tempo indefinido; só volta ao estado vazio ao pressionar "Limpar" ou trocar de modo |
| Notas em sequência rápida | Cada toque substitui a nota anterior sem esperar a animação da anterior terminar (animações são interrompíveis) |
| Microfone, nota instável | Histerese: a leitura só muda quando a nova nota se mantém por 3 quadros; vibrato de até ±30 cents não muda o nome da nota |
| Microfone, nota perdida | Enquanto a confiança cai, a leitura esmaece em 200 ms em vez de piscar para vazio |
| Mais de uma nota | Se 2 ou mais teclas estão pressionadas, o display muda para acorde; se o acorde não for reconhecido, mostra as notas em ordem, sem mensagem de erro |
| Troca nota ↔ acorde | O painel mantém a mesma altura (mínimo de 150 px) para nada pular |
| Teclas fantasmas do microfone | Notas vindas do microfone acendem a tecla em tom mais suave, para indicar que a leitura é aproximada |

### Chegada ao Livre

Primeiro uso: um cartão de uma linha ("Toque uma tecla para começar") sobre o display. Desaparece no primeiro toque e nunca volta. Se o microfone ainda não foi liberado, aparece `Ativar microfone`, sem bloquear o teclado. O estado vazio também mostra o atalho do teclado do computador.

### Ajustes do Livre

Seletor `♯ / ♭` na barra do modo, `Mostrar nomes nas teclas`, `Mostrar trilha`, `Som do piano` (ligado/desligado, volume). Nenhum desses ajustes abre diálogo: são controles inline.

## Modo Acordes

Mesma estrutura do Desafio, com menos pressão: um acorde-alvo aparece, o jogador monta o acorde segurando as teclas. As notas corretas acendem uma a uma na cor da faixa; um **anel de progresso** ao redor do nome do acorde fecha conforme as notas certas entram (2 de 3 = anel a 66%). Ao completar, o anel vira `--success`, o acorde toca inteiro e a próxima rodada entra. Notas erradas piscam em `--failure` e o que falta aparece como `ghost`. Usa os mesmos componentes de HUD, resultado e resumo do Desafio, sem tempo obrigatório.

## Modo Entrada

Tela de configuração, no padrão de lista com seções ("Teclado MIDI", "Microfone", "Teclado do computador"). Cada fonte tem um cartão com estado, um botão de ação e um **teste ao vivo**: tocar ali acende uma tecla de exemplo e confirma "Recebi: Dó 4". O medidor do microfone e o controle de sensibilidade ficam no mesmo cartão. Em Safari e Firefox, o cartão MIDI explica que o navegador não oferece MIDI e sugere Chrome ou Edge.

## Experiência encantadora

Princípios: resposta imediata, movimento com propósito, nada que atrase o tempo de um desafio, e respeito a `prefers-reduced-motion`. A tabela resume os momentos que valem para qualquer modo; os detalhes de cada modo estão acima.

| Momento | Feedback | Implementação |
| --- | --- | --- |
| Tecla tocada | A tecla afunda, acende na cor da faixa e soa a nota | CSS sem transição na entrada; smplr |
| Soltar tecla | Brilho some em 120 ms | CSS |
| Nota nova (Livre) | `crossfade` do nome, bloco novo na trilha | Motion e SVG |
| Acerto | Anel fecha, tecla brilha, "+1" sobe | Motion `spring` |
| Erro | Resposta certa aparece como `ghost`, leve tremor desligável | Motion |
| Troca de nota (Desafio) | A nota anterior sai pelo lado, a nova entra com mola | Motion `layoutId` |
| Acorde completo | Anel de progresso fecha | SVG animado |
| Medidor do microfone | Nível acompanha o sinal | `requestAnimationFrame` com variável CSS |
| Fim de sessão | Estrelas e marcos em etapas | Motion |

Vibração: `navigator.vibrate` quando disponível (Android), opcional e desligável nos ajustes.

### Versão e novidades

- A versão (SemVer) vem do `package.json`, injetada no build (`__APP_VERSION__`), e aparece no cabeçalho (telas ≥ 768 px) e em Ajustes (`Keyz vX.Y.Z · Ver novidades`).
- A folha **Novidades** mostra o `CHANGELOG.md` gerado pelo release-please, embutido no build e carregado só ao abrir. O texto é lido por `parseChangelog` (`shared/changelog`) e renderizado como texto puro, nunca como HTML.
- Quando a versão muda desde a última que o usuário viu (`seenVersion` nos ajustes), aparece um ponto no chip da versão e no ícone de Ajustes, com o nome acessível "há novidades". No primeiro uso nada é sinalizado. Abrir as novidades marca a versão como vista.
- Só entram no changelog os commits `feat`, `fix`, `perf` e `refactor`; `docs`, `chore`, `ci` e `test` ficam de fora, porque o changelog é mostrado ao usuário (config do release-please).

## Regras de acessibilidade

- Cor nunca é o único sinal: ícone e texto acompanham em todo resultado e estado de tecla (`target` tem anel, `correct` tem marca de verificação na tecla, `wrong` tem marca de X).
- Com `prefers-reduced-motion`, as molas viram transições curtas e as animações de repouso (pulso do alvo, tremor, partículas) são desligadas.
- O tempo do desafio pode ser pausado, e há um ajuste "Mais tempo" que multiplica o tempo por 1,5 ou 2 (WCAG 2.2.1).
- Notas e resultados são anunciados com `aria-live="polite"`, sem roubar o foco; o anúncio do Livre é "Dó 4" e o do Desafio é "Acertou, Ré, 0,8 segundo".
- Foco sempre visível, com 3 px de contraste 3:1 ou mais; a barra fixa e o teclado não cobrem o controle focado.
- Todo gesto de arrastar (glissando, faixa de navegação) tem alternativa por toque simples ou teclado.
- Alvos de toque de 44 px ou mais; nas teclas pretas a área estendida cumpre a regra mesmo com a forma visual menor.
- Zoom do navegador permitido até 200%; sem `user-scalable=no`.

## Requisitos não funcionais

| Requisito | Meta | Como medir |
| --- | --- | --- |
| Latência MIDI ou toque até o destaque da tecla | até 1 quadro (16 ms) | Performance API no Playwright |
| Fluidez de animação | 60 fps na rodada do Desafio, sem tarefa longa > 50 ms | Trace do Playwright em celular simulado |
| Contraste do design system | 4,5:1 para texto e 3:1 para ícones e bordas, nos dois temas | Validador de pares no CI e axe |
| Latência microfone até o evento | p95 ≤ 80 ms | Medição no spike, comparada ao Swift |
| INP (p75) | < 200 ms | Lighthouse e RUM |
| LCP em desktop | < 2,0 s | Lighthouse |
| JS inicial, gzip | ≤ 200 KB | Relatório do Vite. VexFlow e samples vêm sob demanda |
| Acessibilidade | WCAG 2.2 AA, teclado completo | axe no Playwright e teste manual |
| Leitor de tela | notas e resultados anunciados (`aria-live`) | Teste manual com VoiceOver |
| Compatibilidade | Chrome e Edge: completo. Safari 17+ e Firefox: sem MIDI | Matriz de testes no CI, a definir |
| Responsividade | iPhone a partir de 375 px, iPad e desktop | Playwright com viewports |
| Privacidade | Áudio nunca sai do dispositivo. Sem analytics na v1. CSP restritiva | `e2e/csp.spec.ts` no CI; detalhes em `docs/SEGURANCA.md` |

As versões mínimas de navegador serão confirmadas no spike.

## Testes e paridade com o Swift

Cada teste XCTest vira um teste Vitest com o mesmo nome e a mesma entrada. Os 55 testes da lista abaixo são o critério de paridade da lógica.

| Suíte Swift | Testes | Destino |
| --- | --- | --- |
| KeyzCoreTests | 16 | `shared/test/core` |
| NoteDrillTests | 20 | `shared/test/drills` |
| ChromaAnalyzerTests | 9 | `shared/test/dsp` |
| HeldNotesTests | 4 | `shared/test/dsp` |
| RealisticPianoTests | 4 | `shared/test/dsp`, com fixtures WAV |
| RingFilterTests | 2 | `shared/test/dsp` |

Camadas de teste:

- **Unidade** (Vitest): `shared` e `application`.
- **Componentes** (Testing Library): telas e controles.
- **Ponta a ponta** (Playwright): o microfone usa `--use-file-for-fake-audio-capture` com um WAV de piano, o que torna o teste determinístico. O MIDI entra por um adaptador simulado. Sem teclado MIDI disponível agora, a validação com hardware real fica pendente (ver Pendências de validação).
- **Visual**: capturas Playwright de cada estado do `PianoKeyboard` e de cada fase do Desafio e do Livre, em claro e escuro, com e sem movimento reduzido, em 375, 768 e 1440 px. Substituem a comparação com o app Swift.
- **Novas regras de domínio** (sem equivalente no Swift, testadas em `shared/drills`): cálculo de estrelas, faixa de reflexo e notas mais difíceis da sessão; histerese de exibição do microfone no Livre.
- **Desempenho**: `bun test` com benchmarks de YIN e chroma, com limites no CI.

Fixtures: WAVs gerados pelos mesmos sintetizadores dos testes Swift, versionados em `shared/test/fixtures`.

Tolerância de paridade: mesma entrada, mesma saída, com diferença de até 1 cent na frequência.

## Fases, critérios de aceite e riscos

O total estimado é de 9 a 10 semanas para um dev. As fases 1 e 3 podem se sobrepor.

| Fase | Entrega | Semanas | Critério de aceite |
| --- | --- | --- | --- |
| 0. Spike | Bun, Vite e Worker de áudio; medição de latência; YIN ou pitchy | 1 | Latência p95 ≤ 80 ms; decisão registrada |
| 1. Shared | Port do KeyzCore e testes de paridade | 1 | 55 testes passando, com a tolerância de 1 cent |
| 2. Platform e application | Áudio, MIDI, storage e InputHub | 1,5 | Entrada funciona com microfone, MIDI e teclado |
| 3. UI base | Design system: tokens, tema escuro e claro, shell com ModeBar, `PianoKeyboard` com todos os estados e multitoque | 1,5 | Quatro modos navegáveis por teclado, em claro e escuro; galeria de componentes revisada |
| 4. Modos | Livre, Acordes e Desafio | 2 | Checklist de funcionalidades do README cumprido |
| 5. Encantamento | Jogo do Desafio (contagem, anel, estrelas, resumo), `NoteTrail` do Livre, som, tátil e movimento reduzido | 1,5 | Fluxo do Desafio jogável do Lobby ao Resumo; teste de passagem de nota aprovado (abaixo) |
| 6. Hardening | Acessibilidade, desempenho, navegadores, CI e deploy na Cloudflare | 1 | Metas não funcionais atendidas |

Riscos:

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Latência do microfone no navegador | Alto | Spike na fase 0; plano B com pitchy |
| Teclado ao toque sem a qualidade do GarageBand (multitoque, glissando, tamanho de tecla) | Alto | Protótipo do `PianoKeyboard` já na fase 0 e teste em iPhone e iPad reais |
| Sensação de jogo cair com latência ou animação pesada | Médio | Orçamento de 16 ms por quadro, animação só com `transform` e `opacity`, medida no CI |
| MIDI ausente em Safari e Firefox | Médio | Aviso claro na tela de Entrada |
| Peso dos samples de piano | Médio | Carregamento sob demanda e cache |
| Deriva entre `shared` e Swift | Alto | Fixtures compartilhados e testes de paridade durante a migração |

## Questões em aberto

- [ ] Sons de piano: a v1 usa síntese aditiva (sem download). Trocar por samples (smplr, sob demanda) ou manter?
- [ ] Estrelas e sequência no Desafio: aprovar a troca de "sem pontuação" por progresso com estrelas (limiares 60/80/90%)?
- [ ] Som de feedback ligado por padrão só no Desafio: confirmar.
- [ ] Tema padrão: seguir o sistema (proposta) ou sempre escuro, como o GarageBand?
- [ ] Teclado em celular retrato: janela de 8 a 10 teclas brancas (proposta) ou forçar paisagem no Desafio?
- [ ] Publicação: site público na Cloudflare Pages, PWA instalável ou uso local?
- [ ] O app Swift continua em paralelo ou é descontinuado após a paridade?
- [ ] **Piso de ruído do `ChromaAnalyzer` (achado no port):** o piso começa em 5% do primeiro quadro e só aprende quando o espectro fica abaixo de 5× o piso, então nunca alcança o ruído real de uma sala. O teste Swift `steadyRoomNoiseIsIgnoredAfterLearningIt` passa porque a asserção é vacuosa (as classes aparecem nos mesmos quadros no Swift e no web). Semear o piso com o primeiro quadro quebra o reconhecimento em um analisador novo, porque esse quadro já contém a música. Mantida a paridade; decidir uma correção (por exemplo, calibrar com silêncio antes de ouvir, o botão "Recalibrar ruído")
- [ ] Desafio em celular retrato: a janela do teclado mostra poucas teclas, então a nota-alvo é trazida para a janela a cada rodada (`reveal`). Isso entrega a região da resposta. Aceitável, ou forçar paisagem?
- [ ] Acordes ganhou sessão de 10 rodadas com resumo (no Swift era contínuo). Confirmar
- [ ] O Swift cancela o avanço automático do acorde se a mão solta antes de 1,2 s; o web mantém o avanço (timer próprio). Confirmar que é a intenção
- [x] Repositório: monorepo no `keyz` atual. App web na raiz, `shared/` ao lado e `keyz-mac/` como módulo próprio.
- [x] Deploy automático: só a partir de `main`, quando uma Release é criada (release-please + `wrangler-action`)
- [ ] Proteção da branch `main` (exigir PR e o CI verde): ainda não aplicada, para não travar os pushes diretos de quem trabalha sozinho

## Pendências de validação

- [ ] Passagem de nota: tocar a escala de Dó maior a 120 bpm, com microfone e MIDI, sem tremor nem atraso perceptível no display
- [ ] Multitoque e glissando do teclado em iPhone e iPad reais
- [ ] Rodada do Desafio a 60 fps em um celular de entrada
- [ ] MIDI: testar com teclado USB e Bluetooth em Chrome e Edge
- [ ] MIDI: confirmar hot-plug (conectar e desconectar o teclado com a página aberta)
- [ ] MIDI: confirmar comportamento em Safari e Firefox (aviso na tela de Entrada)
