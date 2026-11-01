# Configurar os secrets do deploy (Cloudflare → GitHub)

A pipeline (`.github/workflows/release.yml`) publica na Cloudflare Pages usando dois secrets guardados no ambiente **`production`** do GitHub:

| Secret | O que é |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Token de API com permissão só para editar o Pages |
| `CLOUDFLARE_ACCOUNT_ID` | Identificador da sua conta Cloudflare (não é segredo forte, mas fica junto) |

Faça uma vez. Tempo: uns 5 minutos.

> **Regra de ouro:** o token nunca vai para o chat, para um arquivo do repositório, para um commit ou para uma issue. Ele só entra no GitHub pelo comando do passo 3, que lê o valor escondido.

## Pré-requisitos

- `gh` logado: `gh auth status` (conta `alsantosrafael`).
- Acesso à conta Cloudflare onde o projeto Pages `keyz` foi criado.
- O ambiente `production` já existe no repositório (foi criado e restrito à branch `main`).

## 1. Criar o token na Cloudflare

1. Abra <https://dash.cloudflare.com/profile/api-tokens>.
2. **Create Token** → em *Custom token* clique em **Get started**.
3. Preencha:
   - **Token name:** `keyz-github-deploy`
   - **Permissions:** uma única linha: `Account` → `Cloudflare Pages` → `Edit`
   - **Account Resources:** `Include` → `Specific account` → escolha a sua conta
   - **Client IP Address Filtering:** deixe em branco (os servidores do GitHub mudam de IP)
   - **TTL:** opcional. Se definir uma data de fim, anote para renovar (passo 6)
4. **Continue to summary** → confira que só aparece *Cloudflare Pages: Edit* → **Create Token**.
5. A Cloudflare mostra o token **uma única vez**. Deixe a aba aberta (você vai copiá-lo no passo 3). Se fechar sem copiar, crie outro.

Por que essa permissão: com ela o token só consegue publicar no Pages. Não lê DNS, não mexe em domínios nem em outros produtos.

## 2. Descobrir o Account ID

No terminal, na pasta do projeto:

```sh
bunx wrangler whoami
```

Na tabela, copie o valor da coluna **Account ID** (32 caracteres, letras e números). Alternativa: no painel, *Workers & Pages* → o ID aparece na barra lateral direita.

## 3. Guardar os dois secrets no GitHub

Rode **no seu terminal** (no Claude Code, com o prefixo `!`). O comando pede o valor e não mostra o que você cola:

```sh
gh secret set CLOUDFLARE_API_TOKEN --env production --repo alsantosrafael/keyz
gh secret set CLOUDFLARE_ACCOUNT_ID --env production --repo alsantosrafael/keyz
```

Em cada um: cole o valor, pressione Enter. A saída esperada é `✓ Set Actions secret ... for production`.

## 4. Conferir

```sh
gh secret list --env production --repo alsantosrafael/keyz
```

Devem aparecer os dois **nomes** (o GitHub nunca mostra os valores):

```
CLOUDFLARE_ACCOUNT_ID  ...
CLOUDFLARE_API_TOKEN   ...
```

## 5. Testar o deploy

Sem esperar uma release, republique a versão atual:

1. GitHub → **Actions** → **Release** → **Run workflow**.
2. Branch `main`, marque **redeploy** → **Run workflow**.
3. O job `deploy` precisa terminar verde. No fim ele mostra a URL; abra <https://keyz-9ir.pages.dev> e confira.

(Ou pelo terminal: `gh workflow run release.yml --repo alsantosrafael/keyz -f redeploy=true` e acompanhe com `gh run watch`.)

A partir daí o deploy é automático: acontece sempre que você mergeia o PR de release.

## 6. Renovar ou trocar o token

Faça quando o token expirar, quando mudar de máquina por segurança ou se suspeitar de vazamento:

1. Cloudflare → *API Tokens* → ao lado de `keyz-github-deploy` → **Roll** (gera um valor novo e invalida o antigo).
2. Repita só o primeiro comando do passo 3 com o valor novo.
3. Rode o teste do passo 5.

**Se o token vazou** (colado em chat, commit, log): faça o *Roll* na hora, antes de qualquer outra coisa. O GitHub também bloqueia pushes que contenham tokens conhecidos (secret scanning), mas não confie só nisso.

## Problemas comuns

| Sintoma no job `deploy` | Causa provável | O que fazer |
| --- | --- | --- |
| `Authentication error [code: 10000]` | Token errado, expirado ou sem a permissão do Pages | Refaça o passo 1 e o passo 3 |
| `Project not found [code: 8000007]` | Nome do projeto errado no `--project-name` (o **nome** do projeto é `keyz`; `keyz-9ir` é só o prefixo do domínio `keyz-9ir.pages.dev`) **ou** `CLOUDFLARE_ACCOUNT_ID` de outra conta | Confira com `bunx wrangler pages project list` (coluna *Project Name*) e o passo 2 |
| O job fica "Waiting" ou falha antes de ler o secret | Rodou fora da `main` (o ambiente só libera a `main`) | Rode o workflow na `main` |
| Secrets ausentes (`secrets.CLOUDFLARE_API_TOKEN` vazio) | Foram criados no repositório, não no ambiente `production` | Refaça o passo 3 com `--env production` |
| Job `deploy` é pulado | Não houve release nova e `redeploy` estava desmarcado | É o esperado; mergeie o PR de release ou use o passo 5 |

## Para entender o que protege isso

- Só a branch `main` acessa o ambiente `production`; PRs de forks nunca recebem os secrets.
- O `release.yml` só roda no repositório original.
- O token só edita o Pages e pode ser revogado a qualquer momento no painel da Cloudflare.
