# Auditoria do App de Escalas

Auditoria completa iniciada em 2026-09-26 sobre a branch
`claude/project-audit-refactor-deaa00` (base `8e46cc5`, versao 1.6.3).

Legenda de status: `ABERTO` · `RESOLVIDO` · `PROPOSTA` (precisa de decisao do
Fernando antes de mexer) · `ACEITO` (fica como esta, com justificativa).

---

## 1. Estado inicial (Fase 1)

| Verificacao | Resultado |
|---|---|
| `npm test` (testes unitarios, runner proprio) | 104 passaram, 0 falharam |
| `npm run smoke` (sintaxe de todos os `.js`) | 130/130 validos |
| Linter | **nao existe** |
| Formatter | **nao existe** (so `.editorconfig`) |
| Checagem de tipos | **nao existe** (JS puro, sem JSDoc sistematico) |
| Build | nao ha etapa de build: backend Node puro, frontend com `<script>` classicos sem bundler |
| Testes de rota / integracao com banco | **nao existem** (so o robo Playwright, que exige navegador e instancia) |
| `npm audit` | 2 vulnerabilidades transitivas (body-parser *low*, qs *moderate*), ambas com `npm audit fix` |
| Migrations | rodei o bootstrap 2x num SQL Server descartavel (`escalas-auditoria-db`, porta 14339): idempotentes, sem erro |

Como roda: `npm start` (Express na 4450) + SQL Server; `docker compose up -d --build`
sobe tudo. Os testes unitarios so usam builtins do Node (`tests/unit/run-tests.js`).

Tamanho: ~62 mil linhas. Os maiores focos sao `backend/services/escala.js`
(1949), `frontend/css/escala.css` (4370), `frontend/js/core/runtime/relatorio-mensal.js`
(1401) e `frontend/js/telas/lancamentos.js` (1294).

---

## 2. Achados

### CRITICO

**C1 — Exclusao definitiva de colaborador apaga metade do historico e depois falha** · `ABERTO`
`backend/routes/colaboradores.js:494-610`
- A cascata (plantoes, BancoHorasMovimentos, escala_dia, jornada, almocos,
  Ausencias, Colaboradores) roda **fora de transacao**, em `pool.request()` soltos.
- `hasTable(schema, 'BancoHorasSemanal')` (linha 574) e **sempre falso**:
  `BancoHorasSemanal` nao esta em `TRACKED_TABLES` (`backend/db/schema.js:4`).
  As linhas semanais nunca sao apagadas.
- `FolgasDomingo` (FKs `ColaboradorId` **e** `CobertoPorColaboradorId`) nao e tratada.
- Resultado: para qualquer colaborador com banco semanal ou folga de domingo, o
  `DELETE FROM Colaboradores` final estoura a FK **depois** de ja ter apagado
  movimentos, escala, jornada, almocos e ausencias — dano irreversivel.
- Tambem le **todos** os plantoes do banco e faz um UPDATE por linha (performance).
- Correcao: uma transacao; cobrir todas as tabelas filhas; limpar
  `CobertoPorColaboradorId` de folgas de terceiros; teste de integracao.

**C2 — Restaurar backup corrompe dados em silencio** · `ABERTO`
`backend/services/backup-service.js`
- `coerceBackupPayload` (≈linha 823) **nunca** preenche `TiposEscala`,
  `TipoEscalaDia` nem `FolgasDomingo`, mas `BACKUP_DELETE_ORDER` apaga essas
  tabelas: restaurar **zera** tipos de escala e folgas de domingo.
  (O commit `7ae88e0` corrigiu as listas, mas nao o normalizador.)
- `normalizeColaboradorRow` descarta `TipoEscalaId` → todo colaborador perde o vinculo.
- `normalizePlantaoRow` e a spec de `plantoes` omitem `tipo_plantao` e
  `tipo_credito` → os DEFAULTs do banco transformam **todo** plantao em
  `sabado`/`banco` (domingo, feriado e hora extra viram credito de sabado).
- `BancoHorasSemanal` e `BancoHorasSemanalNota` nao estao em nenhuma lista: com
  banco semanal preenchido, o `DELETE FROM Colaboradores` quebra na FK e a
  restauracao **inteira** falha (transacao desfaz, mas o recurso fica inutilizavel).
- `Colaboradores.Ativo`/`DataDesligamento` nao sao restaurados: desligados voltam ativos.
- Correcao: uma unica tabela de especificacao por tabela (colunas + normalizador +
  ordem), derivada de forma que tabela nova sem spec **quebre um teste**; teste de
  ida-e-volta backup→restore no banco de teste.

### ALTO

**A1 — Limite de forca bruta do login contornavel** · `ABERTO`
`backend/routes/auth.js:31-35`, `backend/server.js:320-324`
A chave do rate limit usa o primeiro valor de `X-Forwarded-For`, que o cliente
controla. Trocando o header a cada tentativa, o limite nunca dispara. Como o Map
nunca expira chaves que nao voltam, o mesmo truque faz o processo crescer em
memoria. Correcao: usar o IP do socket; so confiar em `X-Forwarded-For` com
`TRUST_PROXY` explicito (Express `trust proxy`); varredura periodica do Map.
Duplicacao: a funcao existe duas vezes (server e rota).

**A2 — Admin inicial pode nascer com senha que ninguem conhece** · `ABERTO`
`backend/auth/auth.js:268-290`
Com `ADMIN_PASSWORD` definida mas com menos de 8 caracteres, gera-se senha
aleatoria, porem `generated = !envPassword` = `false`: o log diz "senha definida
via ADMIN_PASSWORD", a senha real nunca e exibida e ninguem consegue entrar.
**Reproduzido** no banco de teste.

**A3 — Backup grava hashes de senha e tokens de sessao validos** · `ABERTO`
`backend/services/backup-service.js:423-437`
O export itera `REQUIRED_TABLES`, que inclui `Usuarios` e `Sessoes`. Qualquer
pessoa com leitura na pasta de backup obtem tokens de sessao em texto puro
(sequestro de sessao de admin) e hashes scrypt. Sessao nao e dado de negocio.
Correcao: excluir `Sessoes` do backup; manter `Usuarios` fora tambem (a
restauracao nunca os reinsere), ou tratar explicitamente — ver pergunta P3.

**A4 — XSS armazenado em varias telas** · `ABERTO`
Nome de colaborador/feriado/setor e descricao de alerta vao para `innerHTML` sem
escape, p.ex.: `frontend/js/core/app/ausencias-e-timeline.js:269`,
`core/app/modais-e-navegacao.js:91`, `core/app/feriados.js:184`,
`core/app/colaboradores.js:478`, `core/app/utilitarios.js:151-211`,
`telas/dashboard/alertas-e-graficos.js:100`. Um nome como
`<img src=x onerror=...>` executa no navegador de todo usuario (inclusive via
arquivo de backup restaurado). Correcao: escapar na interpolacao, com **um**
helper compartilhado (hoje ha 9 copias — ver M8).

**A5 — "Exportar Dados" + "Importar Dados" apagam quase tudo** · `ABERTO`
`frontend/js/core/app/configuracoes-tela.js:623` e `frontend/js/core/app.js:133`
"Exportar Dados" gera um arquivo `backup-escalas-AAAA-MM-DD.json` (mesmo nome dos
backups reais) so com colaboradores e ausencias. "Importar Dados" manda esse
arquivo para `/backup/restaurar`, que apaga **todas** as tabelas e so reinsere
essas duas: some plantao, feriado, setor, banco de horas, escala. Ha backup de
seguranca automatico antes, mas o fluxo e uma armadilha. Correcao proposta: o
export passa a baixar o backup completo do servidor — ver pergunta P2.

**A6 — `fetch` global remendado para reescrever `http://localhost:3000`** · `ABERTO`
`frontend/js/core/app.js:113-126`, `core/app/api-e-cores.js:26-36`
Varios arquivos chamam `fetch('http://localhost:3000/api/...')` (porta errada,
host fixo) e um monkey-patch no `window.fetch` reescreve a URL em tempo de
execucao (`ausencias-e-timeline.js:7`, `colaboradores.js:438`, `feriados.js:7,246`,
`colaboradores-e-jornada.js:560`). Correcao: usar `apiUrl()` direto e remover o patch.

**A7 — Troca de senha sem confirmar a senha atual** · `ABERTO`
`backend/routes/auth.js:109`
Uma sessao de admin sequestrada (ou um computador destravado) troca a senha e
tranca o dono fora. A troca tambem nao derruba as outras sessoes da conta.
Correcao: exigir `senhaAtual` (a tela precisa mandar) e revogar as demais sessoes.
Muda o contrato da rota → ver pergunta P4.

**A8 — Sem linter, formatter, checagem de tipos ou testes de rota** · `ABERTO`
Nenhum erro de rota, SQL ou transacao e pego antes de produção — C1 e C2 existem
exatamente por isso. Fase 2.

### MEDIO

**M1 — Deteccao de schema em tempo de execucao ja nao serve para nada** · `ABERTO`
`backend/db/schema.js` + ~130 usos (`hasColumn`, `hasTable`, `getBancoHorasCapabilities`)
O servidor so libera as rotas de dados (`schemaReady`) depois de aplicar
**todas** as migrations, entao toda coluna "opcional" sempre existe. Os ramos
`if (capabilities.hasX)` e os `saved.x === undefined` sao codigo morto que
triplica o tamanho das rotas — e causaram C1 (lista incompleta). Correcao
gradual: remover rota por rota com teste de integracao cobrindo.

**M2 — Mensagens de erro 500 vazam detalhe interno** · `ABERTO`
`backend/server.js:539-551`: qualquer erro nao tratado devolve `error.message`
cru (texto do SQL Server, nomes de tabela). Correcao: 500 com mensagem generica
e o detalhe so no log.

**M3 — Cookie malformado derruba a requisicao com 500** · `ABERTO`
`backend/auth/auth.js:393`: `decodeURIComponent` lanca `URIError` com `%` solto.

**M4 — Atualizacao de usuario nao e atomica** · `ABERTO`
`backend/routes/usuarios.js:93-190`: flags sao gravadas antes de validar
`novaSenha`; senha curta devolve 400 **depois** de ja ter mudado ativo/admin.

**M5 — Transacao depende de campo privado do mssql** · `ABERTO`
`backend/db/transactions.js:10` le `transaction._aborted`.

**M6 — Sem cabecalhos de seguranca** · `ABERTO`
Sem `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`,
`Referrer-Policy`. Limite de corpo JSON de 25 MB vale para **todas** as rotas
(so a restauracao de backup precisa).

**M7 — Controle de acesso por setor so no cadastro de colaboradores** · `PROPOSTA`
`getSetoresPermitidosRequest` e aplicado em colaboradores, escala e banco semanal,
mas `/api/ausencias`, `/api/plantoes`, `/api/banco-horas` e
`/api/colaboradores/:id/jornada-semanal` devolvem dados de todos os setores. O
comentario do codigo diz que filtrar a lista de colaboradores "ja limita as
telas" — verdade na interface, falso na API. Ver pergunta P1.

**M8 — Codigo duplicado** · `ABERTO`
- `escapeHtml` em 9 copias (`helpers.js:17`, `relatorio-mensal.js:13`,
  `banco-horas.js:114`, `configuracoes-usuarios.js:13`, `disponibilidade.js:14`,
  `escala-dia-shared.js:73`, `folgas-domingo.js:32`, `lancamentos.js:157`, `tipos-escala.js:34`).
- `getClientIp` 2x; `normalizeBoolean` 3x (`validation.js:190`,
  `database-config.js:53`, `backup-config.js:57`); `AUSENCIA_TIPOS` 2x.
- `POST` e `PUT /colaboradores/:id/jornada-semanal` identicos (`colaboradores.js:240-294`).

**M9 — Migrations rodam todas em todo boot, sem controle de versao** · `PROPOSTA`
`backend/db/database-schema.js:163`. Funciona porque todas sao idempotentes
(verificado), mas uma migration nao idempotente derrubaria o sistema em 503, e
o `ALTER COLUMN`/`DROP+ADD CONSTRAINT` sem guarda em
`2026-09-04-plantao-lancamentos.sql` revalida a tabela inteira a cada boot.
Proposta: tabela `SchemaMigrations` registrando o que ja rodou. Mexe no fluxo de
atualizacao da producao → pergunta P5.

**M10 — Backups nunca sao apagados** · `ABERTO`
Backup automatico a cada 180 min (padrao) mais um por desligamento, sem
retencao: ~8 arquivos/dia para sempre. Proposta: manter os N mais recentes (configuravel).

**M11 — `/trocar-senha` e `deveTrocarSenha` so no front** · `PROPOSTA`
O servidor nao impede uma conta com `deveTrocarSenha = 1` de usar a API.

**M12 — Botao "Resetar Sistema" promete o que nao faz** · `ABERTO`
`frontend/js/core/app/relatorios-export.js:2`: avisa "Isso ira apagar TODOS os
dados do sistema", pede para digitar RESET, e so faz `localStorage.clear()`
(tema e preferencias deste navegador). Correcao: texto honesto ("Restaurar
preferencias deste navegador"); a funcao continua.

**M13 — Container roda como root** · `ABERTO`
`Dockerfile`: sem `USER node`.

**M14 — Funcoes gigantes** · `ABERTO` (parcial)
Maiores: `renderConfiguracoes` (593 linhas), `gerarHtmlPdfRelatorioEscala` (562),
`gerarHtmlPdfRelatorioMensalExpandido` (469), `gerarTimelineVisualComAusencias`
(261), rotas `banco-horas-semanal /verificar` (174) e `/gerar-semana` (167),
`POST /plantoes` (162), `hydrateHistoricSourcesIntoEscala` (130).

**M15 — Arquitetura do frontend por monkey-patch** · `PROPOSTA`
`frontend/js/core/runtime/*` redefine globais de `core/app/*` com
`window.X = X = function ...` (heranca do antigo `runtime-fixes.js`). Ha versoes
"mortas" das funcoes originais que ninguem chama. Resolver de verdade e migrar
para modulos ES — mudanca estrutural grande → pergunta P6.

**M16 — `npm audit`: body-parser e qs** · `ABERTO` (`npm audit fix`).

**M17 — Plantao guarda colaboradores como JSON em texto** · `PROPOSTA`
`plantoes.colaboradores_ids` (NVARCHAR com array JSON): sem FK, exige ler a
tabela inteira para achar um colaborador (ver C1). O certo seria tabela de
ligacao `PlantaoColaborador`. Mudanca de banco → pergunta P5.

### BAIXO

**B1 — Codigo morto** · `ABERTO`
`testarConexaoBackend` (`conexao-backend.js`, URLs fixas na porta 3000),
`debugTiposAusencias` (`calendario-e-legenda.js:206`), rota `GET /api/test`
(`server.js:507`).

**B2 — 65 `console.log` de depuracao no frontend** · `ABERTO`
Ex.: `ausencias-e-timeline.js:6-52` loga cada ausencia recebida (dados pessoais no console).

**B3 — Versao fixa `'1.2.0'` nos metadados do backup/export** · `ABERTO`
`backup-service.js:441`, `configuracoes-tela.js:636` (o sistema esta na 1.6.3).

**B4 — Nome de variavel herdado de outra ferramenta** · `ABERTO`
`CODEX_BACKUP_INITIAL_DIRECTORY` em `backend/lib/folder-picker.js:19,38`.

**B5 — Comentario solto** · `ABERTO`
`backend/routes/auth.js:126-129`: o comentario de `verify-password` ficou em cima de `PUT /me/setores`.

**B6 — `scryptSync`/`spawnSync` bloqueiam o event loop** · `ABERTO`
Login (`auth.js:21,26`) e rotas de `/sistema` (`background-service.js:15`).

**B7 — Enumeracao de usuario por tempo de resposta no login** · `ABERTO`
Usuario inexistente responde sem rodar o scrypt (mais rapido).

**B8 — Filtros `LOWER(coluna) = @x` impedem uso de indice** · `ACEITO`
Tabelas pequenas; o collation padrao ja e case-insensitive. Nao vale o risco agora.

---

## 3. Perguntas abertas

- **P1** (M7): o teto de setores deve valer tambem na API de ausencias,
  plantoes e banco de horas? (Recomendo sim.)
- **P2** (A5): posso trocar o "Exportar Dados" para baixar o **backup completo**
  do servidor (mesmo formato do backup automatico)? O arquivo antigo, so com
  colaboradores e ausencias, deixaria de existir.
- **P3** (A3): tirar `Usuarios` do backup (contas nao seriam restauradas —
  hoje ja nao sao) ou mante-la e passar a restaurar as contas?
- **P4** (A7): exigir a senha atual para trocar a senha (muda a tela e a API)?
- **P5** (M9, M17): tabela de controle de migrations e tabela de ligacao
  plantao↔colaborador — mudancas de banco na producao.
- **P6** (M15): migrar o frontend para modulos ES (fim dos monkey-patches)?

---

## 4. Registro das correcoes

_(preenchido na Fase 3)_
