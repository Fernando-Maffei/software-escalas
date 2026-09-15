# Robo de testes

Um "usuario automatico" que abre o sistema no navegador, entra em cada tela do
menu e sai clicando, abrindo modais e preenchendo campos com dados aleatorios,
varias vezes seguidas, anotando tudo que quebra. Fica em `e2e/` e usa o
[Playwright](https://playwright.dev).

Ele conta como problema:

| Tipo         | O que e                                                              |
|--------------|----------------------------------------------------------------------|
| `erro-js`    | Excecao de JavaScript nao tratada na pagina                          |
| `console`    | `console.error` que nao veio logo depois de um erro de validacao     |
| `http-5xx`   | A API respondeu 500+ (erro no servidor ou no SQL)                    |
| `rede`       | Requisicao da API que caiu sem resposta                              |
| `tela-vazia` | A area principal ficou em branco                                     |
| `xss`        | Um texto digitado foi executado como HTML                            |

Resposta 4xx (ex.: "Nome e obrigatorio") **nao** e problema: com dado aleatorio
ela e esperada. Fica anotada em `avisos.json` no relatorio, junto com o
`console.error` de um erro que o app tratou e mostrou ao usuario, e com falhas
de servicos de fora do app (o calendario busca feriados em brasilapi.com.br).

## Onde ele roda

O robo cria, altera e exclui registros a esmo, entao **nunca roda na
producao**. A configuracao recusa a porta 4450 de proposito.

- **demo**: o modo demonstracao (`demo/`), sem backend nem banco. Sobe sozinho.
  Pega erro de tela e de JavaScript.
- **teste**: uma instancia Docker separada (`docker-compose.teste.yml`), com
  banco proprio, na porta 4460. Pega tambem erro de backend e de SQL. Antes do
  robo, ela recebe os dados de exemplo e roda os roteiros de `e2e/fluxos.spec.js`.

## Como usar

Primeira vez na maquina:

```bash
npm install
npx playwright install chromium
```

So a demo (rapido, nao precisa de Docker):

```bash
npm run e2e:demo
```

Com banco de verdade:

```bash
npm run teste:subir
npm run e2e:teste
npm run teste:derrubar
```

`teste:derrubar` apaga os containers **e o banco** de teste. Isso so afeta o
projeto `app-de-escalas-teste`; a producao (`app-de-escalas`) nao e tocada.

Relatorio com prints, passos e trace de cada problema:

```bash
npm run e2e:relatorio
```

### Mais intensidade

Por variavel de ambiente (PowerShell):

```powershell
$env:ROBO_ACOES="200"; $env:ROBO_RODADAS="3"; npm run e2e:demo
```

- `ROBO_ACOES`: acoes por tela (padrao 25)
- `ROBO_RODADAS`: quantas passadas por todas as telas (padrao 1)
- `ROBO_SEMENTE`: repete uma execucao anterior

### Reproduzir um problema

Cada falha traz a semente, os passos ate o erro e o comando para repetir
exatamente a mesma sequencia, por exemplo:

```powershell
$env:ROBO_SEMENTE="556099231"; $env:ROBO_ACOES="15"; npx playwright test --project=demo -g "rodada-1 relatorios$"
```

## Execucoes automaticas

- **CI (a cada PR)**: robo na demo com semente fixa (`ci.yml`, job `robo-demo`).
- **Toda noite, 03:00**: `robo-noturno.yml` sobe a instancia de teste na
  maquina do GitHub e roda demo + teste com 80 acoes e 3 rodadas, cada noite
  com uma semente nova. Falhou? O GitHub avisa por e-mail e o relatorio fica em
  *Actions > Robo noturno > artefato `relatorio-robo`*. Da para disparar na mao
  pelo botao *Run workflow*.

## O que o robo evita de proposito

Sair, trocar a senha, a configuracao do banco, pasta de backup, importar e
restaurar backup, resetar o sistema e seletores de arquivo. Sao acoes que
tirariam o proprio robo do ar ou abririam janelas do sistema operacional. A
lista fica em `SELETORES_BLOQUEADOS` e `TEXTO_BLOQUEADO` (`e2e/robo.spec.js`).

## Roteiros de ponta a ponta

Clique aleatorio acha o que *quebra*. Ele nao acha o dado que aparece *errado*,
como uma ausencia que nao entra na escala. Para isso existem os roteiros em
`e2e/fluxos.spec.js`: cada um faz um caminho completo e confere o resultado.
Ao corrigir um bug desse tipo, vale acrescentar um roteiro que o cubra.
