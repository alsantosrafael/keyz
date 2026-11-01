# Segurança

## Como reportar uma vulnerabilidade

Não abra uma issue pública. Use **Security › Report a vulnerability** neste repositório (aviso privado do GitHub). Responderemos assim que possível.

## O que o app faz e não faz

- É uma SPA estática: sem servidor próprio, sem contas, sem banco de dados e sem analytics.
- O áudio do microfone é analisado no aparelho e nunca é enviado.
- Os únicos dados guardados ficam no `localStorage` do navegador (ajustes e melhores marcas), validados com Zod ao ler.
- Cabeçalhos de segurança (CSP restritiva, HSTS, COOP/CORP, Permissions-Policy) ficam em `public/_headers`.

## Versões com suporte

Só a última versão publicada recebe correções.
