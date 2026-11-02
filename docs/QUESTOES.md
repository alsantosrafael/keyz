# Questões em aberto

Dúvidas de produto, técnicas e de validação. Doc durável, substituiu as seções "Questões em aberto" e "Pendências de validação" da `docs/SPEC.md` (histórica). Regra: dúvida de produto não se resolve em silêncio no código. Abra uma entrada aqui; quando decidir, mova para "Decididas" e atualize `docs/MODOS.md`, `docs/DESIGN.md` ou `docs/ARQUITETURA.md`.

## Abertas: produto

- [ ] **Tutorial, passo 1 avança sozinho após 3,2 s.** Proposta atual. Confirmar, ou exigir um toque em "Continuar" (mais controle, um clique a mais).
- [ ] **Convite do tutorial em qualquer tela no primeiro uso.** Proposta atual. Alternativa: convite só dentro do Acordes.
- [ ] **Dicas de uma linha só para Desafio e Entrada.** Livre usa o cartão de boas-vindas que já existe. Confirmar.
- [ ] **Estrelas e sequência no Desafio**: limiares 60/80/90% e tempo médio abaixo de metade do tempo da nota. Implementado; confirmar que é a regra final.
- [ ] **Som de feedback ligado por padrão só no Desafio.** Implementado; confirmar.
- [ ] **Tema padrão**: seguir o sistema (implementado) ou sempre escuro, como o GarageBand.
- [ ] **Teclado em celular retrato**: janela de 8 a 10 teclas brancas com a nota-alvo trazida para a janela (`reveal`). Aceitável, ou forçar paisagem no Desafio?
- [ ] **Acordes: sessão de 10 rodadas com resumo.** O Swift era contínuo. Confirmar.
- [ ] **Acordes: avanço automático depois de acerto.** O Swift cancelava se a mão soltasse antes de 1,2 s; o web mantém o avanço. Confirmar que é a intenção.
- [ ] **Acordes: validar 1,5 s de mão parada e 6 s para a dica** com mão real (teclado MIDI e na tela), em iniciante e em quem já toca.
- [ ] **Piano**: síntese aditiva (atual, sem download) ou samples sob demanda (smplr)? A porta `PianoPort` isola a troca.
- [ ] **Publicação**: site público (já no ar em `keyz-9ir.pages.dev`), PWA instalável (não feito) ou uso local?
- [ ] **Telemetria técnica: opt-out em Ajustes.** Hoje só `Sec-GPC` e `Do Not Track` desligam o envio de erros técnicos. Decidir se entra um interruptor em Ajustes (ligado por padrão ou desligado) e o texto dele.
- [ ] **Telemetria: política de privacidade pública.** O app ainda não tem página de privacidade. Antes de divulgar, escrever o que é enviado (ver `docs/OBSERVABILIDADE.md`).
- [ ] **Anexar os últimos erros ao relatório de problema.** Ajudaria a triagem, mas o relatório vira público. Decidir se entra, e como mostrar à pessoa o que vai junto.

## Abertas: técnicas

- [ ] **Volume do piano no compressor.** `src/platform/audio.ts` usa `DynamicsCompressor` com razão padrão e sem ganho de compensação. Pela conta dos valores padrão, o volume quase não muda na faixa alta. Medir com `OfflineAudioContext` antes de corrigir.
- [ ] **Latência com a faixa grave do microfone (27,5 Hz).** O YIN agora analisa uma janela maior. C1 e F#1 são reconhecidos com sinal sintético; a latência e a estabilidade com piano real não foram medidas.
- [ ] **Piso de ruído sem calibração.** A calibração manual agora aprende a média por faixa e funciona. O aprendizado automático inicial continua começando em 5% do primeiro quadro e só aprende abaixo de 5× o piso, então sem calibrar ele não alcança o ruído real da sala. Decidir se semeia o piso com o primeiro quadro ou calibra sozinho ao ligar o microfone.
- [ ] **Proteção da `main`**: `CLAUDE.md` afirma que a `main` só aceita PR por ruleset. Conferir no GitHub se o ruleset está ativo (a spec antiga dizia que não).
- [ ] **Matriz de navegadores em CI**: definir quais versões mínimas de Chrome, Edge, Safari e Firefox.
- [ ] **Axe no Playwright** e **PWA**: previstos como hardening, não feitos.
- [ ] **Workers Logs em projeto Pages.** Confirmar se `[observability]` no `wrangler.toml` vale para Pages e qual a retenção real no free (a doc de Workers cita 3 dias). Hoje o tail ao vivo é a única fonte; sem histórico, depuração depende de reproduzir com o tail aberto. Ver `docs/OBSERVABILIDADE.md`.
- [ ] **E2e do ErrorBoundary e da telemetria.** Forçar um erro de render e conferir a tela de recuperação; conferir que um erro de MIDI negado gera um único envio. Não cobertos hoje.
- [ ] **Limite de criação de issues por `/api/reportar`.** Hoje não há teto nem deduplicação. Ver `docs/SEGURANCA.md` §1.5; o envio de telemetria já tem seus tetos no cliente.

## Decididas

- [x] **Acordes: quando julgar** (2026-11-02). Feedback ao vivo sem penalidade; acerto imediato quando as notas batem; erro só ao soltar (com notas suficientes) ou com a mão parada 1,5 s; soltar com menos notas é procura e não conta; dica sem erro após 6 s. Os tempos (1,5 s e 6 s) são valores iniciais a validar com mão real. "Mostrar resposta" tira a rodada da estatística. Regras em `docs/MODOS.md`.

- [x] **O app Swift (`keyz-mac/`) saiu do repositório** (2026-11-01, pelo mantenedor). Continua no histórico do git (commit `f0d1e34`). A paridade funcional fica com `shared/test/` como referência. Antes, era a questão "o app Swift continua em paralelo?".
- [x] **Repositório**: monorepo. App web na raiz, `shared/` ao lado.
- [x] **Deploy automático** só a partir da `main`, quando uma Release é criada (release-please + `wrangler-action`).
- [x] **Paridade visual com o Swift deixou de ser critério.** A paridade que vale é a funcional (regras, modos, entradas).
- [x] **Tutorial de acordes, não de um modo inteiro**: acorde é o conceito mais básico. Os outros modos ganham uma linha de exemplo.
- [x] **Progresso do tutorial persiste no navegador e pode ser completado a qualquer momento**, sem reaparecer sozinho depois de "Agora não" ou de concluir.

## Pendências de validação

Só se valida com o aparelho real ou com ferramenta de medição. Marque quando feito, com a data e o aparelho.

- [ ] **Passagem de nota**: tocar a escala de Dó maior a 120 bpm, com microfone e MIDI, sem tremor nem atraso perceptível no display.
- [ ] **Multitoque e glissando do teclado** em iPhone e iPad reais.
- [ ] **Rodada do Desafio a 60 fps** em celular de entrada (trace do Playwright em celular simulado não substitui).
- [ ] **MIDI** com teclado USB e Bluetooth em Chrome e Edge.
- [ ] **MIDI, hot-plug**: conectar e desconectar o teclado com a página aberta.
- [ ] **MIDI em Safari e Firefox**: o aviso da tela de Entrada aparece e não há erro.
- [ ] **Latência do microfone**: p95 ≤ 80 ms, medida contra o app Swift original no spike (ainda não medida).
- [ ] **VoiceOver**: notas e resultados anunciados em `aria-live`.
- [ ] **Tutorial no celular real**: o passo de montar acorde funciona com o teclado na tela e com o toque em várias teclas.
