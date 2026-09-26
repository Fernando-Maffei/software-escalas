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

**C1 — Exclusao definitiva de colaborador apaga metade do historico e depois falha** · `RESOLVIDO`
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
- **Feito:** a cascata foi para `backend/services/exclusao-colaborador.js`, numa
  transacao so (`withTransaction`), com a lista explicita `TABELAS_FILHAS` (todas
  as FKs para Colaboradores, inclusive BancoHorasSemanal e FolgasDomingo). A
  referencia legada `CobertoPorColaboradorId` de folgas de terceiros vira NULL.
  O plantao e pre-filtrado por `LIKE` em vez de ler a tabela inteira, e a leitura
  do JSON da equipe virou `parseEquipePlantao` (antes duplicada). Testes de
  integracao: exclusao completa sem sobrar vinculo, e falha no meio sem apagar nada.

**C2 — Restaurar backup corrompe dados em silencio** · `RESOLVIDO`
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
- **Feito:** `backend/services/backup/especificacao.js` e a fonte unica (ordem das
  tabelas = ordem de insercao; exclusao = ordem inversa; colunas com tipo e
  apelidos do formato legado). `backup/normalizacao.js` normaliza qualquer
  tabela a partir da especificacao e guarda as regras de negocio que ja existiam
  (padroes de ausencia, validacao de jornada, tipos da escala). Backup antigo sem
  `tipo_plantao` tem o tipo derivado da data. Coluna ausente no arquivo deixa o
  DEFAULT do banco agir. `backup-service.js` caiu de 1055 para ~190 linhas.
- **Provas:** teste de ida-e-volta com as 14 tabelas preenchidas compara linha a
  linha antes/depois (passa; contra o codigo antigo falha com a FK de
  BancoHorasSemanal); teste que compara a especificacao com o
  `INFORMATION_SCHEMA` (coluna nova sem backup quebra o CI); 3 testes unitarios
  de compatibilidade.

### ALTO

**A1 — Limite de forca bruta do login contornavel** · `RESOLVIDO`
`backend/routes/auth.js:31-35`, `backend/server.js:320-324`
A chave do rate limit usa o primeiro valor de `X-Forwarded-For`, que o cliente
controla. Trocando o header a cada tentativa, o limite nunca dispara. Como o Map
nunca expira chaves que nao voltam, o mesmo truque faz o processo crescer em
memoria. Correcao: usar o IP do socket; so confiar em `X-Forwarded-For` com
`TRUST_PROXY` explicito (Express `trust proxy`); varredura periodica do Map.
Duplicacao: a funcao existe duas vezes (server e rota).
**Feito:** um helper so (`backend/lib/ip-cliente.js`) usa `req.ip`, e o Express so
confia em `X-Forwarded-For` com `TRUST_PROXY` explicito (documentado no
`.env.example`). O limitador varre chaves expiradas quando passa de 1000
entradas. Testes: integracao (6 tentativas trocando o header → 429) e unitarios.

**A2 — Admin inicial pode nascer com senha que ninguem conhece** · `RESOLVIDO`
`backend/auth/auth.js:268-290`
Com `ADMIN_PASSWORD` definida mas com menos de 8 caracteres, gera-se senha
aleatoria, porem `generated = !envPassword` = `false`: o log diz "senha definida
via ADMIN_PASSWORD", a senha real nunca e exibida e ninguem consegue entrar.
**Reproduzido** no banco de teste.
**Feito:** senha do `.env` curta e ignorada com aviso no log; a aleatoria e
marcada como gerada (aparece na tela/console) e exige troca no primeiro acesso.
Teste unitario com pool falso cobre os tres casos.

**A3 — Backup grava hashes de senha e tokens de sessao validos** · `RESOLVIDO`
`backend/services/backup-service.js:423-437`
O export itera `REQUIRED_TABLES`, que inclui `Usuarios` e `Sessoes`. Qualquer
pessoa com leitura na pasta de backup obtem tokens de sessao em texto puro
(sequestro de sessao de admin) e hashes scrypt. Sessao nao e dado de negocio.
Correcao: excluir `Sessoes` do backup; manter `Usuarios` fora tambem (a
restauracao nunca os reinsere), ou tratar explicitamente — ver pergunta P3.
**Feito:** o backup exporta so as tabelas da especificacao; `Usuarios` e
`Sessoes` ficaram de fora. Nenhuma funcionalidade se perdeu: a restauracao nunca
reinseriu contas. (Se um dia quiser restaurar contas, e a P3.) Teste de
integracao confere que o arquivo nao tem token de sessao nem hash de senha.

**A4 — XSS armazenado em varias telas** · `RESOLVIDO`
Nome de colaborador/feriado/setor e descricao de alerta vao para `innerHTML` sem
escape, p.ex.: `frontend/js/core/app/ausencias-e-timeline.js:269`,
`core/app/modais-e-navegacao.js:91`, `core/app/feriados.js:184`,
`core/app/colaboradores.js:478`, `core/app/utilitarios.js:151-211`,
`telas/dashboard/alertas-e-graficos.js:100`. Um nome como
`<img src=x onerror=...>` executa no navegador de todo usuario (inclusive via
arquivo de backup restaurado). Correcao: escapar na interpolacao, com **um**
helper compartilhado (hoje ha 9 copias — ver M8).
**Feito:** um unico `escapeHtml` (`frontend/js/lib/html-seguro.js`, ver M8) e escape
nos pontos que sobraram depois da limpeza de codigo morto: alerta e eventos do
dashboard, opcao de setor no cadastro e lista de feriados (os demais pontos da
lista original estavam em funcoes mortas, removidas no B1). **Prova no navegador**
(servidor de integracao com colaboradora chamada `<img src=x onerror=...>Maria` e
ferias daqui a 3 dias): com a correcao revertida o codigo executa no dashboard
(`window.__xss = 1`, 2 imagens injetadas); com a correcao, 0 execucoes nas 9
telas e o nome aparece como texto. `npm run integracao:servidor` sobe esse
cenario para conferir de novo.

**A5 — "Exportar Dados" + "Importar Dados" apagam quase tudo** · `ABERTO`
`frontend/js/core/app/configuracoes-tela.js:623` e `frontend/js/core/app.js:133`
"Exportar Dados" gera um arquivo `backup-escalas-AAAA-MM-DD.json` (mesmo nome dos
backups reais) so com colaboradores e ausencias. "Importar Dados" manda esse
arquivo para `/backup/restaurar`, que apaga **todas** as tabelas e so reinsere
essas duas: some plantao, feriado, setor, banco de horas, escala. Ha backup de
seguranca automatico antes, mas o fluxo e uma armadilha. Correcao proposta: o
export passa a baixar o backup completo do servidor — ver pergunta P2.

**A6 — `fetch` global remendado para reescrever `http://localhost:3000`** · `RESOLVIDO`
`frontend/js/core/app.js:113-126`, `core/app/api-e-cores.js:26-36`
Varios arquivos chamam `fetch('http://localhost:3000/api/...')` (porta errada,
host fixo) e um monkey-patch no `window.fetch` reescreve a URL em tempo de
execucao (`ausencias-e-timeline.js:7`, `colaboradores.js:438`, `feriados.js:7,246`,
`colaboradores-e-jornada.js:560`). Correcao: usar `apiUrl()` direto e remover o patch.
**Feito:** as chamadas usam `window.API` (o cliente que ja existia); os dois
remendos de `window.fetch` perderam a reescrita de URL. O de `api.js` ficou so com
o que tinha de legitimo — avisar a tela quando a sessao expira (401) — e foi
renomeado para `installSessionExpiryWatcher`. Verificado no navegador: criar
colaborador pelo editor, erro 404 chegando com a mensagem do servidor e o aviso
de sessao expirada.

**A7 — Troca de senha sem confirmar a senha atual** · `ABERTO`
`backend/routes/auth.js:109`
Uma sessao de admin sequestrada (ou um computador destravado) troca a senha e
tranca o dono fora. A troca tambem nao derruba as outras sessoes da conta.
Correcao: exigir `senhaAtual` (a tela precisa mandar) e revogar as demais sessoes.
Muda o contrato da rota → ver pergunta P4.

**A8 — Sem linter, formatter, checagem de tipos ou testes de rota** · `RESOLVIDO`
Nenhum erro de rota, SQL ou transacao e pego antes de produção — C1 e C2 existem
exatamente por isso. Fase 2.
**Feito:**
- **Testes de integracao** (`tests/integracao/`, `npm run test:integracao`): sobem
  o servidor de verdade contra um SQL Server descartavel (`npm run
  integracao:banco:subir`; trava que so aceita banco com "Integracao" no nome) e
  cobrem autenticacao, permissoes, colaboradores, lancamentos, folgas de domingo e
  backup — 24 testes. `npm run integracao:servidor` sobe o app com dados de
  exemplo na porta 4480 para conferencia no navegador.
- **ESLint 9** (`npm run lint`), sem nenhum erro no repositorio. No frontend os
  globais sao calculados a partir do proprio codigo, entao `no-undef` pega funcao
  inexistente (foi assim que A10 e A11 apareceram). As correcoes automaticas
  (`curly`, `no-var`) tiveram equivalencia provada por comparacao de AST.
- **Checagem de tipos** (`npm run typecheck`): TypeScript em modo `checkJs` no
  backend, scripts e testes, sem nenhum erro. Tipagem por JSDoc e por
  `backend/types/express.d.ts` (sem `any` nem supressoes). Pegou, alem do A10,
  `?search=` repetido derrubando duas rotas com 500.
- **Prettier** configurado (`npm run format`); aplicado so nos arquivos novos ate
  a decisao P7.
- `npm run verificar` roda sintaxe, lint, tipos, formatacao e unitarios; o CI roda
  isso e um job de integracao com SQL Server.

**A9 — Folga de domingo com reposicao sempre dava erro 500** · `RESOLVIDO`
`backend/services/folgas-domingo.js:249-252` (achado pelos testes de integracao)
Os horarios da reposicao iam como texto (`"08:00:00"`) para parametros
`sql.Time`; o driver tedious 19 so aceita `Date` e respondia "Invalid time".
Toda folga COM reposicao — o caso principal do plantonista — falhava.
**Feito:** `toSqlTime` nos quatro parametros, como no resto do backend. Teste de
integracao cria a folga com reposicao e almoco e confere a escala dos dois dias.

**A10 — Editar folga de domingo sempre dava erro 500** · `RESOLVIDO`
`backend/services/folgas-domingo.js` (achado pelo ESLint e pelo `tsc`)
`updateFolgaDomingo` existia mas nao era exportada; a rota `PUT
/api/folgas-domingo/:id` chamava `undefined(...)`. **Feito:** exportada; teste de
integracao edita a data de reposicao e confere que a escala acompanha.

**A11 — Funcoes chamadas que nao existem em lugar nenhum** · `RESOLVIDO`
`frontend/js/core/app/calendario-e-legenda.js:332,335` chama
`carregarAusenciasDoDia` e `configurarCamposHora`, que nenhum arquivo define,
dentro de `abrirModalAusencia` — que por sua vez usa um `#modal` que nao existe
mais no HTML. So nao explode porque `telas/calendar.js:309` so cai nesse caminho
se o modal novo nao existir. Codigo morto com bomba-relogio (achado pelo ESLint).
**Feito:** removidos `abrirModalAusencia` e o ramo impossivel de `calendar.js`;
junto sairam as referencias as duas funcoes inexistentes. O ESLint (que calcula
os globais a partir do codigo) nao acusa mais nenhum `no-undef` no frontend.

**A12 — Falha ao carregar dados vira tela vazia, sem aviso** · `RESOLVIDO`
`frontend/js/core/runtime/dados-e-modais.js:133-240` (achado na Fase 3)
Os carregadores de colaboradores, setores, ausencias, feriados e tipos de escala
fazem `catch { lista = [] }`: se a API cair ou der erro, a tela mostra "nenhum
colaborador/ausencia" como se fosse verdade, e o usuario pode tomar decisao de
escala em cima disso. Ha tambem `try { colaboradores = lista } catch { // ignore }`
em volta de atribuicoes que nunca lancam.
**Feito:** um tratador so, `falhaAoCarregar` em `dados-e-modais.js`, para os seis
carregadores (colaboradores, setores, tipos de escala, ausencias, feriados,
plantoes): registra no console, avisa o usuario por toast (no maximo uma vez a
cada 30 s por recurso; nunca em 401, que ja leva ao login) e **mantem os ultimos
dados carregados** em vez de esvaziar a tela. Os carregadores "originais"
passaram a propagar o erro para esse tratador. Sairam todos os
`catch { // ignore }` do frontend (7): os que envolviam atribuicoes que nao lancam
e os redundantes; o unico que ficou (fonte do PDF) diz por que e loga. Achado no
caminho: `core/app/colaboradores.js` e `carregarSetores` originais nunca rodavam
(sobrescritos no `window` por `telas/lancamentos.js` e pelo `runtime/`) —
removidos. Verificado no navegador simulando erro 500 e 401.

**A13 — Ausencia por horas no passado nao podia ser lancada** · `RESOLVIDO`
`backend/services/bancoHoras.js:18` (achado pelo roteiro golden master da Fase 3)
Colunas TIME voltam do banco como `Date` (01/01/1970), e `timeToMinutes` so
aceitava texto. Lancar uma ausencia por horas numa data passada (com desconto,
o padrao de "ausencia comum") dava 400 "Hora inicial invalido"; o mesmo calculo
roda no `/verificar` e no "gerar semana" do banco de horas semanal.
**Feito:** `timeToMinutes` converte o `Date` de coluna TIME antes de validar.
Testes unitario e de integracao (lanca 08:00–10:30 no passado, debita 150 min).

### MEDIO

**M1 — Deteccao de schema em tempo de execucao ja nao serve para nada** · `RESOLVIDO`
`backend/db/schema.js` + ~130 usos (`hasColumn`, `hasTable`, `getBancoHorasCapabilities`)
O servidor so libera as rotas de dados (`schemaReady`) depois de aplicar
**todas** as migrations, entao toda coluna "opcional" sempre existe. Os ramos
`if (capabilities.hasX)` e os `saved.x === undefined` sao codigo morto que
triplica o tamanho das rotas — e causaram C1 (lista incompleta). Correcao
gradual: remover rota por rota com teste de integracao cobrindo.
**Feito:** `backend/db/schema.js` (getSchemaInfo, hasTable, hasColumn,
getBancoHorasCapabilities, ensureXTable) foi removido. Rotas e servicos usam
listas fixas de colunas e INSERT/UPDATE diretos; o parametro `schema`, que so era
repassado de mao em mao, saiu de 35 funcoes (por AST, com o `tsc` conferindo a
aridade de cada chamada). `GET /banco-horas/status` devolve o mesmo JSON por
contrato. Backend ficou ~420 linhas menor. **Prova de equivalencia:** roteiro
golden master (`tests/integracao/golden-master.js`: 87 passos por todas as rotas
de dados + foto das 14 tabelas) identico antes e depois, conferido a cada arquivo
alterado; integracao, unitarios, lint e tipos verdes.

**M2 — Mensagens de erro 500 vazam detalhe interno** · `RESOLVIDO`
`backend/server.js:539-551`: qualquer erro nao tratado devolve `error.message`
cru (texto do SQL Server, nomes de tabela). Correcao: 500 com mensagem generica
e o detalhe so no log.
**Feito:** tratador extraido para `backend/lib/tratador-erros.js`: `AppError` e
erro 4xx exposto do Express mantem a mensagem; qualquer outro vira mensagem
generica, com o detalhe so no log. `ensurePositiveInt` passou a recusar valor
acima do INT do SQL Server (antes virava 500 no driver).

**M3 — Cookie malformado derruba a requisicao com 500** · `RESOLVIDO`
`backend/auth/auth.js:393`: `decodeURIComponent` lanca `URIError` com `%` solto.
**Feito:** cookie com escape invalido e ignorado (sessao ausente → 401). Testes
unitario e de integracao.

**M4 — Atualizacao de usuario nao e atomica** · `RESOLVIDO`
`backend/routes/usuarios.js:93-190`: flags sao gravadas antes de validar
`novaSenha`; senha curta devolve 400 **depois** de ja ter mudado ativo/admin.
**Feito:** a senha nova e validada antes de qualquer escrita, e flags, setores,
senha e revogacao de sessoes vao numa transacao so. Teste de integracao:
`ativo:false` + senha curta devolve 400 e o usuario continua ativo.

**M5 — Transacao depende de campo privado do mssql** · `RESOLVIDO`
`backend/db/transactions.js:10` le `transaction._aborted`.
**Feito:** `withTransaction` escuta o evento publico `rollback` do mssql para
saber se o servidor ja abortou; falha do rollback manual e logada (antes era
engolida) e o erro original e o que sobe.

**M6 — Sem cabecalhos de seguranca** · `RESOLVIDO`
Sem `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`,
`Referrer-Policy`. Limite de corpo JSON de 25 MB vale para **todas** as rotas
(so a restauracao de backup precisa).
**Feito:** `backend/lib/cabecalhos-seguranca.js` (nosniff, `X-Frame-Options:
SAMEORIGIN`, `frame-ancestors 'self'`, `Referrer-Policy: same-origin`) em toda
resposta; corpo JSON limitado a 1 MB, com 25 MB so em
`/backup/restaurar`. Testes de integracao dos cabecalhos e do 413. **Fica de
fora:** CSP de script — as telas usam `onclick` inline em muitos pontos; exigiria
`'unsafe-inline'`, que anula a protecao (ver M15).

**M7 — Controle de acesso por setor so no cadastro de colaboradores** · `PROPOSTA`
`getSetoresPermitidosRequest` e aplicado em colaboradores, escala e banco semanal,
mas `/api/ausencias`, `/api/plantoes`, `/api/banco-horas` e
`/api/colaboradores/:id/jornada-semanal` devolvem dados de todos os setores. O
comentario do codigo diz que filtrar a lista de colaboradores "ja limita as
telas" — verdade na interface, falso na API. Ver pergunta P1.

**M8 — Codigo duplicado** · `RESOLVIDO`
- `escapeHtml` em 9 copias (`helpers.js:17`, `relatorio-mensal.js:13`,
  `banco-horas.js:114`, `configuracoes-usuarios.js:13`, `disponibilidade.js:14`,
  `escala-dia-shared.js:73`, `folgas-domingo.js:32`, `lancamentos.js:157`, `tipos-escala.js:34`).
- `getClientIp` 2x; `normalizeBoolean` 3x (`validation.js:190`,
  `database-config.js:53`, `backup-config.js:57`); `AUSENCIA_TIPOS` 2x.
- `POST` e `PUT /colaboradores/:id/jornada-semanal` identicos (`colaboradores.js:240-294`).
**Feito:** um `escapeHtml` (`frontend/js/lib/html-seguro.js`, no lugar das 9
copias); um `getClientIp` (`backend/lib/ip-cliente.js`); um `normalizeBoolean`
(`lib/validation.js`, no lugar das copias de `database-config.js` e
`backup-config.js`); as listas de dominio (tipos e periodos de ausencia, tipos e
creditos de plantao) em `backend/lib/dominio.js` no lugar de ate 4 copias; a
leitura do JSON da equipe do plantao em `parseEquipePlantao`; e os handlers
identicos de `POST`/`PUT /colaboradores/:id/jornada-semanal` num so (as duas
rotas continuam). Golden master identico.

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

**M12 — Botao "Resetar Sistema" promete o que nao faz** · `RESOLVIDO`
`frontend/js/core/app/relatorios-export.js:2`: avisa "Isso ira apagar TODOS os
dados do sistema", pede para digitar RESET, e so faz `localStorage.clear()`
(tema e preferencias deste navegador). Correcao: texto honesto ("Restaurar
preferencias deste navegador"); a funcao continua.
**Feito:** a funcao continua (limpa o localStorage e recarrega), agora com o nome
"Limpar preferências deste navegador", sem o estilo de perigo, e com um aviso que
diz o que acontece de verdade (e que os dados do sistema nao sao apagados). O
"digite RESET" saiu: a acao nao destroi nada.

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

**M16 — `npm audit`: body-parser e qs** · `RESOLVIDO`.
**Feito:** `npm audit fix` (body-parser 2.3.0, qs 6.16.0); `npm audit` zerado.
Testes unitarios e de integracao passando com as versoes novas.

**M17 — Plantao guarda colaboradores como JSON em texto** · `PROPOSTA`
`plantoes.colaboradores_ids` (NVARCHAR com array JSON): sem FK, exige ler a
tabela inteira para achar um colaborador (ver C1). O certo seria tabela de
ligacao `PlantaoColaborador`. Mudanca de banco → pergunta P5.

### BAIXO

**B1 — Codigo morto** · `RESOLVIDO`
`testarConexaoBackend` (`conexao-backend.js`, URLs fixas na porta 3000),
`debugTiposAusencias` (`calendario-e-legenda.js:206`), rota `GET /api/test`
(`server.js:507`).
**Feito:** `scripts/analisar-codigo-morto.js` (`npm run analisar:codigo-morto`)
monta o grafo de chamadas das funcoes globais do front a partir do que executa
(codigo de topo, os dois index.html, a demo) e acusa o que nada alcanca e o que
esta declarado em dois arquivos. Removidas **66 funcoes, ~2.100 linhas**, e dois
arquivos que ficaram vazios (`core/app/conexao-backend.js`,
`core/app/ausencias-e-timeline.js`, tirados tambem dos dois index.html). A rota
`GET /api/test` continua (ver B1b). Prova de que nada ficou chamando o que saiu:
zero `no-undef` no ESLint + as 9 telas renderizando o mesmo HTML de antes, sem
erro de JS. **O que saiu** (todas sem nenhum chamador):
- timeline antiga: `gerarTimelineVisualComAusencias`, `gerarHeaderTimeline`,
  `adicionarLinhaTotalizador`, `mostrarDetalhesHora`, `gerarResumoHorarios`,
  `abrirSeletorMes`, `calcularHorasTrabalhadas`;
- modais antigos de ausencia e de horario: `abrirModalAusencia`,
  `abrirModalHorario`, `carregarColaboradoresNoSelect`, `cancelarEdicaoAusencia`,
  `toggleCamposHora`, `corrigirDataISO`;
- exportacao antiga de relatorio: `mostrarOpcoesExportacao`, `exportarRelatorio*`,
  `exportarComo*`;
- editor antigo de saldo no cadastro: `buildBancoHorasEditorMarkup` e 8 auxiliares;
- arrasto antigo de almoco da escala: `bindLunchCellDragEscala` e 7 auxiliares
  (o atual e `bindFluidLunchDragEscala`);
- carregadores antigos que o `runtime/` ja substituia: `carregarAusencias`,
  `carregarFeriadosLocais`, `salvarFeriado`, `editarFeriado`;
- ajudantes de console: `debugDados`, `debugTiposAusencias`, `debugAusencias` e
  `testarConexaoBackend` (este apontava para a porta 3000).

**B2 — 65 `console.log` de depuracao no frontend** · `RESOLVIDO`
Ex.: `ausencias-e-timeline.js:6-52` loga cada ausencia recebida (dados pessoais no console).
**Feito:** removidos por AST os 20 `console.log` de depuracao que sobraram depois
do B1 (incluindo os que imprimiam dados carregados). Ficaram `console.error/warn`
e um log de reserva quando o sistema de avisos nao existe. De quebra sumiram
textos com acentuacao corrompida ("aplicaÃ§Ã£o") que so existiam nesses logs.

**B3 — Versao fixa `'1.2.0'` nos metadados do backup/export** · `ABERTO` (backup do servidor resolvido: usa a versao do package.json; falta o export do front, ver A5)
`backup-service.js:441`, `configuracoes-tela.js:636` (o sistema esta na 1.6.3).

**B4 — Nome de variavel herdado de outra ferramenta** · `RESOLVIDO`
`CODEX_BACKUP_INITIAL_DIRECTORY` em `backend/lib/folder-picker.js:19,38`.
**Feito:** renomeada para `ESCALAS_PASTA_BACKUP_INICIAL` (so interna ao picker).

**B5 — Comentario solto** · `RESOLVIDO`
`backend/routes/auth.js:126-129`: o comentario de `verify-password` ficou em cima de `PUT /me/setores`.
**Feito:** o comentario voltou para cima de `POST /verify-password`.

**B6 — `scryptSync`/`spawnSync` bloqueiam o event loop** · `RESOLVIDO`
Login (`auth.js:21,26`) e rotas de `/sistema` (`background-service.js:15`).
**Feito (scrypt):** `crypto.scrypt` assincrono em hash e verificacao. `spawnSync`
em `/sistema` ficou: so roda no Windows, em acao manual de admin, e dura
milissegundos — `ACEITO`.

**B7 — Enumeracao de usuario por tempo de resposta no login** · `RESOLVIDO`
Usuario inexistente responde sem rodar o scrypt (mais rapido).
**Feito:** `credenciaisValidas` roda o scrypt contra um hash ficticio quando o
usuario nao existe; login e verify-password usam essa funcao. Teste unitario.

**B9 — Telas pedem dados antes do login** · `ABERTO`
Ao abrir o sistema deslogado, ~15 requisicoes de dados saem antes da tela de login
e voltam 401 (ruido no console e no log). Achado na verificacao no navegador.

**B10 — Desligar o servidor sem pasta de backup registrava erro** · `RESOLVIDO`
`backend/services/backup-scheduler.js`: a falta de pasta era checada antes de ver
se o backup de desligamento estava ligado, entao todo encerramento sem pasta
configurada logava "Falha ao gerar backup automatico". **Feito:** gatilho
desligado e checado primeiro.

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

**B11 — Rajada repetida de requisicoes com sessao ativa** · `ABERTO` (achado no fim)
No servidor de teste, com sessao ativa, o navegador registrou mais de 1.900
requisicoes repetindo as mesmas 7 rotas (feriados, plantoes, colaboradores,
jornada, setores, ausencias). Deslogado nao sai nenhuma. Falta confirmar se foi
efeito das passadas automaticas pelas telas ou uma atualizacao periodica
(`dashboardInterval` / `atualizarTudo`) disparando em excesso.

---

## 5. Resumo final (sessao interrompida pelo limite de uso)

**Resolvido:** C1, C2; A1, A2, A3, A4, A6, A8, A9, A10, A11, A12, A13; M1, M2,
M3, M4, M5, M6, M8, M12, M16; B1, B2, B4, B5, B6, B7, B10. Rede de seguranca
criada: 123 testes unitarios, 28 de integracao com SQL Server real, roteiro
golden master (87 passos), ESLint e checagem de tipos sem nenhum erro, CI
atualizado. Cerca de 3.000 linhas de codigo morto ou redundante removidas.

**Pendente (depende de decisao — ver secao 3):** A5 (P2, exportar backup
completo), A7 (P4, senha atual na troca), M7 (P1), M9/M17 (P5), M15 (P6),
formatacao em massa (P7), M13 (container como root: o volume de producao ja
pertence ao root; trocar de usuario exige migrar as permissoes do volume).

**Pendente (sem bloqueio):** M10 (retencao de backups), M11, M14 (funcoes
gigantes do frontend), B3 (versao no export antigo, junto com A5), B9, B11 e a
atualizacao do README (Fase 5).

**Recomendacoes:** responder P1–P7; rodar `npm run test:integracao` e o golden
master antes de qualquer refatoracao grande do backend; aplicar as tres
migrations pendentes em producao so depois de backup.
