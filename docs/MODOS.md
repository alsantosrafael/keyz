# Modos e onboarding

Comportamento de cada modo, como está implementado. Doc durável: regra de produto nova ou alterada entra aqui no mesmo trabalho. Dúvida de produto em aberto vai para `docs/QUESTOES.md`, não para decisão silenciosa no código.

Todos os modos compartilham o teclado da base, a barra superior (título, entrada e Ajustes) e a `ModeBar`. Trocar de modo preserva o teclado.

## Acordes

Monte o acorde segurando as teclas. Um acorde-alvo aparece; as notas certas acendem uma a uma na cor da faixa e um anel de progresso fecha conforme elas entram (2 de 3 notas = 66%).

- **Sessão de 10 rodadas** com resumo (estrelas, acerto, rodadas, primeira tentativa).
- Acorde correto: anel vira `success`, o acorde toca inteiro e, com "Avançar sozinho" ligado, a próxima rodada entra em 1,2 s.
- Acorde errado: a dica diz o que faltou ou o que sobrou ("Faltou Mi", "Nota a mais: Ré"). Notas erradas piscam em `failure`. O que falta aparece como `ghost` depois de julgar ou com "Mostrar resposta".
- Controles: "Mostrar resposta", "Pular", "Maiores", "Menores", "Avançar sozinho".
- Sequência de acertos (chama e número) no HUD.
- Julgamento só começa depois que a mão fica parada; se a mão solta antes, avalia na hora. Trocar de acorde ignora as notas que ainda estão presas até soltar.

Notas: acordes são maiores e menores (`ChordGenerator`). Acordes com sétima, inversões e outros tipos não existem na v1.

## Desafio

Jogo de reflexo e leitura de notas. Ciclo: Lobby → Contagem 3·2·1 → Rodada ↔ Resultado → Resumo. Meta: o ciclo nota → toque → resposta dura menos de 3 segundos e nunca deixa tela parada esperando o usuário.

**Lobby**: três níveis (Fácil, Médio, Avançado), cada um com cor, ícone de dificuldade e melhor marca. "Jogar" fica a um toque. "Personalizar" abre o painel (celular: folha de baixo) com Tempo, Notas, Exibição e Sessão. O nível guarda a última configuração.

| Nível | Tempo | Dica no teclado | Pausa automática | Tom |
| --- | --- | --- | --- | --- |
| Fácil | 10 s | ligada | 1,5 s | calmo, nome da nota |
| Médio | 6 s | desligada | 1 s | equilibrado, nome e pauta |
| Avançado | 3 s | desligada | 0,7 s | rápido, só pauta |

Valores iniciais vindos do `DrillConfig.preset`. Ajustes feitos pelo jogador valem para a sessão e ficam em "Personalizar".

**Rodada**: a nota-alvo aparece em `display` (e na pauta, conforme "Mostrar nota como"). O anel de tempo esvazia continuamente. Nos últimos 3 s, ele pulsa devagar e o tique acelera. Pausa com Esc, com Espaço (quando nenhum controle está focado) ou pelo botão de pausa: a área escurece e retomar faz contagem de 1 s.

**Resultado** (fica no mesmo lugar da nota, por 700 ms no automático ou até o toque):

| Resultado | Visual | Texto |
| --- | --- | --- |
| Acerto | anel fecha em `success`, tecla brilha, "+1" sobe, tempo de resposta | "Acertou" + ícone `check` |
| Erro | nota tocada em `failure`; resposta certa como `ghost` em `success` | "Era Ré. Você tocou Mi" + `x` |
| Tempo esgotado | anel vira `warning`; resposta certa como `ghost` | "Tempo esgotado. Era Ré" + `clock` |

Regras: erro e tempo nunca usam tela vermelha cheia. O erro fica visível no mínimo 1,2 s, a menos que o jogador toque para pular. A próxima nota nunca entra antes do resultado terminar.

**Sequência e estrelas**: sequência de acertos com marcos em 5, 10 e 20. Estrelas (1 a 3) ao fim: 1 com 60% de acerto ou mais; 2 com 80%; 3 com 90% e tempo médio abaixo de metade do tempo da nota (regra pura em `shared/src/drills/rating.ts`). Sem vidas e sem game over.

**Resumo**: estrelas aparecem uma a uma com mola e tom; percentual conta de 0 ao valor; três fichas (Maior sequência, Tempo médio, Notas) e as notas mais difíceis na pauta. Botões: "Jogar de novo", "Mudar nível", "Treinar notas difíceis" (sessão curta só com as notas que erraram). Com movimento reduzido, o resumo aparece completo de uma vez.

**Melhor marca** por nível (estrelas e maior sequência), guardada no navegador (`keyz.best.v1`), aparece no Lobby.

**Som**: sons de acerto, erro e estrela ligados por padrão só no Desafio. Botão de volume sempre visível no HUD. A nota tocada é sempre a do piano.

**"Mais tempo"** em Ajustes multiplica o tempo por 1,5 ou 2 (WCAG 2.2.1).

## Livre

A mesa de som: tocar sem objetivo, ver e ouvir o que o app entendeu. O critério de sucesso é a **passagem de nota agradável**: numa sequência (escala, melodia, acordes), a interface acompanha sem tremer, sem atrasar e sem apagar a informação cedo demais.

De cima para baixo:

1. **Trilha de notas** (`NoteTrail`): blocos na altura de cada nota, deslocando-se devagar; comprimento acompanha o tempo pressionado; somem em ~8 s.
2. **Display** (`NoteReadout`): nome da nota em `display`; oitava e Hz embaixo. Para acordes, nome e inversão.
3. **Pauta** (`StaffCard`): nota ou acorde atual, na cor da faixa do Livre.
4. **Afinação** (só com microfone): arco em cents, com ±10 cents em `success`.
5. **Fichas de histórico** acima do teclado: últimas 12 notas ou acordes, mais recente à direita.

**Regras de leitura estável**:

| Situação | Comportamento |
| --- | --- |
| Nota nova | Nome troca por `crossfade` de 120 ms; pauta e tecla respondem no mesmo quadro |
| Soltar a tecla | O display **mantém** a última nota, mais apagada, até "Limpar" ou troca de modo |
| Notas em sequência rápida | Cada toque substitui a anterior sem esperar a animação |
| Microfone, nota instável | Só muda quando a nova nota se mantém por 3 quadros; vibrato de até ±30 cents não muda o nome |
| Microfone, nota perdida | A leitura esmaece em 200 ms em vez de piscar para vazio |
| Mais de uma nota | Vira acorde; se não for reconhecido, mostra as notas em ordem, sem mensagem de erro |
| Troca nota ↔ acorde | O painel mantém altura mínima de 150 px: nada pula |
| Nota vinda do microfone | Acende a tecla em tom mais suave, para indicar leitura aproximada |

**Chegada**: primeiro uso mostra um cartão de uma linha ("Toque uma tecla para começar") sobre o display. Some no primeiro toque e nunca volta (`welcomeSeen`). Se o microfone não foi liberado, aparece "Ativar microfone" sem bloquear o teclado. O estado vazio mostra o atalho do teclado do computador.

**Ajustes do Livre**: seletor ♯/♭ na barra do modo; "Mostrar nomes nas teclas", "Mostrar trilha", "Som do piano" (liga/desliga e volume). Nenhum deles abre diálogo.

## Entrada

Tela de configuração, em seções: **Teclado MIDI**, **Microfone**, **Teclado do computador**. Cada fonte tem cartão com estado, botão de ação e **teste ao vivo**: tocar acende uma tecla de exemplo e confirma "Recebi: Dó 4". O medidor e a sensibilidade do microfone ficam no cartão do microfone.

- Em Safari e Firefox, o cartão MIDI explica que o navegador não oferece MIDI (sem erro em vermelho).
- Sem permissão ou sem suporte, o microfone mostra "Microfone desligado" com a causa e oferece o teclado na tela.
- Ruído alto: aviso "Ambiente barulhento" na pílula de entrada, sugerindo ajustar a sensibilidade, sem bloquear.

## Reportar um problema ou ideia

Em Ajustes. Folha com tipo (bug, microfone, MIDI, acessibilidade, melhoria, dúvida), título e os campos do tipo. Não exige conta no GitHub. O contexto técnico anexado fica visível em "O que será enviado junto". Ao enviar, o botão mostra "Enviando…" e o resultado é anunciado em `aria-live`: sucesso com o número da issue, ou erro com a causa e o texto preservado para tentar de novo. O e-mail é opcional e avisa que a issue é pública.

**Pílula de entrada** (barra superior): mostra a fonte ativa e um ponto de estado. MIDI conectado vira o padrão. Microfone ouvindo mostra o ponto pulsando com o nível.

## Onboarding (tutorial de acordes)

Objetivo: o usuário toca o primeiro acorde em cerca de um minuto, no teclado real, sem ler um tutorial. Acordes é o tutorial porque é o conceito mais básico; os outros modos ganham só um exemplo.

### Passos

| # | Passo | O que acontece | Sai quando |
| --- | --- | --- | --- |
| 1 | "Um acorde são notas tocadas juntas" | Toca Dó maior sozinho (Dó, Mi e Sol, em oitava 4) e acende as teclas | Segue sozinho após 3,2 s. "Ouvir de novo" reinicia; "Pular" avança |
| 2 | "Monte Dó maior" | Pede Dó, Mi e Sol juntos. Anel de progresso | Montou (acertou) ou "Pular passo" |
| 3 | "Agora, Lá menor" | Pede Lá, Dó e Mi juntos | Montou ou "Pular passo" |
| 4 | "Você tocou dois acordes" | Lista um exemplo de cada outro modo (Desafio, Livre, Entrada) | "Concluir tutorial" |

### Como julga o passo de montar

- Acerto: as notas tocadas, ignorando oitava, são exatamente as do acorde. Toca o acorde, marca "Acertou" e avança 0,9 s depois. Soltar as teclas nesse intervalo não cancela o avanço.
- Erro: só aparece depois de soltar tudo. Diz o que faltou ("Faltou Mi") ou o que sobrou ("Tem nota a mais: Ré"). Não há punição: é só tentar de novo. Uma nova tecla apaga o erro.
- Sem contagem de pontos, sem tempo, sem vidas.

### Quando aparece e como se retoma

- **Convite (primeiro uso)**: uma faixa discreta no topo da área do modo, em qualquer tela: "Primeira vez no Keyz? Aprenda o primeiro acorde em um minuto, tocando." Botões: **Começar** (abre o tutorial em Acordes) e **Agora não**.
- **"Agora não" é definitivo para o convite**. Não volta sozinho. Continua disponível em Ajustes › Aprender.
- **Sair no meio** ("Guardar e sair" no canto do tutorial, ou trocar de tela): o progresso fica salvo no passo atual. Sair da tela pausa o tutorial; ele não reinicia.
- **Voltar ao Acordes** com tutorial pausado: aparece a faixa "Tutorial pausado no passo N de 4 · Continuar". O tutorial não abre sozinho de novo.
- **Completar a qualquer minuto**: botão "Completar" sempre visível no topo do tutorial. Encerra o tutorial, marca como concluído e marca as dicas dos outros modos como vistas.
- **Ajustes › Aprender**: mostra o estado ("cerca de 1 minuto", "passo N de 4" ou "concluído") e oferece Começar, Continuar, Marcar como concluído ou Rever tutorial.

### Dicas dos outros modos

- **Desafio** e **Entrada**: uma dica de uma linha com exemplo, mostrada na primeira visita ao modo. Fechar com X ou sair da tela faz ela não voltar.
- **Livre**: já tem o cartão de boas-vindas ("Toque uma tecla para começar"); não ganha dica extra.
- Concluir o tutorial marca as dicas como vistas, porque o último passo já mostrou os exemplos.

### Persistência

- Chave `keyz.onboarding.v1` no `localStorage`, por navegador (não por conta). Limpar os dados do site reinicia o tutorial.
- Campos: `status` (`new`, `started`, `completed`), `step`, `promptDismissed`, `tipsSeen`. Dado inválido vira o padrão.
- Escrita a cada mudança; falha de armazenamento (modo privado) não quebra a tela, só não persiste.

### Movimento e acessibilidade

- Passos trocam com saída para a esquerda e entrada pela direita, em 240 ms, interrompível. Com movimento reduzido, viram fade de 120 ms.
- O progresso (barra de quatro segmentos) preenche com mola (`scaleX`), não com largura.
- Acertos e erros são anunciados com `aria-live="polite"` ("Acertou, Dó maior"). O botão "Ouvir de novo" e os controles têm nome acessível.
- O tutorial usa o mesmo teclado e as mesmas cores de resultado do Acordes. Acerto tem ícone e texto; erro tem ícone e texto.
