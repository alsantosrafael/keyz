# Observabilidade

Doc durável. Diz **o que** o Keyz registra, **o que nunca** registra, **como** depurar com esses registros e **como** adicionar um registro novo. Simples de propósito: o projeto roda no plano free da Cloudflare, com teto compartilhado de 100.000 requests por dia.

## O que é registrado

Todo registro é **uma linha JSON** no `console`, com `ts` (ISO 8601). Não há destino persistente (ver "Depurar").

**Servidor** (`functions/_lib/log.ts`, função `registrar`). Sem amostragem: tudo que o código registra sai.

| Evento | Quando | Campos principais |
| --- | --- | --- |
| `report.submit` | Uma linha por `POST /api/reportar` | `outcome` (`ok`, `rejected`, `error`), `status`, `motivo`, `campo`, `issue`, `type`, `github_status`, `github_mensagem`, `github_erro`, `deploy` |
| `client.rejected` | Recusa de `POST /api/eventos` | `motivo`, `status`, `deploy` |

Motivos de `report.submit`: `method`, `origin`, `config`, `too_large`, `bad_json`, `honeypot`, `schema`. Em falha do GitHub, `github_mensagem` vem sanitizada e com no máximo 160 caracteres.

**Navegador** (`src/application/telemetry.ts`, enviado a `POST /api/eventos`, um evento por requisição). O servidor valida com Zod e registra `{ ...attrs, evento, outcome, deploy }`.

| Evento | `outcome` | Atributos |
| --- | --- | --- |
| `app.error` | `error` | `kind` (`render`, `window_error`, `unhandled_rejection`), `error.name`, `error.message` |
| `input.failure` | `error` | `source` (`mic` ou `midi`), `stage` (`request`, `worker`, `track_ended`), `error.name`, `error.message` |
| `storage.invalid` | `rejected` | `key` (nome da chave), `action` (`reset_to_default`) |

Todo evento do navegador traz também `attrs.version` (versão do app, de `package.json`). `outcome: error` sai como erro no console; `rejected`, como aviso.

## Privacidade

**Nunca** registrado: áudio, notas tocadas, texto digitado, conteúdo do relatório (título, campos, contato), nome de dispositivo MIDI ou de microfone, token, corpo da requisição, valor salvo em armazenamento e identificador de pessoa.

- URLs são trocadas por `[url]` e sequências de 6 ou mais dígitos por `[n]` (`sanitizeTelemetryText` em `shared/src/telemetry`).
- `Sec-GPC` e `Do Not Track` desligam o envio do navegador (`SemTelemetria`). O servidor ainda registra o que é inerente ao próprio relatório (recusas e status do GitHub).
- Não há analytics de uso. Ver `docs/SEGURANCA.md` §1.3.

## Cota

- **Teto compartilhado**: 100.000 requests por dia no plano free, somando Pages Functions e Workers. Cada `POST` de `/api/eventos` ou `/api/reportar` é 1 request.
- **Navegador**: no máximo 5 envios por sessão (`MAX_ENVIOS_POR_SESSAO`), sem fila, sem retry. Falha de rede descarta o evento.
- **Servidor**: escrever no `console` não custa request extra; só a invocação da Function que já aconteceu.
- Sem limite de taxa garantido em `/api/reportar` (ver `docs/SEGURANCA.md` §1.5). Rajada de requisições consome o teto.

## Como depurar

1. **Reproduzir com o mínimo.** Se o problema veio de produção, o relatório traz versão, modo e entrada no contexto.
2. **Abrir o tail antes de repetir a ação:**

   ```sh
   bunx wrangler pages deployment tail --project-name=keyz
   ```

   Filtre pelo evento, por exemplo `grep 'report.submit'` ou `grep 'app.error'`. Confirme o formato da saída antes de fixar um filtro.

3. **Limites do tail:** não persiste (quem não estava com ele aberto perde o evento); não mostra nada se a Function passar de ~100 req/s nos últimos 5 minutos; no máximo 10 observadores ao mesmo tempo.
4. **Ler a versão** para saber em que versão aconteceu. `attrs.version` (no evento do navegador) e `versao` (no servidor) vêm do mesmo `package.json`; `deploy` é o commit do servidor (7 caracteres).
5. **Escrever o teste que reproduz o evento antes de corrigir** (regra do `CLAUDE.md`).

**Pendente:** histórico. Workers Logs (persistente) pode não valer para projetos Pages, e a retenção no plano free não está confirmada. Até decidir, depuração é ao vivo. Ver o item em `docs/QUESTOES.md`.

## Como adicionar um registro

- **Servidor:** `registrar({ evento, outcome, ... })` de `functions/_lib/log.ts`, com nível `'error'` só em falha.
- **Navegador:** `services().telemetry.record(evento)`, com o evento montado por uma função pura em `src/application/telemetry.ts`. Nunca `console.*` solto em feature ou estado.
- **Novo nome de evento do navegador:** incluir em `CLIENT_EVENT_NAMES` (`shared/src/telemetry/index.ts`) e no tipo `ClientEvent` (`src/application/ports.ts`).
- **Teste junto:** o evento sai no formato certo e não vaza dado sensível (ver `functions/api/reportar.test.ts` e `src/application/telemetry.test.ts`).
- **Atualizar a tabela deste doc.**
- Atributos: chaves em inglês, `snake_case` (ponto para subcampo, como `error.name`). Valores planos: texto (≤ 200), número ou booleano. Máximo de 20 atributos por evento do navegador. Texto livre passa por `sanitizeTelemetryText`.

## Ligações

- Arquitetura e portas: `docs/ARQUITETURA.md`, seção "Observabilidade".
- Privacidade e cabeçalhos: `docs/SEGURANCA.md`.
- Pendências e decisões: `docs/QUESTOES.md`.
