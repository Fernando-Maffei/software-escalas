<!--
Modelo de Pull Request. Preencha o que fizer sentido e apague o resto —
e um apoio, nao burocracia.
-->

## O que muda

<!-- Uma ou duas frases em linguagem simples: o que passa a ser diferente
     para quem usa o sistema. -->

## Por que

<!-- O problema que motivou a mudanca. Se corrige um bug, descreva o
     comportamento errado; se e melhoria, o que estava incomodo. -->

## Como testar

<!-- O caminho para conferir na tela. Ex.: "Escala do Dia > escolher uma
     segunda-feira > abrir o painel de ajustes". -->

## Checklist

- [ ] `npm test` e `npm run smoke` passam localmente
- [ ] Mexi no backend? Entao reconstrui a imagem (`docker compose up -d --build`)
- [ ] Conferi na tela, e nao so no codigo
- [ ] Atualizei documentacao (README/CHANGELOG) se o comportamento mudou
