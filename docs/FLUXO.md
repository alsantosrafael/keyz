# Fluxo de trabalho: mudanças, releases e Dependabot

Como uma mudança vai do código até o site no ar, e como tratar os PRs do Dependabot. Atualizado em 2026-11-01. Contexto de segurança: `docs/SEGURANCA.md`. Segredos do deploy: `docs/DEPLOY-SECRETS.md`.

## Visão geral

```text
branch ──▶ Pull Request ──▶ CI verde ──▶ squash merge na main ──▶ PR de release (automático)
                                                                        │ você mergeia
                                                                        ▼
                                              tag vX.Y.Z + Release ──▶ deploy na Cloudflare Pages
```

Regras que valem sempre:

- A `main` **não aceita push direto**, nem do dono. Tudo entra por Pull Request.
- O **título do PR** vira o commit (squash) e precisa seguir Conventional Commits em português (`tipo(escopo): descrição`). Dele sai a versão SemVer e o CHANGELOG.
- Só uma Release publica. Um merge comum **não** altera o site no ar.

## 1. Fazer uma mudança

```sh
git switch main && git pull
git switch -c fix/anel-de-tempo          # prefixos: feat/ fix/ docs/ ci/ chore/ refactor/ perf/ test/
# ...edite, rode `bun run test` e `bun run build`...
git commit -m "fix(desafio): corrige o anel de tempo ao pausar"
git push -u origin fix/anel-de-tempo
gh pr create --fill                       # confira o TÍTULO: ele vira o commit na main
```

O CI roda sozinho no PR: `test` (auditoria, testes, build), `e2e` (Playwright) e `title` (valida o título). Os três precisam ficar verdes. Depois:

```sh
gh pr merge --squash --delete-branch      # ou o botão "Squash and merge"
```

Se o CI falhar, abra o log (`gh pr checks`, `gh run view --log-failed`), corrija na mesma branch e dê push; o CI roda de novo.

### Qual prefixo usar

| Prefixo | Versão | Quando |
| --- | --- | --- |
| `feat` | minor (0.2.0 → 0.3.0) | Comportamento novo para o usuário |
| `fix` | patch (0.2.0 → 0.2.1) | Correção de bug ou de segurança |
| `feat!` ou rodapé `BREAKING CHANGE:` | minor enquanto `0.x`; major depois | Mudança incompatível |
| `perf`, `refactor` | nenhuma até o próximo `feat`/`fix` | Aparecem no CHANGELOG |
| `docs`, `chore`, `ci`, `test`, `build` | nenhuma | Não aparecem (o changelog é mostrado ao usuário no app; mudanças internas ficam de fora) |

## 2. Lançar uma versão

1. Depois de cada merge na `main`, o workflow **Release** abre ou atualiza o PR **"chore(main): release X.Y.Z"**, com o `package.json` e o `CHANGELOG.md` novos. Se só houve `docs`/`ci`/`chore`, nenhum PR é criado.
2. Revise o PR: versão proposta e o CHANGELOG fazem sentido? Se a versão estiver errada, o problema está nos títulos dos PRs anteriores: corrija com um commit/PR novo, não editando o arquivo à mão.
3. **Mergeie o PR de release.** Como ele é criado pelo `GITHUB_TOKEN`, o CI não roda nele e os checks obrigatórios nunca ficam verdes. Use o bypass do admin: no PR, *Merge without waiting for requirements to be met*. É o único caso em que isso é esperado.
4. O merge cria a tag `vX.Y.Z` e a Release no GitHub. Em seguida o job `deploy` (ambiente `production`, só a `main`) instala, audita, testa, builda e publica na Cloudflare Pages.
5. Confira: *Actions › Release* verde, a versão no cabeçalho e em Ajustes ("Keyz vX.Y.Z"), as novidades da versão na folha *Novidades* (vêm do `CHANGELOG.md`, então bons títulos de PR viram um bom changelog) em <https://keyz-9ir.pages.dev> e, se mexeu em cabeçalhos, o `curl -sI` de `docs/SEGURANCA.md`.

Republicar a versão atual (sem nova release): *Actions › Release › Run workflow* com `redeploy` marcado.

### Se um deploy der errado

| Situação | O que fazer |
| --- | --- |
| O job `deploy` falhou (token, Wrangler…) | O site **continua na versão anterior**. Leia o log, corrija e rode `redeploy` |
| Foi para o ar uma versão com bug | **Rollback imediato:** Cloudflare › Workers & Pages › `keyz-9ir` › *Deployments* › deployment anterior › *Rollback to this deployment*. Depois corrija por PR (`fix:`) e lance uma nova versão |
| A versão nova precisa ser desfeita no código | `git revert` do commit em uma branch, PR com título `revert: ...`, e lance outra versão |

Nunca reescreva a `main` nem apague tags de versões já lançadas.

## 3. Dependabot

O Dependabot (`.github/dependabot.yml`) abre PRs semanais de duas famílias:

| Família | Prefixo do PR | Agrupamento |
| --- | --- | --- |
| Dependências do projeto (`bun`) | `chore(deps)` | Atualizações **menores e patch** em um só PR; cada **major** em PR próprio |
| Actions do GitHub | `ci(deps)` | `actions/*` em um só PR; `wrangler-action` e `release-please-action` em PRs separados (tocam a release e o deploy) |

Além disso, há os **alertas e PRs de segurança** (vulnerabilidade conhecida numa dependência), que chegam a qualquer momento. Esses têm prioridade sobre todo o resto.

### Regras

1. **Nunca mergear no escuro e nunca automatizar o merge.** Um PR de dependência é código de terceiros entrando no seu projeto, e Actions rodam com acesso ao deploy.
2. **CI verde é necessário, não suficiente.** O CI não exercita o deploy. Para o que toca release e deploy, leia as notas da versão.
3. **Um major por vez**, para saber de onde veio um problema.
4. **Segurança primeiro**, depois menores/patch, depois majors.
5. Se o PR está vermelho por algo que já foi corrigido na `main`, peça para o Dependabot **atualizar a base** (comentário `@dependabot rebase`) em vez de consertar na branch dele.

### Roteiro para cada PR

```sh
gh pr list --search "author:app/dependabot"       # fila
gh pr checks <n>                                  # CI desse PR
gh pr diff <n>                                    # só o que muda (package.json, lockfile ou workflow)
gh release view <tag> --repo <dono/repo>          # notas da versão (procure BREAKING e "runtime"/Node)
```

1. **Olhe o que mudou:** para npm, `package.json` e `bun.lock`; para Actions, o SHA e a versão. Desconfie de PR que mexe em mais coisa do que o título diz.
2. **Leia as notas da versão** (principalmente em major): mudança de runtime, de parâmetros, de comportamento padrão.
3. **CI verde?** Se estiver vermelho, veja se a causa é o PR ou a base antiga (`@dependabot rebase`).
4. **Classifique o risco** e aja conforme a tabela.
5. **Mergeie por squash** (título já vem no formato certo) ou feche com um motivo.

| Tipo de PR | Risco | Como tratar |
| --- | --- | --- |
| Segurança (alerta) | Depende da correção | Prioridade. Leia o aviso; atualize e lance um `fix:` |
| Menores/patch agrupados (`chore(deps)`) | Baixo | CI verde (`test` roda typecheck, testes e build; `e2e` roda o app) e merge |
| Major de biblioteca ou de ferramenta de build (React, Vite, TypeScript…) | Médio a alto | Branch local: `gh pr checkout <n>`, `bun install`, `bun run test && bun run build && bun run e2e`, abra o app (`bun run dev`) e confira |
| `actions/*` (checkout, upload-artifact…) | Baixo | Leia as notas: normalmente só muda o runtime (Node). Runners do GitHub já atendem |
| `release-please-action` | Médio | Depois do merge, confira se o PR "release X.Y.Z" continua sendo atualizado no próximo merge |
| `cloudflare/wrangler-action` | **Médio a alto**: publica em produção | Só roda no deploy, então o CI não prova nada. Depois do merge, rode **`redeploy`** na hora (é idempotente: republica a mesma versão) e confira o site. Se falhar, reverta o PR |

### Comandos do Dependabot (comentários no PR)

| Comentário | Efeito |
| --- | --- |
| `@dependabot rebase` | Atualiza a branch com a `main` e roda o CI de novo |
| `@dependabot recreate` | Recria o PR do zero (útil depois de conflito) |
| `@dependabot ignore this major version` | Para de propor essa versão major (use com um motivo no PR) |
| `@dependabot ignore this minor version` / `ignore this dependency` | Idem, mais amplo; evite para dependência de segurança |
| `@dependabot close` | Fecha sem mergear (ele pode propor de novo na próxima versão) |

### Quando há muitos PRs acumulados

1. **Aplique a ordem:** segurança → menores/patch → `actions/*` → majors, um por vez.
2. Faça o rebase de todos que estiverem vermelhos por base antiga antes de julgá-los.
3. Mergeie um de cada vez. Cada merge muda a `main`, então o CI do próximo precisa rodar sobre a base nova: o Dependabot atualiza a branch sozinho quando há conflito; nos outros casos, comente `@dependabot rebase` e espere o CI verde.
4. Para reduzir a fila no futuro: agrupar mais (já agrupamos `actions/*` e menores/patch) e reservar um horário semanal fixo para esvaziá-la.
5. Não deixe um major parado por meses: quanto mais velho, maior o salto e mais difícil a migração.
