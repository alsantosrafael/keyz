# Design

Princípios, tokens, componentes e regras de movimento e acessibilidade. Doc durável: é a referência para qualquer mudança visual. Atualize quando mudar token, componente ou regra.

Inspiração: GarageBand, reduzido ao piano. Três ideias guiam tudo:

1. **O instrumento é o herói.** O teclado fica sempre visível, preso à base da tela. Os modos mudam o que está acima dele; o teclado não muda de lugar.
2. **Estúdio escuro, cor por função.** Fundo escuro e quieto, para que as cores de feedback se destaquem. Cada modo tem uma cor de faixa.
3. **Controles que parecem físicos.** Teclas com profundidade, botões grandes, displays com números de leitura de equipamento. Nada de formulário no meio da prática.

## Princípios que valem para qualquer modo

| # | Princípio | Regra verificável |
| --- | --- | --- |
| 1 | **Tocar é instantâneo** | A tecla muda de estado no `pointerdown` ou no evento MIDI, no mesmo quadro (≤ 16 ms), sem esperar `click`, som ou React |
| 2 | **Um foco por vez** | Cada estado de tela tem um elemento dominante (a nota-alvo, a nota tocada, o resumo). O resto fica em segundo plano |
| 3 | **Todo evento tem resposta em 3 canais** | Visual (tecla e pauta), sonoro (nota do piano) e, quando existe, tátil. Nenhum canal é obrigatório para entender o resultado |
| 4 | **Estado estável, sem tremor** | Leituras do microfone passam por histerese antes de aparecer. Números usam `tabular-nums` e largura fixa |
| 5 | **Sem punição, com recuperação** | Erro mostra a resposta certa e segue. Nenhum diálogo bloqueia a prática |
| 6 | **Movimento significa causa e efeito** | Toda animação responde a uma ação do usuário ou a uma mudança de estado. Sem animação decorativa em repouso |
| 7 | **Ninguém depende só de cor, som ou movimento** | Cor sempre acompanha ícone ou texto; som tem equivalente visual; movimento tem versão reduzida |
| 8 | **Entrada igual em qualquer fonte** | Mouse, toque, teclado, MIDI e microfone produzem o mesmo estado visual na tecla. O microfone só difere por ser mais lento, e a interface mostra isso |

## Tokens

Os tokens são variáveis CSS em `src/ui/theme.css` (Tailwind v4, `@theme`), em três camadas: **primitivos** (valores brutos), **semânticos** (papel na interface) e **de componente**. Componentes usam só tokens semânticos ou de componente. **Nunca hexadecimal num componente.**

A tabela usa o nome de design; no código o nome vem com prefixo (`--surface-stage` é `--color-stage`, por exemplo). Em dúvida, procure no `theme.css`.

### Superfícies e texto

Cada nível separa o painel do anterior por luminosidade e uma borda fina de 1 px, não por sombra pesada.

| Design | Código | Escuro | Claro | Uso |
| --- | --- | --- | --- | --- |
| `surface-stage` | `--color-stage` | `#0B0C10` | `#F4F5F8` | fundo da tela |
| `surface-panel` | `--color-panel` | `#14161C` | `#FFFFFF` | painéis, pauta, cartões |
| `surface-raised` | `--color-raised` | `#1D2029` | `#FFFFFF` + borda | controles, fichas, popovers |
| `surface-inset` | `--color-inset` | `#07080B` | `#E6E8EE` | display "afundado" (leituras, medidores) |
| `line` | `--color-line` | 8% branco | 12% azul-escuro | bordas e divisores |
| `text` | `--color-ink` | `#F2F4F8` | `#15171C` | texto principal |
| `text-muted` | `--color-muted` | `#A9B0C2` | `#505769` | texto secundário |
| `text-faint` | `--color-faint` | `#8A92A6` | `#5F667A` | legendas (só em 14 px ou mais) |

### Cor de faixa por modo

É a "cor do instrumento": aparece no ícone da aba, na tecla pressionada, no foco e nos botões primários do modo.

| Modo | Código | Escuro | Claro | Texto sobre a cor |
| --- | --- | --- | --- | --- |
| Acordes | `--color-chords` | `#B9A2FF` | `#6D4AE0` | escuro `#150D33` / claro `#FFFFFF` |
| Desafio | `--color-drill` | `#FF9F0A` | `#A65300` | escuro `#1A1100` / claro `#FFFFFF` |
| Livre | `--color-free` | `#2DD4C4` | `#007A70` | escuro `#00201D` / claro `#FFFFFF` |
| Entrada | `--color-input` | `#5AA9FF` | `#1F63C6` | escuro `#06182E` / claro `#FFFFFF` |

No código, cada cor de faixa é `--track-<modo>` (por exemplo `--track-chords`). A faixa ativa é a variável `--track`, que aponta para a cor do modo atual; `data-mode` no `<html>` troca a referência.

### Cores de resultado

Sempre com ícone e texto.

| Papel | Código | Escuro | Claro | Ícone |
| --- | --- | --- | --- | --- |
| Acerto | `--color-success` | `#30D158` | `#1B7F37` | `check` |
| Erro | `--color-failure` | `#FF6961` | `#C4261D` | `x` |
| Tempo e atenção | `--color-warning` | `#FFD60A` | `#8A6A00` | `clock` |

Contraste: todo texto e ícone significativo fica em 4,5:1 ou mais sobre `stage`, `panel` e `raised`, nos dois temas. `src/ui/contrast.test.ts` verifica 74 pares; rode-o a cada mudança de cor.

**Brilho** (`--glow-*`) é a cor da faixa ou do resultado a 35% de opacidade. Só aparece em tecla ativa, anel do Desafio e medidor. Nunca em texto.

### Tipografia

Fonte do sistema (`-apple-system, system-ui, sans-serif`), sem baixar fontes. Números de leitura usam `ui-rounded` com `tabular-nums`.

| Papel | Tamanho / peso | Uso |
| --- | --- | --- |
| `display` | 96 / 700, rounded (64 em telas < 480 px) | nome da nota-alvo e da nota tocada |
| `title` | 28 / 700 | título de tela e do resumo |
| `headline` | 20 / 600 | rótulos de seção, nome da dificuldade |
| `body` | 16 / 400 | texto corrido, ajustes |
| `label` | 14 / 500 | botões, abas, fichas |
| `caption` | 12 / 500, caixa alta, tracking leve | legenda de display ("CENTS", "TEMPO") |
| `readout` | 20 / 600, mono-tabular | tempo de resposta, Hz, cents |

Regras: o corpo nunca fica abaixo de 16 px; o texto cresce com o zoom do navegador sem quebrar o layout; sinais ♯ e ♭ vêm da mesma fonte, nunca de imagem.

### Espaço, raio, elevação e tamanhos

- **Espaço**: escala de 4 px (`4 8 12 16 24 32 48`). Margens laterais: 16 px no celular, 24 px no tablet, 32 px no desktop.
- **Raio**: `--radius-control` 12 px, `--radius-card` 16 px, `--radius-key` (tecla) 6 px embaixo, `--radius-pill` 999 px.
- **Elevação**: `flat` (teclado e pauta), `raised` (controles), `overlay` (diálogos e popovers).
- **Alvos de toque**: mínimo 44 × 44 px em qualquer controle. Tecla branca com pelo menos 44 px de largura.
- **Largura de leitura**: conteúdo central até 720 px (1040 px no Livre e no Acordes, em desktop); o teclado ocupa a largura toda.
- **Camadas**: `--z-content` (conteúdo), `--z-keyboard`, `--z-bar` (barra superior), `--z-popover`, `--z-dialog`, `--z-toast`.

## Movimento

Mola para o que responde a gesto ou muda de lugar; curva curta para estado. Só `transform` e `opacity` são animados.

| Uso | Forma | Valor |
| --- | --- | --- |
| Tecla pressionada | sem transição na entrada | 0 ms |
| Soltar tecla, hover, foco | `ease-out` | 120 ms (`--motion-fast`) |
| Troca de conteúdo, fichas, medidor | `ease-out` | 220 ms (`--motion-base`) |
| Transição entre fases do jogo | `ease-in-out` | 400 ms (`--motion-slow`) |
| Acerto, nota que entra na pauta | mola `snappy` | rigidez 500, amortecimento 32 |
| Cartões, resumo, contagem, convite | mola `soft` | rigidez 220–260, amortecimento 24–30 |

Regras:

- Saída 30% mais rápida que a entrada.
- Toda animação é **interrompível**: um novo toque cancela a anterior e vai direto ao estado final. Nunca depende de `animationend` para estar correta.
- Nunca bloqueia a entrada do usuário.
- Listas entram escalonadas (40 ms por item).
- **Movimento reduzido** (`prefers-reduced-motion`): molas viram `fade` de 120 ms; tremor de erro e pulso de repouso somem; anel de tempo só muda de cor; o resumo aparece completo de uma vez.
- Ajuste "Pular animações" no resumo tem o mesmo efeito.

Implementação: Motion (`motion/react`) para molas e transições de montagem; CSS para o anel (`stroke-dashoffset`) e para teclas; `requestAnimationFrame` com variável CSS para medidores.

## Componentes do instrumento

Componentes próprios em SVG ou CSS, com estados definidos, testados em claro e escuro.

### `PianoKeyboard` (a base de tudo)

- Teclas brancas em marfim com gradiente vertical e sombra interna no topo; pretas quase pretas, com brilho fino na borda de cima.
- Estados: `idle`, `hover` (só ponteiro fino), `pressed`, `target` (nota a tocar), `correct`, `wrong`, `ghost` (resposta mostrada após o erro), `chord-member`, `disabled`.
- `pressed`: afunda 2 px, pinta com a cor da faixa e acende. Entra sem transição; sai em 120 ms.
- `target`: anel da cor da faixa que pulsa devagar (1,2 s). Com movimento reduzido, contorno fixo mais grosso.
- Nome da nota impresso na tecla é opcional ("Mostrar nomes nas teclas"), mas em `target`, `correct` e `wrong` o nome aparece sempre.
- **Faixa de navegação** no topo: miniatura das 88 teclas com janela arrastável. Setas de oitava com 44 px. Arrastar tem alternativa por toque simples e por teclado.
- **Tamanho**: no celular, 8 a 10 teclas brancas visíveis por padrão; "Zoom do teclado" vai de 7 a 21. Altura mínima de 160 px no celular em retrato e 220 px nos demais.
- **Ponteiro**: `pointerdown`, `pointermove` e `pointerup` com multitoque. Deslizar o dedo (glissando) toca as teclas por onde passa. Teclas pretas têm área de toque estendida em 6 px.
- **Teclado do computador**: duas fileiras, A–L para as brancas e W E T Y U O P para as pretas. Z e X mudam de oitava. Letras impressas com "Mostrar atalhos".
- **Acessibilidade**: cada tecla é um botão com nome ("Dó 4"), `aria-pressed` e foco visível de 3 px.

### `StaffCard` (pauta)

- Cartão `surface-panel` com pauta dupla em SVG próprio (`src/ui/StaffCard.tsx`) sobre o `StaffPlacement` do domínio.
- Nota-alvo em `text`; nota tocada na cor da faixa; certa em `success`; errada em `failure`. Cada nota colorida leva rótulo de texto ("certa", "tocada").
- Altura fixa por modo: nada salta quando a nota muda.
- Entrada da nota: a cabeça desliza e assenta com mola `snappy`.

### `NoteReadout` (display de nota)

- Painel `surface-inset`. Nome da nota em `display`; sublinha em `readout` (oitava, Hz).
- Largura mínima reservada para três caracteres e um sinal, para não deslocar nada.
- Troca de nota: `crossfade` de 120 ms com deslocamento vertical de 6 px, na direção do movimento (nota mais aguda sobe).

### `NoteTrail` (trilha do Livre)

Faixa horizontal em estilo rolo de piano. Cada nota vira um bloco na altura da sua nota, nasce na borda direita e desloca-se devagar (≈ 120 px/s). O comprimento acompanha o tempo da tecla pressionada. Blocos antigos ficam translúcidos e somem em ~8 s.

### `Meter` e `TuningArc`

Barra em cápsula ou arco, sempre em `surface-inset`. Atualiza por variável CSS via `requestAnimationFrame`, sem re-render do React. Variantes: nível do microfone, afinação (arco em cents, com faixa de ±10 cents em `success`), tempo.

### `TimeRing` (anel de tempo)

Anel SVG que envolve a nota e esvazia continuamente (linear, pois é progresso constante). Cor da faixa do modo até 2/3 do tempo; depois `warning`. Nos últimos 3 s pulsa devagar. Também serve de anel de progresso (Acordes e Tutorial), com `progress` de 0 a 1.

### `Button`, `IconButton`, `Chip`, `Switch`, `Slider`, `Segmented`

- `Button`: três variantes. `primary` usa a cor da faixa do modo; `secondary` fica em `surface-raised` com borda; `ghost` é só texto. Sempre 44 px de altura; ícone `lucide` quando ajuda.
- `IconButton`: só ícone, com `label` obrigatório (nome acessível).
- `Sheet`: painel de ajustes e personalização, feito com `<dialog>` nativo (`showModal`), então Esc fecha e o foco fica preso dentro dele.

### `ModeBar`

Navegação entre os quatro modos. Celular: barra inferior com ícone e rótulo, acima do teclado. Tablet e desktop: abas no topo. A aba ativa mostra a cor da faixa, ícone preenchido e sublinhado, nunca só cor. Trocar de modo preserva o teclado e a posição dele.

### `LiveRegion`

`<div role="status" aria-live="polite" aria-atomic="true">` oculto visualmente. Anuncia notas e resultados. Nunca rouba o foco.

## Ícones

Só `lucide-react`, traço de 1,75 px, tamanhos 16, 18, 20 e 24. Nunca emoji.

| Uso | Ícone |
| --- | --- |
| Acordes | `Music2` |
| Desafio | `Target` |
| Livre | `AudioWaveform` |
| Entrada | `Plug` |
| Ajustes | `Settings` |
| Acerto | `Check` |
| Erro | `X` |
| Tempo | `Clock` |
| Dica | `Lightbulb` |
| Tutorial | `GraduationCap` |

## Acessibilidade (WCAG 2.2 AA)

- Cor nunca é o único sinal: `target` tem anel, `correct` tem marca de verificação, `wrong` tem marca de X.
- Com `prefers-reduced-motion`, molas viram transições curtas e animações de repouso são desligadas.
- Desafio: tempo pode ser pausado; "Mais tempo" multiplica por 1,5 ou 2 (WCAG 2.2.1).
- Notas e resultados anunciados com `aria-live="polite"`, sem roubar o foco. Ex.: "Dó" no Livre; "Acertou, Ré, 0,8 segundo" no Desafio.
- Foco sempre visível (3 px, contraste 3:1). Barra fixa e teclado não cobrem o controle focado.
- Todo gesto de arrastar tem alternativa por toque simples ou teclado.
- Alvos de toque de 44 px ou mais. Teclas pretas: área estendida cumpre a regra mesmo com forma visual menor.
- Zoom do navegador permitido até 200%. Nunca `user-scalable=no`.
- Estado de tela, pauta e display são legíveis sem cor: sempre há texto.

## Layout

- Celular retrato: barra superior (título, entrada, Ajustes), área do modo que rola, faixa de navegação do teclado, teclado, `ModeBar`. O teclado e a `ModeBar` não rolam.
- Celular paisagem: pauta e display lado a lado acima do teclado.
- Tablet e desktop: barra com abas, área do modo centralizada, teclado em largura total.
- Pontos de quebra: 375, 768, 1024 e 1440 px. Sem rolagem horizontal em nenhum deles.
- Respeitar `env(safe-area-inset-*)`.
