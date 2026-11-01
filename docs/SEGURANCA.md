# Segurança do Keyz

Visão única de todas as proteções do projeto: o que existe, onde está configurado, por quê e como conferir. Atualizada em 2026-11-01.

O repositório é **público** de propósito (CI gratuito). Num repositório público, tudo que está nos arquivos, no histórico e nos workflows é visível. A proteção, então, tem dois eixos: **nunca colocar segredo no repositório** e **limitar o que alguém de fora consegue fazer** (rodar código, publicar, alterar a pipeline).

Como reportar uma vulnerabilidade: `SECURITY.md`. Como a pipeline de CI/CD funciona: `docs/PIPELINE.md`.

## Modelo de ameaças

| Ameaça | Proteção principal |
| --- | --- |
| Vazamento de credenciais (token da Cloudflare) | Secrets no GitHub, só no ambiente `production` e só para a `main`; secret scanning e bloqueio no push |
| PR ou fork malicioso tentando roubar secrets ou publicar | CI com `pull_request` (sem secrets), aprovação para PRs de fora, ambiente restrito à `main`, `release.yml` só no repositório original |
| Alteração da pipeline ou da `main` por terceiros (ou por engano) | Só PR na `main` com CI verde, `CODEOWNERS`, lista restrita de Actions |
| Ação de terceiros adulterada (supply chain) | Actions fixadas por SHA, lista permitida, Dependabot, lockfile congelado, `bun audit` |
| XSS, clickjacking, vazamento de dados no navegador | CSP restritiva e demais cabeçalhos HTTP |
| Abuso de permissões do navegador (câmera, localização…) | `Permissions-Policy` |
| Vulnerabilidade divulgada em público antes da correção | Denúncia privada habilitada |
| Dados do usuário | O app não tem backend, contas nem analytics; o áudio nunca sai do aparelho |

## 1. Aplicação (site publicado)

### 1.1 Cabeçalhos HTTP — `public/_headers`

Servidos pela Cloudflare Pages em todas as rotas (`/*`).

| Cabeçalho | Valor | Para quê |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'self'`; `script-src 'self'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data:`; `media-src 'self' blob:`; `worker-src 'self'`; `connect-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'none'`; `frame-ancestors 'none'`; `upgrade-insecure-requests` | Só carrega código e dados da própria origem; sem scripts inline ou de terceiros; sem plugins; sem envio de formulários; ninguém embute o app em iframe; força HTTPS nos subrecursos |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | O navegador só acessa por HTTPS por 1 ano. Sem `preload` (é irreversível; decidir antes de ter domínio próprio) |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isola a janela de outras origens (contra ataques de canal lateral e `window.opener`) |
| `Cross-Origin-Resource-Policy` | `same-origin` | Outras origens não podem carregar os recursos do app |
| `Permissions-Policy` | `microphone=(self)`, `midi=(self)`, `camera=()`, `geolocation=()`, `payment=()` | Microfone e MIDI só na própria origem; câmera, localização e pagamento bloqueados |
| `Referrer-Policy` | `no-referrer` | Não vaza a URL para outros sites |
| `X-Content-Type-Options` | `nosniff` | Impede o navegador de adivinhar o tipo do arquivo |
| `X-Frame-Options` | `DENY` | Reforço de `frame-ancestors` para navegadores antigos |
| `Cache-Control` (só `/assets/*`) | `public, max-age=31536000, immutable` | Arquivos com hash no nome, seguros para cache longo (não é de segurança, mas evita servir versão velha do HTML) |

Decisões e limites conhecidos da CSP:

- `style-src 'unsafe-inline'` existe porque o React aplica estilos inline (atributo `style`) e as animações usam variáveis CSS. Não permite **scripts** inline; o risco restante é de injeção de CSS, não de execução de código. Para remover, seria preciso migrar os estilos inline para classes ou usar nonce.
- `worker-src 'self'` (sem `blob:`): o Web Worker do microfone e o AudioWorklet vêm de arquivos da própria origem. Foi testado com microfone falso no teste abaixo.
- `media-src 'self' blob:` e `img-src ... data:` ficam por compatibilidade com o áudio e SVGs inline. Revisar se não forem mais necessários.
- Um recurso desconhecido no `Permissions-Policy` só gera aviso no console, mas o teste de CSP trata o aviso como falha (aconteceu com `bluetooth`).

**Verificação automática:** `e2e/csp.spec.ts` lê o `_headers` real, aplica no documento, liga um microfone falso e falha se houver qualquer violação de CSP, aviso de `Permissions-Policy` ou erro de página. Roda no CI.

**Verificação manual** (depois de um deploy):

```sh
curl -sI https://keyz-9ir.pages.dev | grep -iE "content-security|strict-transport|cross-origin|permissions|referrer|x-frame|x-content"
```

### 1.2 Roteamento — `public/_redirects`

`/* /index.html 200`: o SPA responde em qualquer rota. Não há rota de servidor para atacar.

### 1.3 Dados e privacidade

- Sem servidor próprio, banco de dados, contas, cookies ou analytics.
- O único armazenamento é o `localStorage` (ajustes e melhores marcas). Tudo que é lido de lá passa por validação com Zod e, se for inválido, cai no padrão (`shared/src/schemas`).
- Mensagens MIDI também passam por validação Zod antes de chegarem à aplicação.
- O microfone só liga depois de um gesto do usuário e de uma explicação; o áudio é analisado no aparelho (AudioWorklet + Web Worker) e nunca é enviado.
- Zero dependência de rede em tempo de execução: nenhuma fonte, CDN ou script externo (por isso `connect-src 'self'`).
- **Exceção única, por ação explícita**: o relatório de problema. Só sai quando a pessoa clica em "Enviar", depois de ver o contexto anexado, e vai para `POST /api/reportar` no próprio domínio (`connect-src 'self'` basta). Nunca inclui áudio, notas tocadas ou ajustes além de tema e tamanho da tela. A issue resultante é pública.

### 1.5 Endpoint de relatórios — `functions/api/reportar.ts`

Cria issues no repositório em nome do app, então é a única superfície com escrita.

- **Token**: fine-grained, só no repositório `keyz`, só permissão *Issues: Read and write*. Segredo do Cloudflare Pages (`GITHUB_TOKEN`), nunca no GitHub Actions, no código nem no navegador. O repositório vem de `GITHUB_REPO`.
- **Entrada**: só `POST` com `Origin` igual ao do site, corpo ≤ 16 KB, schema Zod do catálogo, campos com tamanho máximo, tipo e campos desconhecidos recusados, isca contra robôs.
- **Saída**: menções (`@usuario`) e comentários HTML são neutralizados; o conteúdo entra como texto. Falha do GitHub vira mensagem genérica (sem vazar detalhe).
- **Limite de taxa: opcional, depende do plano.** O endpoint em si **não limita requisições**; isso é feito (se for possível) na Cloudflare, e hoje não há garantia de que seja:
  - O plano grátis inclui 1 regra de *Rate limiting* (*Security › WAF › Rate limiting rules*), mas, segundo fontes não oficiais, só com janela de 10 segundos. Dá para limitar rajadas (ex.: 3 requisições por 10 s por IP em `POST /api/reportar`), não volume ao longo de minutos. Conferir os limites no painel.
  - Regras de WAF parecem valer só para **domínio próprio** na Cloudflare, não para `*.pages.dev`. Sem domínio próprio, esta regra provavelmente não pode ser criada.
  - O "WAF de conta" que a Cloudflare oferece como add-on é Enterprise e **não** é necessário nem relevante aqui.
- **Alternativa gratuita e que funciona em `pages.dev`**: Cloudflare Turnstile (captcha sem atrito). Exige a chave do site no formulário, verificar o token no endpoint e liberar `challenges.cloudflare.com` no CSP (`script-src` e `frame-src`). Fica como próximo passo se houver abuso.
- **Risco aceito por enquanto**: o abuso máximo é encher o repositório de issues. O token só cria issues (não lê código nem altera nada), as issues se fecham em lote com `gh issue close`, e o GitHub tem limites próprios de criação. Se acontecer: revogar o token, ou ligar o Turnstile.

### 1.4 Dependências

- `bun install --frozen-lockfile` no CI e no deploy: o build falha se o lockfile estiver desatualizado.
- `bun audit --audit-level=high` no CI e no deploy: vulnerabilidade alta ou crítica conhecida barra o pipeline.
- Dependabot (`.github/dependabot.yml`): PRs semanais para as dependências (agrupando atualizações menores) e para as Actions. Alertas e correções automáticas de segurança do Dependabot estão ligados no repositório.

## 2. Pipeline (GitHub Actions)

### 2.1 Princípio: menor privilégio

| Medida | Onde |
| --- | --- |
| Token padrão do Actions é **só leitura** | Configuração do repositório (`default_workflow_permissions=read`) |
| Cada workflow declara `permissions: contents: read`; só o job `release-please` ganha `contents: write` e `pull-requests: write` | `.github/workflows/*.yml` |
| `persist-credentials: false` no checkout: o token não fica salvo no `.git` | `ci.yml`, `release.yml` |
| Timeouts em todos os jobs e `concurrency` para não empilhar execuções | `.github/workflows/*.yml` |
| O deploy testa e audita de novo antes de publicar | `release.yml` (job `deploy`) |

### 2.2 Cadeia de suprimentos das Actions

- **Fixadas por SHA** do commit (com o número da versão em comentário), não por tag: uma tag pode ser movida para código malicioso; um SHA não.
- **Lista permitida** (Configurações › Actions): só as Actions do próprio GitHub (`actions/*`) e `oven-sh/setup-bun`, `googleapis/release-please-action` e `cloudflare/wrangler-action`. Qualquer outra Action, mesmo numa alteração de workflow, não executa.
- O Dependabot propõe as atualizações de SHA. **Atualizações maiores (ex.: v4→v7) precisam ser avaliadas antes de mergear** (roteiro em `docs/FLUXO.md`).

### 2.3 Injeção por conteúdo não confiável

Títulos de PR e de issue são texto controlado por quem está de fora. Nenhum workflow interpola `${{ github.event.* }}` dentro de um `run:`. O `pr-title.yml` passa o título por **variável de ambiente** e valida com `grep`, nunca interpolado no script.

### 2.4 PRs e forks

- O CI usa o evento `pull_request` (e nunca `pull_request_target`): PRs de fork rodam **sem acesso a secrets** e com token só-leitura.
- **Aprovação obrigatória** para PRs de qualquer colaborador externo (`all_external_contributors`): o código de um fork só executa depois que o dono aprovar.
- O `release.yml` (release e deploy) tem a condição `github.repository == 'alsantosrafael/keyz'`: forks com Actions ligado não abrem PR de release nem tentam publicar.

## 3. Segredos e deploy

### 3.1 Onde ficam

| Segredo | Onde | Quem lê |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret do ambiente `production` | Só o job `deploy`, só em execuções na `main` |
| `CLOUDFLARE_ACCOUNT_ID` | Secret do ambiente `production` | Idem |

Nenhum segredo no repositório, no código, no histórico ou nos logs (o GitHub mascara os valores dos secrets). Procedimento de criação, teste e rotação: `docs/DEPLOY-SECRETS.md`.

### 3.2 O token da Cloudflare

- **Permissão única:** `Account › Cloudflare Pages › Edit`, restrita a uma conta. Não lê DNS, não mexe em domínios nem em outros produtos.
- Pode ser revogado ou rotacionado a qualquer momento no painel (*Roll*).
- Sem filtro de IP, porque os servidores do GitHub mudam de endereço. A mitigação é o escopo mínimo e a rotação.

### 3.3 Ambiente `production`

- **Restrição de branch:** só a `main` pode usar o ambiente. Uma execução em outra branch não recebe os secrets.
- Não há aprovação manual no ambiente: o controle humano é **mergear o PR de release**, que é quem decide quando publicar.

### 3.4 Deploy só depois de uma Release

O job `deploy` só roda quando o release-please cria uma versão (ou por disparo manual de quem tem permissão de escrita, com `redeploy`). Um push comum em `main` não publica.

## 4. Repositório (GitHub)

### 4.1 Ruleset `proteger-main`: a `main` só recebe alterações por Pull Request

Ativo na branch padrão. **Ninguém dá push direto na `main`, nem o dono.** Toda mudança (inclusive de documentação e a do release-please) entra por PR.

| Regra | Efeito |
| --- | --- |
| `pull_request` | Push direto é barrado; só se entra por PR. Revisões exigidas: 0 (há um único mantenedor, que não consegue aprovar o próprio PR). Conversas precisam estar resolvidas |
| `required_status_checks`: `test`, `e2e`, `title` | O PR só mergeia com testes, e2e e título válido (Conventional Commits) verdes |
| `non_fast_forward` | Sem force-push: o histórico não é reescrito |
| `deletion` | A `main` não pode ser apagada |
| `required_linear_history` | Histórico linear (casa com o merge só por squash) |

**Bypass:** a função *admin* (o dono) pode ignorar os requisitos **somente ao mergear um PR** (modo `pull_request`), nunca para dar push direto. Existe por uma razão concreta: o PR de release criado pelo release-please usa o `GITHUB_TOKEN`, e PRs criados assim **não disparam o CI**, então `test`, `e2e` e `title` nunca ficam verdes nele. Para lançar, o dono mergeia esse PR com *Merge without waiting for requirements to be met*. Em qualquer outro PR, espere o CI verde.

Fluxo de trabalho:

```sh
git switch -c fix/descricao-curta
# ...commits no formato Conventional Commits...
git push -u origin fix/descricao-curta
gh pr create --fill   # o TÍTULO do PR vira o commit na main (squash), então precisa ser tipo(escopo): descrição
```

Se entrarem mais mantenedores: subir as revisões exigidas para 1 e ligar *Require review from Code Owners*.

### 4.2 `CODEOWNERS`

Pipeline (`.github/`), cabeçalhos (`public/_headers`), `wrangler.toml`, `SECURITY.md` e `LICENSE` têm o dono como responsável. Passa a bloquear mudanças nesses arquivos quando a revisão de Code Owners for exigida (4.1, "Se entrarem mais mantenedores").

### 4.3 Merge e histórico

- Só **squash merge**; o título do PR vira o commit (por isso `pr-title.yml` exige Conventional Commits, que também alimentam o SemVer).
- Merge commit e rebase desativados; a branch do PR é apagada após o merge.

### 4.4 Varredura e alertas

| Recurso | Estado |
| --- | --- |
| Secret scanning | Ligado |
| **Push protection** (bloqueia o push de tokens conhecidos) | Ligado |
| Alertas do Dependabot | Ligados |
| Correções automáticas de segurança do Dependabot | Ligadas |
| **Denúncia privada de vulnerabilidade** | Ligada (*Security › Report a vulnerability*) |

### 4.5 Acesso

Só o dono tem acesso de escrita; não há outros colaboradores, deploy keys nem webhooks (conferido em 2026-11-01). Contribuições externas entram apenas por PR de fork.

### 4.6 Contribuição organizada

`CONTRIBUTING.md`, modelos de issue (formulário de bug e de ideia, **issues em branco desativadas**) e modelo de PR com checklist (inclui "sem segredos"). O link de contato dos modelos aponta para a denúncia privada, não para issue pública.

### 4.7 Higiene de arquivos

O `.gitignore` bloqueia `.env`, `.env.*`, `.dev.vars`, `.wrangler/`, artefatos de build do web e do Swift (`.build/`, `xcuserdata/`, `DerivedData/`) e `.claude/settings.local.json`.

## 5. Licença

MIT (`LICENSE`). Cobre o código do Keyz. Arquivos de terceiros em `.claude/skills/` mantêm as licenças originais.

## 6. Como conferir tudo (comandos)

```sh
R=alsantosrafael/keyz
gh api repos/$R/rulesets --jq '.[]|{name,enforcement}'                # ruleset da main
gh api repos/$R/environments/production --jq .deployment_branch_policy # ambiente só na main
gh api repos/$R/actions/permissions/workflow                           # token só-leitura
gh api repos/$R/actions/permissions/selected-actions                   # lista de Actions permitidas
gh api repos/$R/actions/permissions/fork-pr-contributor-approval       # aprovação de PRs de fora
gh api repos/$R --jq .security_and_analysis                            # secret scanning, push protection
gh api repos/$R/private-vulnerability-reporting --jq .enabled          # denúncia privada
gh secret list --env production --repo $R                              # só os nomes dos secrets
bun audit --audit-level=high                                           # dependências
```

## 7. O que NÃO está protegido (lacunas conhecidas)

Registrado de propósito, para não parecer que está resolvido.

| Lacuna | Risco | O que fazer |
| --- | --- | --- |
| **2FA** no GitHub e na Cloudflare | Conta sequestrada anula todo o resto | Ligar 2FA (de preferência com chave de segurança ou passkey). É a proteção mais importante e só o dono pode ativá-la |
| Aprovação de revisor nos PRs | Hoje o PR é obrigatório, mas exige 0 aprovações (um mantenedor só) | Exigir 1 aprovação e Code Owners quando houver mais de um mantenedor |
| PRs do Dependabot de versão maior | Quebra da pipeline ou código novo não revisado | Avaliar um a um, conforme o roteiro de `docs/FLUXO.md` |
| E-mail do autor nos commits | `rafael.profeng@gmail.com` está público no histórico | Usar o e-mail `noreply` do GitHub nos próximos commits; reescrever o histórico só se for realmente necessário |
| `.claude/skills` (terceiros) no repositório | Licença e superfície desnecessária | Remover do repositório e ignorar a pasta |
| `style-src 'unsafe-inline'` | Injeção de CSS | Migrar estilos inline para classes ou usar nonce |
| Sem HSTS `preload` | Primeiro acesso por HTTP ainda é possível | Considerar só com domínio próprio |
| Token da Cloudflare sem filtro de IP e sem expiração obrigatória | Token roubado vale até ser revogado | Definir TTL no token e rotacionar periodicamente |
| `/api/reportar` sem limite de taxa garantido | Alguém pode encher o repositório de issues falsas; o WAF grátis é limitado e pode não valer em `pages.dev` | Regra de rajada, se o plano e o domínio permitirem (1.5); caso contrário, Turnstile |
| Sem DDoS dedicado | Site estático; a Cloudflare já absorve volume | Avaliar regras da Cloudflare se houver abuso |
| Sem SAST (CodeQL) e sem SBOM | Falhas de código não detectadas automaticamente | Ligar o *code scanning* do GitHub (gratuito em repositório público) |
| Os testes do deploy só rodam no GitHub | Deploy manual (`bun run deploy`) pula os testes | Preferir a pipeline; o deploy manual é só emergência |

## 8. Se algo der errado

| Situação | Ação |
| --- | --- |
| Token da Cloudflare vazou (chat, commit, log) | **Primeiro:** *Roll* do token na Cloudflare. Depois: atualizar o secret (`docs/DEPLOY-SECRETS.md`, passo 6) e investigar o vazamento. Apagar o commit não adianta: o histórico público já foi copiado |
| Suspeita de deploy indevido | Revogar o token; conferir *Actions › Release* e os *Deployments* da Cloudflare; republicar a última versão boa (*Run workflow* com `redeploy`) |
| PR suspeito de fork | Não aprovar a execução do CI; fechar; se tiver tentado exfiltrar secrets, trocar o token por precaução |
| Vulnerabilidade reportada | Responder no aviso privado, corrigir, lançar a versão e só então divulgar |
