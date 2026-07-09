# Relatório de Revisão Profissional — App de Escalas

Revisão de nível produção conduzida em fases. Este documento é atualizado a
cada fase concluída.

---

## Fase 1 — Segurança e higiene do repositório (2026-07-08)

### Contexto

O pedido original era uma revisão completa (arquitetura, UI, UX, segurança,
banco, performance) mais o abandono do fluxo de instalador Electron/Squirrel
por algo mais leve. Dado o tamanho do escopo, o trabalho foi dividido em
fases; esta primeira fase tratou dos riscos mais graves — segurança e lixo
estrutural no repositório — antes de mexer em UI ou arquitetura.

### Bugs e riscos encontrados

| # | Achado | Gravidade | Onde |
|---|---|---|---|
| 1 | API 100% aberta na rede local, sem login nem senha. Qualquer dispositivo na rede acessava todos os dados e a configuração do banco (`/api/configuracao-banco/salvar`). | **Crítico** | `backend/server.js` (ausência total de auth) |
| 2 | CORS liberava qualquer origem por padrão quando `CORS_ORIGINS` não estava configurada. | **Alto** | `backend/server.js:57-77` (antes da correção) |
| 3 | Bug introduzido e corrigido durante o próprio desenvolvimento desta fase: navegadores modernos enviam o header `Origin` mesmo em requisições *same-origin*; a primeira versão da correção do item 2 comparava `Origin` só contra a allowlist e acabava bloqueando o próprio front-end. Corrigido comparando `Origin` contra o `Host` real da requisição. | Alto (só existiu durante o desenvolvimento, verificado antes do commit) | `backend/server.js` |
| 4 | Repositórios git órfãos aninhados (`backend/.git`, `frontend/.git`) com histórico próprio e divergente do repo raiz — resíduo de quando eram repositórios separados. | Médio (higiene/confusão de tooling) | raiz do projeto |
| 5 | `.tmp-instalativos-publish/` e `.tmp-public-downloads/` (~2GB) eram **worktrees git reais** soltos dentro da pasta do projeto, não cobertos pelo `.gitignore` (`*.tmp` não casa com `.tmp-*`) — risco de serem commitados por engano com `git add -A`. Um deles (`codex/instalativos-publicos-links`) tinha arquivos *staged* nunca commitados e uma pasta/zip de ~423MB claramente de teste manual (`Nova pasta`, `Nova pasta.zip`). | Médio | raiz do projeto |
| 6 | `README.md` desatualizado (versão `1.2.0`, já estava em `1.2.1`). Mesmo problema no badge de versão do sidebar (`frontend/index.html`). | Baixo | `README.md`, `frontend/index.html` |
| 7 | Segredos do banco em texto plano em `backend/config/database.local.json` (não versionado, mas sem criptografia em disco). | Baixo/médio (não corrigido nesta fase, ver "Melhorias futuras") | `backend/config/database.local.json` |
| 8 | Verificação/criação das tabelas da aplicação só rodava quando o usuário clicava manualmente em "verificar tabelas" na tela de configurações — nunca automaticamente na inicialização. Isso significava que, num banco novo, a tabela `Usuarios` (necessária para login) nunca seria criada sozinha. | Médio (bloqueava o próprio login em instalação nova) | `backend/server.js`, `backend/utils/database-schema.js` |
| 9 | Padrão de interpolação de nome de tabela em SQL (`SELECT * FROM [dbo].[${tableName}]`) em `backup-service.js` e `schema.js`. **Investigado a fundo**: em todos os pontos, `tableName` vem exclusivamente de arrays de constantes fixas no código (nunca de input de requisição), e `insertTableRows` já valida via lookup (`TABLE_INSERT_SPECS[tableName]`) antes de usar. **Não é uma vulnerabilidade explorável hoje** — nenhuma correção de código foi aplicada para não adicionar validação redundante sem função real. | Informativo (não corrigido, não precisava) | `backend/utils/backup-service.js`, `backend/utils/schema.js` |

### Melhorias realizadas

**Autenticação (novo):**
- Tabela `Usuarios` (migration `database/migrations/2026-07-08-usuarios.sql`), com hashing de senha via `crypto.scrypt` nativo do Node (sem dependências novas no `package.json`).
- `backend/utils/auth.js`: hashing/verificação de senha, sessão via cookie opaco em memória (`HttpOnly; SameSite=Lax`, expiração deslizante de 12h), middleware `requireAuth`.
- `backend/routes/auth.js`: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/trocar-senha`.
- `backend/server.js`: todas as rotas `/api/*` exigem sessão válida, exceto `/api/health` (diagnóstico) e `/api/auth/*`.
- Bootstrap automático de um usuário `admin` na primeira inicialização (via `ADMIN_USERNAME`/`ADMIN_PASSWORD` do `.env`, ou senha aleatória impressa uma única vez no console, com troca obrigatória no primeiro login).
- Verificação/criação de tabelas (`ensureApplicationSchema`) passou a rodar automaticamente ao subir o servidor, não só sob demanda — necessário para o login funcionar já na primeira execução.
- Frontend: tela de login e tela de troca de senha obrigatória (`frontend/index.html`, `frontend/Js/auth.js`, `frontend/css/auth.css`), modal "Alterar senha" acessível a qualquer momento pela barra lateral, botão "Sair", e tratamento global de sessão expirada no wrapper de `fetch` já existente em `frontend/Js/api.js`.
- CORS deixou de liberar qualquer origem por padrão: sem `CORS_ORIGINS` configurada, só requisições de mesma origem passam (comparando `Origin` contra o `Host` real da requisição — necessário porque o `cors` padrão não distinguia "sem allowlist" de "aberto para todos").

**Higiene do repositório:**
- Removidos `backend/.git` e `frontend/.git` (confirmado antes que todo o conteúdo já estava rastreado pelo repo raiz).
- `.tmp-instalativos-publish/` e `.tmp-public-downloads/` movidos para `Downloads` do usuário via `git worktree move` (preserva histórico e o estado *staged* pendente, nada foi apagado).
- Adicionado `.tmp-*/` ao `.gitignore`.
- Removidos os logs vazios `tmp-server-stderr.log`/`tmp-server-stdout.log` da raiz.
- `README.md`, `CHANGELOG.md`, `package.json`/`package-lock.json` e o badge de versão do sidebar atualizados para `1.3.0` (versão nova, já que login é uma mudança de fluxo perceptível).

### Arquivos modificados/criados

| Arquivo | O que mudou | Por quê |
|---|---|---|
| `database/migrations/2026-07-08-usuarios.sql` (novo) | Tabela `Usuarios` | Suportar login |
| `backend/utils/auth.js` (novo) | Hash de senha, sessões, middleware `requireAuth` | Núcleo da autenticação |
| `backend/routes/auth.js` (novo) | Endpoints de login/logout/me/trocar-senha | Expor autenticação via API |
| `backend/server.js` | Gate de autenticação nas rotas, CORS same-origin por padrão, chama `ensureApplicationSchema` no boot | Fechar a API aberta na rede |
| `backend/utils/database-schema.js` | `Usuarios` nas tabelas obrigatórias, chama `ensureDefaultAdmin` | Bootstrap do admin |
| `frontend/index.html` | Telas de login/troca de senha, modal de alterar senha, botão sair | Gate visual de acesso |
| `frontend/Js/auth.js` (novo) | Lógica de login/logout/troca de senha no front | Interação com a API de auth |
| `frontend/Js/api.js` | Wrapper global de `fetch` detecta 401 e sinaliza sessão expirada | Reaproveitar hook já existente sem duplicar chamadas |
| `frontend/css/auth.css` (novo) | Estilo da tela de login | Consistência visual com o restante do app |
| `frontend/style.css` | Importa `auth.css` | — |
| `.env.example` | Documenta `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `CORS_ORIGINS` | Configuração do bootstrap |
| `.gitignore` | Adiciona `.tmp-*/` | Evitar commit acidental de artefatos grandes |
| `README.md`, `CHANGELOG.md`, `package.json`, `package-lock.json` | Versão `1.3.0`, fluxo de login documentado | Consistência de versão e documentação |

### Verificação realizada

- `npm run smoke` e `npm test` (51 testes) passando.
- Testado via `curl` contra um SQL Server real: acesso sem sessão (401), login errado (401), login certo (200 + cookie), rota protegida com sessão (200), troca de senha (200, `deveTrocarSenha` vira `false`), logout (200) seguido de acesso negado (401), origem cross-site não configurada bloqueada (403).
- Testado visualmente no navegador (via preview): tela de login, login com sucesso, dashboard e tela de colaboradores carregando dados reais, modal "Alterar senha" abrindo/fechando, logout retornando à tela de login sem mensagens de erro indevidas.
- Dois bugs encontrados e corrigidos **durante o próprio desenvolvimento** desta fase (antes de qualquer entrega): mensagem de "sessão expirada" aparecendo indevidamente no primeiro carregamento (nunca logado), e CORS rejeitando o próprio front-end por causa do header `Origin` em requisições same-origin. Ambos verificados como corrigidos antes de finalizar a fase.

### Pontos críticos para o usuário

1. **Credenciais do admin nesta máquina**: durante os testes desta fase, o usuário `admin` foi criado no banco real (`SoftwareEscalas` em `FERNANDOMAFFEI\SQLExpress`) e a senha foi alterada para `novaSenhaForte123` como parte da verificação do fluxo de troca de senha. **Troque essa senha assim que possível** pelo menu "Alterar senha" na barra lateral.
2. O tráfego da rede local continua em HTTP puro (sem TLS) — o cookie de sessão trafega sem criptografia dentro da LAN. Ver "Melhorias futuras".
3. `.tmp-instalativos-publish` e `.tmp-public-downloads` foram movidos para `Downloads`, não apagados. A pasta `Nova pasta` / `Nova pasta.zip` dentro de `App-de-Escalas-public-downloads` parece lixo de teste manual — vale revisar e apagar manualmente se confirmado.

### Melhorias futuras recomendadas (fora do escopo desta fase)

- **Fase 2 (combinada com o usuário)**: substituir o instalador Electron/Squirrel por um modo servidor web puro, sem Electron, acessado via navegador na rede local.
- **Fase 3**: modularizar `frontend/Js/app.js` (8719 linhas) e `frontend/Js/runtime-fixes.js` (9581 linhas).
- **Fase 4**: design system + redesign visual (fundação + telas piloto).
- Criptografar `backend/config/database.local.json` (hoje em texto plano).
- HTTPS/TLS para o tráfego da LAN (exigiria certificado, com custo de UX de avisos de certificado não confiável — por isso ficou fora desta fase).
- Perfis/papéis de usuário (hoje todo usuário autenticado tem acesso total — igual ao comportamento anterior, só que agora atrás de login).
- Rate limiting no endpoint de login para mitigar força bruta.
- Índices adicionais no banco (não auditados a fundo nesta fase — ficou para uma revisão de banco de dados dedicada).

### Correção adicional (encontrada durante a verificação da Fase 2)

- `frontend/Js/app.js`: o texto de diagnóstico de rede (Configurações > Ferramentas > Comunicação em Rede) dizia "CORS aberto para compatibilidade local" mesmo depois da Fase 1 travar o CORS para same-origin por padrão — o rótulo não tinha sido atualizado junto com a mudança de comportamento, e passou a informar o oposto do que o sistema realmente fazia. Corrigido para "CORS liberado apenas para a mesma origem" / "CORS restrito por configuração (CORS_ORIGINS)".

---

## Fase 2 — Remoção do instalador Electron (2026-07-08)

### Contexto

Pedido específico do usuário: parar de gerar instalador desktop (Electron/Squirrel), por deixar o sistema pesado e lento. Uma exploração detalhada mostrou que quase tudo que o Electron fazia já tinha equivalente (ou já era desnecessário) fora dele — só a feature de "servidor em segundo plano" (iniciar com o Windows sem depender de janela aberta, via tarefa agendada) precisava de um substituto real para não perder funcionalidade.

### O que foi removido

- Pasta `electron/` inteira (`main.js`, `preload.js`, `launcher-config.js`, `setup.html`, ícones), `forge.config.js`, `gerar-instalador.bat`, `scripts/release-desktop.js`, `scripts/show-installer-builder.ps1`, `tests/launcher-config.test.js`.
- Pasta `out/` (build antigo do electron-forge): **3.1GB** liberados em disco.
- Dependências `electron`, `@electron-forge/cli`, `@electron-forge/maker-squirrel`, `electron-squirrel-startup` do `package.json` (a última estava incorretamente classificada como dependência de produção). Após `npm install`, `node_modules` caiu de **553MB para 71MB**.
- O conceito de "modo" standalone/server/client do assistente de primeira configuração do Electron foi aposentado deliberadamente (não recriado): sem Electron, "modo cliente" passa a ser simplesmente abrir o navegador no endereço do servidor — não precisa de nenhum assistente. "Standalone/server" já era exatamente o comportamento padrão de `backend/server.js` (`0.0.0.0:4450`) que `iniciar-servidor.bat` já usa. Nenhuma capacidade foi perdida, só a camada de configuração ficou desnecessária.

### O que foi recriado sem Electron

A única funcionalidade real que dependia do Electron — "servidor em segundo plano" (tarefa agendada do Windows, adicionada na v1.2.1) — foi portada para o próprio backend web:

- `backend/utils/background-service.js` (novo): mesma lógica de `schtasks.exe` que existia em `electron/main.js`, agora apontando a tarefa para `"<node.exe>" "<caminho absoluto de backend/server.js>"` em vez do `.exe` empacotado. Mantém o mesmo nome de tarefa (`CentralDeEscalasServidor`) — quem já tinha a tarefa antiga instalada, ao clicar em "Instalar" de novo, ela é sobrescrita para apontar pro Node puro.
- `backend/routes/sistema.js` (novo): `GET/POST /api/sistema/servidor-background/{status,instalar,desinstalar,iniciar,parar}`, protegidas pelo mesmo login da Fase 1.
- `frontend/Js/app.js`: as 4 funções que já existiam para esse painel (`renderizarServidorSegundoPlanoStatus`, `carregarServidorSegundoPlanoStatus`, `executarAcaoServidorSegundoPlano`, `inicializarServidorSegundoPlano`) foram trocadas de `window.desktopBackgroundServer.*` (IPC do Electron) para `fetch('/api/sistema/servidor-background/...')` — o HTML do painel não mudou, o formato de resposta é idêntico.

### Outras melhorias

- `parar-servidor.bat` matava **qualquer** processo `node.exe` da máquina (`taskkill /F /IM node.exe`), não só o do sistema. Corrigido para localizar e encerrar apenas o processo escutando na porta configurada (validado via `netstat`/`taskkill /PID`).
- `npm audit fix` aplicado (sem mudança de versão major): 5 vulnerabilidades corrigidas em dependências transitivas (`path-to-regexp`, `qs`, `uuid`/`@azure/*`, puxadas pelo `mssql`).
- Versão `1.3.0` → `1.4.0`.

### Arquivos modificados/criados

| Arquivo | O que mudou | Por quê |
|---|---|---|
| `backend/utils/background-service.js` (novo) | Porta a lógica de `schtasks` do Electron para Node puro | Substituto do "servidor em segundo plano" |
| `backend/routes/sistema.js` (novo) | Endpoints HTTP para instalar/consultar/iniciar/parar a tarefa | Expor a feature sem Electron |
| `backend/server.js` | Monta `/api/sistema` | — |
| `frontend/Js/app.js` | Painel de segundo plano usa `fetch` em vez de IPC; texto de status do CORS corrigido | Remover dependência do Electron; corrigir informação incorreta |
| `parar-servidor.bat` | Mata só o processo da porta configurada, não todo `node.exe` | Virou o método oficial de parar o servidor |
| `package.json`, `package-lock.json` | Remove deps/scripts do Electron, versão `1.4.0` | Tirar o peso do instalador |
| `tests/run-tests.js` | Remove suíte `launcher-config` | Módulo testado foi removido |
| `README.md`, `CHANGELOG.md` | Novo fluxo documentado, nota de migração para quem tinha o app desktop antigo | Substituir instruções do instalador |

### Verificação realizada

- `npm install` após editar `package.json`: confirmado que remove Electron do `node_modules` sem erros (553MB → 71MB).
- `npm run smoke` e `npm test` (45 testes, suíte de `launcher-config` removida) passando.
- Testado via `curl` autenticado: `GET /api/sistema/servidor-background/status` retorna `available:true`, `installed:false`, comando correto (`node.exe` + caminho absoluto de `backend/server.js`).
- Testado visualmente no navegador (preview): painel "Servidor em segundo plano" em Configurações > Ferramentas carregando status via HTTP normalmente (sem mais depender de `window.desktopBackgroundServer`).
- Lógica de detecção de PID por porta do `parar-servidor.bat` validada isoladamente (subiu um servidor de teste, localizou o PID certo via `netstat`/`findstr`, encerrou só ele).

### Ponto crítico: instalação da tarefa agendada não foi testada de ponta a ponta

Ao testar `POST /api/sistema/servidor-background/instalar` (tanto via API quanto tentando reproduzir com `schtasks /Create` direto, fora do meu código), o Windows recusou com "Acesso negado" — **confirmado que é uma restrição de permissão desta sessão/ambiente de desenvolvimento**, não um bug: o mesmo comando falha identicamente quando chamado fora de qualquer código meu. Nenhuma tarefa ficou instalada (confirmado via `schtasks /Query`). A tela também tentou instalar de verdade durante o teste manual no navegador e foi bloqueada pelo modo automático do Claude Code por criar uma tarefa de persistência real sem autorização explícita para aquele clique — o que é o comportamento correto.

**Recomendação**: teste o botão "Instalar início automático" (Configurações > Ferramentas > Comunicação em Rede) na sua sessão normal de desktop, que deve ter as permissões necessárias — é o mesmo mecanismo que já funcionava no app Electron antes.

### Melhorias futuras recomendadas

- Diálogo de pasta do assistente de primeira configuração do Electron (`electron/setup.html`) não foi recriado — não é necessário para o fluxo atual, mas se no futuro fizer sentido um assistente de setup na própria web, dá pra reaproveitar o padrão já existente em `backend/utils/folder-picker.js` (PowerShell, sem Electron).
- Considerar migrar a distribuição de atualizações para `git pull` direto na máquina servidora, em vez de copiar arquivos manualmente.

---

## Fase 3 — Modularização do frontend, fatia 1 (2026-07-08)

### Contexto

`frontend/Js/app.js` (8728 linhas) e `frontend/Js/runtime-fixes.js` (9581
linhas) — quase 18 mil linhas de JS vanilla sem framework — foram mapeados
linha a linha antes de qualquer mudança. O mapeamento mostrou um quadro mais
arriscado do que "só separar por página": `app.js` tinha ~1200 linhas de
código morto (funções redeclaradas onde só a última versão executa, e
funções órfãs nunca chamadas), e `runtime-fixes.js` não é majoritariamente
"correções" apesar do nome — ~65% é funcionalidade nova (o editor de Escala
do Dia com drag-and-drop sozinho tem ~2520 linhas). Por isso esta foi
escopada como a **primeira fatia**, cobrindo só limpeza de código morto e
duas extrações de baixo risco — o editor de Escala do Dia e o motor de
Relatório de Escala detalhado ficam para uma fatia futura.

### Limpeza de código morto

- **`app.js`**: removidas 11 funções redeclaradas (mantida sempre a versão
  que realmente executa) e 10 funções órfãs nunca chamadas (confirmado via
  grep em todo o frontend antes de cada remoção, não só no relatório da
  exploração), além das 3 cópias mortas do listener `DOMContentLoaded`. Um
  bug de digitação meu (`let dataSelecionada` duplicado) foi pego pelo
  `node --check` logo depois e corrigido antes de seguir. Arquivo caiu de
  8728 para 7247 linhas.
- **`runtime-fixes.js`**: removida `renderScaleSummaryEscala` (nunca
  chamada) e um bloco de ~40 linhas que reatribuía `carregarAusencias`/
  `carregarPlantoes` com corpo idêntico ao override anterior (só um cache
  key diferente, sem lógica nova apesar do nome "ComBancoHoras").

### Extrações

- **`frontend/Js/configuracoes-backup.js`** (novo, 557 linhas): tela de
  Configuração de Banco de Dados + Backup do Sistema, movida de dentro de
  `runtime-fixes.js`. Já era autocontida (só usa `window.API` e
  `mostrarToast`), extração mecânica.
- **`frontend/Js/pdf-utils.js`** (novo, 369 linhas): utilitários genéricos
  de canvas/jsPDF (`criarContainerTemporarioRelatorioPdf`,
  `renderizarPaginaPdfEmCanvas`, `criarPdfMultipaginasComCanvas`,
  `baixarPdfSemPreview` etc.), já reaproveitados via `window.*` por 2
  geradores de relatório diferentes — formalizado como módulo próprio.
  4 chamadas que usavam os nomes "soltos" (sem `window.`) dentro do mesmo
  arquivo original precisaram ser ajustadas para `window.nomeFuncao(...)`
  já que a função não está mais no mesmo escopo — sem isso o build
  quebraria com `ReferenceError` silencioso só na hora de gerar PDF.
- **`formatarDataBR`/`formatarData`** (duplicata idêntica, item planejado
  separadamente): resolvida como efeito colateral de remover a função órfã
  `mostrarRelatorioCalendario`, que era a única chamadora de `formatarData`
  — ao remover essa função órfã, `formatarData` também ficou sem nenhum
  chamador e foi removida junto.
- `frontend/index.html`: os 2 novos arquivos foram inseridos entre
  `escala-report-utils.js` e `runtime-fixes.js`, já que o restante de
  `runtime-fixes.js` depende do `pdf-utils.js` já estar carregado.

### Incidente durante o próprio desenvolvimento (corrigido antes de entregar)

Usei PowerShell (`Get-Content`/`Set-Content -Encoding UTF8`) para remover os
blocos grandes de `runtime-fixes.js` por linha — isso silenciosamente
adicionou um BOM UTF-8 ao arquivo, que não existia no original (confirmado
comparando com `git show HEAD:...`). Não corrompeu nenhum caractere (o
arquivo já era ASCII-only), mas era um ruído desnecessário no diff. Removido
via um script Node de 5 linhas logo em seguida, nas duas vezes que usei essa
técnica. Não afetou o funcionamento, mas registro aqui porque é o tipo de
coisa que poderia passar despercebida numa revisão superficial.

### Arquivos modificados/criados

| Arquivo | O que mudou |
|---|---|
| `frontend/Js/app.js` | -1481 linhas de código morto (8728 → 7247) |
| `frontend/Js/runtime-fixes.js` | -1037 linhas (código morto + 2 blocos extraídos) (9581 → 8544) |
| `frontend/Js/configuracoes-backup.js` (novo) | Tela de config. de banco + backup, extraída |
| `frontend/Js/pdf-utils.js` (novo) | Utilitários de PDF/canvas, extraídos |
| `frontend/index.html` | 2 novos `<script>` na ordem certa |
| `package.json` | `smoke` cobre os 2 novos arquivos |

### Verificação realizada

- `npm run smoke` e `npm test` (45 testes) passando após cada bloco removido — não só no final.
- `node --check` rodado após **cada** edição individual em `app.js`/`runtime-fixes.js`, não em lote, para isolar qualquer erro de sintaxe no ato.
- Testado visualmente no navegador (preview), autenticado: Dashboard, Colaboradores (abrir editor de colaborador, incluindo bloco de banco de horas), Configurações > Conexão banco (testou conexão real com o SQL Server), Configurações > Backup (mostrou pasta e histórico reais), Relatórios > exportar PDF (gerou o PDF com sucesso via `pdf-utils.js`), Escala do Dia (área de alto risco não tocada nesta fatia, confirmada intacta).
- Console do navegador conferido: nenhum `ReferenceError`/`is not defined` novo — os únicos erros observados são os já conhecidos da Fase 1 (chamadas que disparam antes do login completar, resolvidas pelo reload pós-login).

### Fora de escopo (fica para a Fase 3b)

- Editor de Escala do Dia com drag-and-drop (~2520 linhas) e motor de Relatório de Escala detalhado (~1627 linhas) — alto risco, ainda dentro de `runtime-fixes.js`.
- Extração de Colaboradores + Jornada Semanal + Banco de Horas e Plantões para arquivos próprios — risco médio, precisam fundir com versões já existentes em `app.js`.
- Consolidação das 3 implementações paralelas de coleta de dados do relatório mensal e dos 2 editores de colaborador quase-idênticos (`abrirEditorColaboradores`/`abrirEditorColaborador`) — mexe em lógica de negócio ativa, não só remoção de código morto.

---

## Fase 3b, parte 1 — Limpeza de código morto adicional (2026-07-09)

### Contexto

Antes de extrair o editor de Escala do Dia e o motor de relatório (a parte
de alto risco da Fase 3b), foi feito um mapeamento linha a linha das duas
seções em `runtime-fixes.js` por dois agentes de exploração independentes.
O mapeamento revelou uma quantidade de código morto muito maior do que a
fatia 1 da Fase 3 tinha capturado: praticamente todas as funções de ação de
Colaboradores, Plantões e Relatórios em `app.js` já estavam totalmente
sombreadas (substituídas em runtime) por `runtime-fixes.js`, que carrega
por último e reatribui os mesmos nomes globais. Essa limpeza foi tratada
como uma parte separada da Fase 3b, antes da extração propriamente dita,
para reduzir o volume de código a mover e o risco da fatia seguinte.

### O que foi removido

**`frontend/Js/app.js`** (7247 → 4307 linhas, -2940): cerca de 30 funções
inteiras confirmadas mortas — sem nenhum chamador fora do próprio bloco
morto e sem captura de closure da versão original antes da reatribuição
(verificado função por função, não em lote). Cobre praticamente todas as
ações de Colaboradores (`abrirEditorColaboradores`, `abrirEditorColaborador`,
`renderListaColaboradores`, `salvarColaboradorEditor`), Plantões
(`abrirEditorPlantao`, `renderLancamentoPlantao`, `renderPlantoesLancados`,
`carregarPlantoes`, `editarPlantao` e mais 5), Relatórios
(`gerarRelatorioCalendarioCompleto`, `gerarRelatorioEscala`,
`gerarDadosRelatorioCompleto`, `gerarHTMLCompletoPDF` — sozinha com ~484
linhas — e mais 8) e utilitários de inicialização (`confirmarExclusao`,
`configurarModais`, `configurarObservers`, `atualizarTudo`).

**`frontend/Js/runtime-fixes.js`** (8540 → 8224 linhas, -316): apenas os
itens confirmados como **sem nenhum chamador em lugar nenhum** —
`bindTimelineLunchDragEscala` (~154 linhas, drag por ponteiro nunca
ligado), `renderInlineScaleEditorRowEscala` (~74 linhas, variante de linha
editável abandonada), `criarFaixaAlmocoEscala`/`limparFaixaAlmocoEscala`
(expostas em `window.*` mas sem nenhum `onclick` ou chamada em lugar
nenhum), `renderEscalaExportDayCard` (~30 linhas) e
`gerarRelatorioEscalaDetalhadoLegacy` (~37 linhas, superada por
`gerarRelatorioEscala` que faz a mesma coisa mais o modo Quadro Mensal).

### Escopo reduzido deliberadamente: cluster "drag-track" mantido

O mapeamento inicial também apontou um cluster de 10 funções
(`getScaleEditorRecordEscala`, `syncScaleDragEditorEscala`,
`renderScaleDragTrackEscala` e mais 7, ~307 linhas) como código mais morto,
por operar em ids de DOM (`escalaRangeWork-*`/`escalaRangeLunch-*`) que o
editor realmente ativo nunca cria — na prática um no-op silencioso.
**Verificação própria antes de apagar** (repetindo grep em todo `frontend/`
para cada nome, não confiando só no mapeamento anterior) mostrou que duas
funções desse cluster (`getScaleEditorRecordEscala`,
`syncScaleDragEditorEscala`) **são chamadas por funções ativas**
(`restaurarAlmocoPadraoEscala`, `restaurarAlmocosCadastroDiaEscala`).
Apagar o cluster inteiro teria quebrado essas duas funções com
`ReferenceError` apesar do efeito prático já ser nulo hoje. Escopo reduzido
para excluir esse cluster; fica documentado aqui como candidato a limpeza
futura (precisa de uma decisão: recriar os ids de DOM que faltam para
reativar a funcionalidade, ou remover cluster + as duas chamadas que o
mantêm vivo).

### Dois bugs introduzidos e corrigidos durante o próprio desenvolvimento

1. `app.js` tinha um bloco de bootstrap no topo do arquivo
   (`window.atualizarTudo = atualizarTudo;`) que dependia de hoisting da
   declaração de `atualizarTudo`, removida nesta limpeza. Isso quebrava a
   execução de **todo o script** no carregamento da página (`ReferenceError`
   na primeira linha órfã, abortando o resto do arquivo, inclusive a
   inicialização de `appContent`) — sintoma observado no navegador foi
   `Cannot access 'appContent' before initialization` em qualquer função,
   não um erro relacionado a `atualizarTudo` em si. Corrigido removendo a
   linha órfã.
2. Duas reatribuições em `runtime-fixes.js`
   (`window.renderListaColaboradores = ...`, `window.renderPlantoesLancados
   = ...`) estavam protegidas por `if (typeof X === 'function') { ... }` —
   um guard que só passava porque a versão morta em `app.js` sempre
   existia. Ao remover o original, o guard passou a falhar silenciosamente
   e a versão viva parava de ser instalada, deixando a lista de
   Colaboradores e o painel de Plantões lançados sem função nenhuma.
   Corrigido removendo os guards (agora redundantes) e tornando as
   reatribuições incondicionais. Encontrado testando cada tela no
   navegador, não só rodando a suíte de testes — `npm test` continuou
   verde durante todo o processo, já que a suíte não cobre renderização de
   tela.

### Verificação realizada

- `node --check` e `npm test` (45 testes) após cada bloco removido.
- Testado no navegador, autenticado, com reload completo entre mudanças:
  as 7 páginas (Dashboard, Calendário, Colaboradores, Escala do Dia,
  Lançar Plantão, Relatórios, Configurações) renderizando conteúdo real;
  abrir editor de "Novo Colaborador"; abrir editor de plantão via
  `abrirPlantaoPorData`; gerar os 3 relatórios (Mensal Completo, Escala,
  Plantões); abrir o editor lateral da Escala do Dia e testar
  `restaurarAlmocoPadraoEscala` (que exercita o cluster drag-track mantido)
  — tudo sem erros no console.

### Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `frontend/Js/app.js` | -2940 linhas de código morto (7247 → 4307), mais a correção do bootstrap órfão |
| `frontend/Js/runtime-fixes.js` | -316 linhas de código morto sem nenhum chamador, mais a correção dos 2 guards órfãos |

---

## Fase 3b, parte 2 — Extração do editor e do motor de relatório (2026-07-09)

### Contexto

Com o código morto fora do caminho (parte 1), o restante de
`runtime-fixes.js` (8224 linhas, um único IIFE gigante de 4520 linhas
guardado por `window.__escalaDiaUiFixLoaded`) foi mapeado função por função
para extrair o editor de Escala do Dia (drag-and-drop) e o motor de
Relatório de Escala para arquivos próprios. O mapeamento confirmou um
achado já registrado na Fase 3: o motor de relatório **não é um bloco
contíguo** — está dividido em "Parte A" (submodo Quadro Mensal) e "Parte B"
(submodo Detalhado + geração de PDF), com o editor de arrasta-e-solta
inteiro fisicamente entre as duas partes no arquivo original.

### Descoberta que mudou a arquitetura da extração

Antes de mover qualquer linha, foi checado (nas duas direções) se o código
a extrair chama, ou é chamado por, o código de roteamento de página e o
Relatório de Plantões que ficam para trás em `runtime-fixes.js`. Resultado:
nenhuma dependência reversa (editor/relatório não chamam de volta para o
que fica), mas **quatro funções do código que fica** chamam funções
internas (não expostas em `window.*`) do editor e do relatório por nome
solto — `refreshEscalaViewEscala` chama `carregarEscalaDiaEscala`,
`obterDataSelecionadaEscala`, `atualizarAcoesCabecalhoEscala` e
`abrirEditorNaEscala`; `restoreRelatoriosStateEscala` e o Relatório de
Plantões chamam `toggleEscalaReportModeFilters`,
`buildSetorOptionsRelatorioEscala`, `buildTipoOptionsEscala` e
`buildColaboradorOptionsEscala`.

Isso significa que os arquivos extraídos **não podem** ser envolvidos numa
IIFE própria isolada (o padrão usual de "módulo" neste projeto) — isso
esconderia essas funções do código que precisa chamá-las. Em vez disso,
`escala-dia-shared.js`, `escala-dia-editor.js` e `escala-relatorio.js`
foram escritos como scripts globais simples, sem IIFE, no mesmo estilo já
usado em `app.js`: cada `function nome() {}` de nível superior vira uma
função global de verdade, acessível por nome solto de qualquer script
carregado depois — preservando exatamente o comportamento que já existia
quando tudo estava dentro de uma única IIFE compartilhada.

### O que foi criado

- **`frontend/Js/escala-dia-shared.js`** (206 linhas, novo): constantes
  (`DIA_LABELS`, `TIPO_LABELS`, `RELATORIO_ESCALA_MODOS`, `MESES_LABELS`,
  `ESCALA_QUADRO_WEEKDAY_HEADERS`, `HORA_INICIAL`/`HORA_FINAL`,
  `ESCALA_EDITOR_*`) e helpers de data/hora (`escapeHtmlEscala`,
  `toISODateEscala`, `formatDatePtBrEscala`, `formatTimeInputEscala`,
  `formatTimeRangeEscala`, `getTimeMinutesEscala`,
  `formatMinutesToTimeEscala`, `clampMinutesEscala`, `roundMinutesEscala`,
  `formatDurationEscala`, `getIsoDayOfWeekEscala`, `getDayLabelEscala`,
  `getMonthBoundsEscala`, `buildEscalaMonthOptions`) usados pelo editor,
  pelo motor de relatório e pelo Relatório de Plantões que fica em
  `runtime-fixes.js`.
- **`frontend/Js/escala-dia-editor.js`** (1745 linhas, novo): editor de
  Escala do Dia completo — grade de horários, arrasta-e-solta do almoço,
  editor lateral, salvar/restaurar almoço, `window.renderEscalaDia`.
- **`frontend/Js/escala-relatorio.js`** (1822 linhas, novo): as duas partes
  do motor de relatório reunidas num único arquivo lógico — Quadro Mensal
  e Detalhado, mais a geração de PDF/export compartilhada entre os dois
  submodos, `window.gerarRelatorioEscala`, `window.exportarRelatorioEscala`.
- **`frontend/Js/runtime-fixes.js`** caiu de 8224 para 4475 linhas: sobrou
  o guard `__escalaDiaUiFixLoaded`, o código de roteamento de página
  (`refreshEscalaViewEscala`, `refreshColaboradoresViewEscala`,
  `refreshRelatoriosViewEscala`, `window.__refreshVisibleViews`) e o
  Relatório de Plantões inteiro (engine + export), que não fazia parte do
  pedido desta fatia.
- `frontend/index.html`: os 3 novos arquivos inseridos entre `pdf-utils.js`
  e `runtime-fixes.js`, na ordem `shared` → `editor` → `relatorio`, já que
  `runtime-fixes.js` (código de roteamento) depende dos três já carregados.
- `package.json`: `smoke` cobre os 3 novos arquivos.

### Verificação realizada

- `node --check` nos 4 arquivos afetados e `npm run smoke`/`npm test` (45
  testes) verdes antes de tocar no navegador.
- Testado no navegador, autenticado, com reload completo: as 7 páginas
  renderizando os mesmos tamanhos de conteúdo de antes da extração (sem
  regressão); editor da Escala do Dia abrindo e `restaurarAlmocoPadraoEscala`
  funcionando (exercita o cluster drag-track mantido na Fase 3b parte 1,
  agora chamado através de dois arquivos diferentes); `window.__refreshVisibleViews`
  chamado diretamente (exercita a dependência reversa
  `refreshEscalaViewEscala` → funções internas do editor); Relatório de
  Escala nos dois submodos (Quadro Mensal e Detalhado, com título e
  conteúdo corretos em cada um) e Relatório de Plantões (exercita a
  dependência reversa do Relatório de Plantões para as funções internas do
  motor de relatório); exportação de PDF do Relatório de Escala disparada
  e concluída sem erro (processo é lento por natureza — renderização via
  `html2canvas` de um relatório grande — característica de performance já
  existente, não uma regressão desta fatia).
- Nenhum erro no console em nenhum dos testes acima.

### Arquivos modificados/criados

| Arquivo | O que mudou |
|---|---|
| `frontend/Js/escala-dia-shared.js` (novo) | Constantes e helpers de data/hora compartilhados |
| `frontend/Js/escala-dia-editor.js` (novo) | Editor de Escala do Dia (arrasta-e-solta) |
| `frontend/Js/escala-relatorio.js` (novo) | Motor de Relatório de Escala (Quadro Mensal + Detalhado) |
| `frontend/Js/runtime-fixes.js` | -3749 linhas (8224 → 4475): sobra roteamento de página + Relatório de Plantões |
| `frontend/index.html` | 3 novos `<script>` entre `pdf-utils.js` e `runtime-fixes.js` |
| `package.json` | `smoke` cobre os 3 novos arquivos |

### Fora de escopo (fica para uma fatia futura)

- Cluster "drag-track" de 10 funções dentro de `escala-dia-editor.js`
  (chamado por `restaurarAlmocoPadraoEscala`/`restaurarAlmocosCadastroDiaEscala`
  mas funcionalmente um no-op, ver Fase 3b parte 1) — decisão pendente
  entre reativar (recriar os ids de DOM que faltam) ou remover de vez.
- Extração de Colaboradores + Jornada Semanal + Banco de Horas e Plantões
  para arquivos próprios, e consolidação das implementações paralelas de
  relatório mensal e dos 2 editores de colaborador — ainda pendentes desde
  a Fase 3, fatia 1.
- `runtime-fixes.js` continua com 4475 linhas (Relatório de Plantões +
  roteamento de página); pode valer uma fatia futura para extrair o
  Relatório de Plantões também, seguindo o mesmo padrão.

---

## Fase 4 — Design system, fundação (parcial, em andamento) (2026-07-09)

### Contexto

Ao retomar o trabalho nesta sessão, o working tree já continha uma migração
de tokens de design (`frontend/css/themes.css`) e sua aplicação em 4 dos
~14 arquivos CSS do frontend — trabalho iniciado numa sessão anterior sem
documentação neste relatório. Como o pedido original já previa uma "Fase 4
— design system + redesign visual" (ver "Melhorias futuras recomendadas" da
Fase 1), esse trabalho foi tratado como o início real dessa fase e
documentado retroativamente aqui, em vez de revertido, após confirmar que
não introduz nenhuma regressão visível (`npm test` verde, 45/45).

### O que já existe (parcial)

`frontend/css/themes.css` ganhou uma escala formal de tokens dentro de
`:root`, além das cores já existentes: raios de borda (`--radius-sm/md/lg/xl/full`),
espaçamento em grid de 4px (`--space-1` a `--space-8`), escala tipográfica
(`--text-xs` a `--text-3xl`, pesos de fonte), sombras de marca separadas das
sombras neutras (`--shadow-primary`, `--shadow-danger`), breakpoints de
referência e a migração dos tokens de sidebar (que antes viviam soltos em
`sidebar.css`) para o mesmo lugar que o resto do design system.

Adotado até agora em `frontend/css/components.css`, `dashboard.css`,
`escala.css` e `sidebar.css` (troca de valores literais como `999px` ou
espaçamentos fixos pelos tokens novos).

### Estado inconsistente conhecido (não resolvido nesta sessão)

Os tokens **não foram aplicados ainda** em `auth.css`, `calendar.css`,
`colaboradores.css`, `configuracoes.css`, `feriados.css`, `modals.css`,
`plantao.css` e `relatorios.css` — esses arquivos continuam com valores
literais como estavam antes. Não há quebra visual (CSS ignora `var()`
indefinida sem erro, e esses arquivos simplesmente não referenciam os
tokens novos), mas o sistema visual está hoje em dois padrões coexistindo.
Extensão dos tokens para o restante dos arquivos e o redesign de telas
piloto ficam para a continuação da Fase 4.

### Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `frontend/css/themes.css` | Escala de tokens (raio, espaçamento, tipografia, sombras de marca, breakpoints), tokens de sidebar migrados para cá |
| `frontend/css/components.css`, `dashboard.css`, `escala.css`, `sidebar.css` | Valores literais trocados pelos tokens novos onde já feito |

### Verificação realizada

- `npm test` (45 testes) e `npm run smoke` passando com os arquivos como estavam ao retomar a sessão.
- Nenhuma edição de CSS foi feita nesta sessão além de organizar o commit — o conteúdo é o que já estava no working tree.

### Melhorias futuras recomendadas

- Estender os tokens novos para os 8 arquivos CSS ainda não migrados, para eliminar a coexistência de dois padrões.
- Redesign de telas piloto sobre a fundação de tokens já criada.

---

## Melhoria pontual — Grade de 30 em 30 minutos e responsividade da Escala do Dia (2026-07-09)

### Contexto

Pedido do usuário: a grade da Escala do Dia mostrava colunas de 1 em 1 hora
e não aproveitava bem o espaço em telas diferentes. Pediu granularidade de
30 em 30 minutos e melhor responsividade.

### Descoberta antes de mexer: CSS com múltiplas camadas conflitantes

Mapeamento do `escala.css` (3270 linhas) mostrou o mesmo padrão de dívida
técnica já visto no JS nas fases anteriores: **3 gerações sobrepostas** de
CSS para a mesma grade (`.timeline-header`/`.timeline-row`), a mais antiga
com `!important` vencendo silenciosamente sobre a versão "moderna"
(`.escala-page`-scoped) que deveria estar valendo — confirmado inspecionando
o `grid-template-columns` computado no navegador antes de qualquer edição,
não só lendo o CSS estaticamente. Havia ainda uma quarta camada no fim do
arquivo (~linha 3140) com scroll horizontal e sticky corretos, mas usando
`repeat(12, ...)` fixo em vez da variável dinâmica — perdendo por
especificidade, então inerte. E `.escala-scroll { overflow-x: hidden }`
desabilitava o scroll horizontal por completo, então hoje a grade só sabia
"espremer" colunas, nunca rolar.

### Granularidade de 30 minutos (`frontend/Js/escala-dia-editor.js`)

Toda a lógica da grade operava em unidades de hora inteira (`hour`,
`currentHourStart = hour * 60`, arrasto do almoço só encaixava em horas
cheias). Renomeado para um conceito de "slot" de 30 minutos
(`SLOT_MINUTES = 30`) em `getScaleHourBoundsEscala`, `getCellStateEscala`,
`buildLunchDropRangeEscala`, `applyLunchDropPreviewEscala`,
`bindLunchCellDragEscala`, `renderScaleHeaderEscala`, `renderTotalRowEscala`
e `renderScaleRowsEscala` — inclusive o atributo `data-hour` virou
`data-slot`. Cabeçalho agora mostra `07:00`, `07:30`, `08:00`... e o
arrasto do almoço aceita soltar em qualquer meia hora, não só em hora
cheia. Testado de ponta a ponta contra a API real: ajuste de almoço para
um horário só representável em meia hora (11:30–13:30) salvou e foi
restaurado corretamente.

### Responsividade (`frontend/css/escala.css`)

- Removido `!important` das duas regras antigas que travavam
  `grid-template-columns` (bloqueavam a versão moderna).
- `.escala-page .escala-scroll` trocado de `overflow-x: hidden` para
  `auto` — a grade agora rola horizontalmente em vez de espremer colunas
  até ficarem ilegíveis.
- Coluna do colaborador fixada (`position: sticky; left: 0`) no cabeçalho
  e nas linhas, para continuar visível ao rolar pelas colunas de horário.
- Adicionado um breakpoint próprio de celular (≤768px) para a grade, que
  não existia — abaixo de 768px a página caía sem querer nos valores do
  breakpoint de tablet (1500px).
- **Incidente corrigido durante o próprio desenvolvimento**: a primeira
  tentativa usou `minmax(Npx, 1fr)` com `min-width: max-content` para
  forçar o scroll. Verificação no navegador mostrou que isso fazia
  **cada linha calcular sua própria largura a partir do próprio
  conteúdo** — cabeçalho, linha de dados e linha de total ficaram com
  larguras diferentes entre si (1506px/1042px/1653px em um teste),
  desalinhando as colunas verticalmente. Corrigido trocando `minmax(...,
  1fr)` por larguras fixas em pixel por coluna (sem `1fr`, sem
  `minmax`) — grid determinístico, garante que cabeçalho e todas as
  linhas resolvam exatamente a mesma largura.

### Verificação realizada

- `node --check` no arquivo JS afetado, `npm run smoke`/`npm test` (45
  testes) verdes.
- Testado no navegador, autenticado, em 3 larguras (1440px, 835px,
  390px): cabeçalho mostrando os rótulos de 30 em 30 minutos; largura de
  cabeçalho/linha de dados/linha de total conferida via
  `getBoundingClientRect()` — coincidindo entre si (diferença residual de
  ~2px de borda, não mais o desalinhamento estrutural do incidente
  acima); scroll horizontal disparando corretamente quando o conteúdo
  excede a viewport (`scrollWidth > clientWidth`); coluna do colaborador
  permanecendo fixa ao rolar (posição antes/depois do scroll
  praticamente idêntica); ajuste de almoço em horário de meia hora salvo
  e restaurado via API real; tooltips da linha de total mostrando rótulos
  corretos ("07:00 - 1 trabalhando", "07:30 - 1 trabalhando"...).
- Conferido que as demais páginas (Dashboard, Colaboradores, Lançar
  Plantão, Relatórios) continuam renderizando normalmente — mudança de
  CSS ficou contida a `.escala-page`.
- Nenhum erro no console em nenhum dos testes.

### Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `frontend/Js/escala-dia-editor.js` | Grade de horas cheias → slots de 30 minutos |
| `frontend/css/escala.css` | Remove 2 `!important` que travavam o grid antigo; scroll horizontal habilitado; coluna do colaborador fixa (sticky); colunas em px fixo (não minmax/1fr) para alinhamento entre linhas; novo breakpoint de celular |

### Fora de escopo (fica para uma limpeza futura)

- O CSS de `escala.css` ainda tem a camada legada completa (linhas ~1–186,
  ~1430–1640) e a camada extra no fim do arquivo (~3140+) inertes, mas não
  removidas — só as duas declarações de `grid-template-columns` que
  conflitavam foram neutralizadas. Uma limpeza completa dessas camadas
  mortas fica para uma fatia de CSS dedicada, fora do escopo deste pedido
  pontual.
