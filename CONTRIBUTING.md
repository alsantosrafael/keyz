# Contribuindo

Obrigado por ajudar! O projeto fala português do Brasil (interface, docs e commits).

## Começando

```sh
bun install --frozen-lockfile
bun run dev
bun run test && bun run build
```

Antes de mexer em UI, leia `docs/DESIGN.md`. Antes de mexer em arquitetura ou em um modo, leia `docs/ARQUITETURA.md` e `docs/MODOS.md`. Dúvidas de produto vão para `docs/QUESTOES.md`.

## Pull requests

1. Faça um fork e abra o PR contra `main` (a `main` não aceita push direto de ninguém, nem do mantenedor).
2. O **título do PR** precisa seguir [Conventional Commits](https://www.conventionalcommits.org/pt-br/), porque o merge é por squash e a versão (SemVer) sai dele: `feat(livre): ...`, `fix(desafio): ...`, `docs: ...`.
3. O CI roda testes, build, e2e e auditoria. PRs de fora esperam aprovação do mantenedor para rodar.
4. Não inclua segredos. Os deploys acontecem só pela pipeline do repositório principal, depois de uma Release.

## Issues

Use os modelos. Vulnerabilidades: veja `SECURITY.md`, não abra issue pública.
