# Apostila Técnica — Central de Escalas (App de Escalas)

> **Projeto:** Central de Escalas / App de Escalas — sistema web para gestão de escalas de trabalho de uma equipe.
> **Versão do sistema:** 1.6.1
> **Autor:** Fernando Maffei
> **Documento gerado em:** 04/08/2026
> **Objetivo deste documento:** registro pessoal e referência técnica completa do projeto — o que ele é, com quais tecnologias foi construído, como o código está organizado e como executá-lo.

---

## Sumário

1. [Visão geral do projeto](#1-visão-geral-do-projeto)
2. [Ferramentas e tecnologias usadas](#2-ferramentas-e-tecnologias-usadas)
3. [Estrutura de pastas e arquivos](#3-estrutura-de-pastas-e-arquivos)
4. [Documentação do código](#4-documentação-do-código)
   - 4.1 [Backend — ponto de entrada e infraestrutura](#41-backend--ponto-de-entrada-e-infraestrutura)
   - 4.2 [Backend — banco, segurança e regras de negócio](#42-backend--banco-segurança-e-regras-de-negócio)
   - 4.3 [Backend — rotas (a API REST)](#43-backend--rotas-a-api-rest)
   - 4.4 [Banco de dados — migrations e seed](#44-banco-de-dados--migrations-e-seed)
   - 4.5 [Frontend — arquitetura e módulos](#45-frontend--arquitetura-e-módulos)
   - 4.6 [Frontend — CSS por tela](#46-frontend--css-por-tela)
5. [Como executar o projeto](#5-como-executar-o-projeto)

---

## 1. Visão geral do projeto

### O que é

A **Central de Escalas** é uma **aplicação web** que ajuda a organizar **quem trabalha, quando, e por quanto tempo** dentro de uma equipe. Em vez de planilhas soltas, o time enxerga uma **grade visual do dia** (a "Escala do Dia") e o sistema cuida das contas: horas trabalhadas, almoço, ausências, feriados, plantões e banco de horas.

### Que problema resolve

Montar e acompanhar escala de equipe na mão é trabalhoso e dá erro: é fácil esquecer um feriado, contar hora errada, ou não enxergar quantas pessoas estão trabalhando às 14h. Este sistema centraliza tudo num só lugar, com **uma fonte de verdade** (o banco de dados) que todos consultam pelo navegador.

### Como funciona no geral

A ideia central é **cliente-servidor**:

```
   [ Navegador do time ]  ──HTTP──▶  [ Servidor Node/Express ]  ──SQL──▶  [ SQL Server ]
    (só o navegador,                   (serve as telas +                   (guarda os dados:
     nada instalado)                    a API /api/...)                     colaboradores, escalas...)
```

1. Uma **única máquina** roda o servidor (Node.js) e o banco (SQL Server).
2. Esse servidor faz **duas coisas**: entrega as telas (HTML/CSS/JS) e responde à **API** em `/api/...`.
3. As demais pessoas do time **não instalam nada** — abrem `http://<ip-do-servidor>:4450` no navegador (ou instalam como app via **PWA**).
4. Toda tela do front-end conversa com o back-end **só pela API**; o back-end é o único que fala com o banco. Isso protege as regras de negócio e as credenciais.

### O que o sistema gerencia (domínio)

| Conceito | O que é |
|---|---|
| **Colaborador** | A pessoa da equipe, com sua jornada (início/fim de trabalho e de almoço) e setor. |
| **Escala do Dia** | A grade visual de um dia: quem trabalha em cada faixa de horário, com o almoço arrastável. |
| **Jornada Semanal** | Horários que variam por dia da semana para um colaborador. |
| **Ausência** | Falta/afastamento (dia inteiro ou parcial). |
| **Feriado** | Datas que alteram a escala (nacional, estadual, municipal). |
| **Plantão** | Trabalho de fim de semana (sábado/domingo). |
| **Banco de Horas** | Registro de créditos e débitos de horas de cada colaborador. |
| **Setor** | Agrupamento de colaboradores (ex.: Atendimento, Suporte). |
| **Usuário** | Conta de acesso ao sistema, com perfil **admin** ou **comum**. |
| **Relatórios** | Visões consolidadas (mensal, por escala), exportáveis em **PDF**. |
| **Backup** | Cópia dos dados do banco em arquivo, manual ou automática. |

---

## 2. Ferramentas e tecnologias usadas

Para cada tecnologia: **o que é**, **para que serve** e **por que/como foi usada aqui**.

### Node.js
- **O que é:** um ambiente que executa JavaScript fora do navegador (no servidor).
- **Para que serve:** criar servidores, ferramentas de linha de comando e back-ends.
- **Como foi usado aqui:** é o motor do back-end. Todo o servidor, a API e os scripts (testes, migrations) rodam em Node. O ponto de entrada é [`backend/server.js`](../backend/server.js).

### Express 5
- **O que é:** o framework web mais popular do Node — organiza rotas, middlewares e respostas HTTP.
- **Para que serve:** transformar requisições HTTP (`GET /api/colaboradores`) em respostas, de forma organizada.
- **Como foi usado aqui:** define toda a API REST (`app.use('/api/colaboradores', ...)`), serve os arquivos do front-end (`express.static`), e concentra segurança em **middlewares** (autenticação, permissão, CORS). Ver seção 4.1.

### SQL Server (Microsoft) + driver `mssql`
- **O que é:** o SQL Server é um banco de dados relacional da Microsoft; `mssql` é a biblioteca Node que conversa com ele.
- **Para que serve:** guardar os dados de forma estruturada (tabelas, relações) e consultá-los com SQL.
- **Como foi usado aqui:** é a **fonte de verdade** do sistema. O código usa `mssql` com **pool de conexão** ([`backend/db/index.js`](../backend/db/index.js)) e queries parametrizadas (`@id`) para evitar injeção de SQL. O esquema é criado por **migrations** (seção 4.4).

### JavaScript "puro" (Vanilla JS) no front-end
- **O que é:** JavaScript sem framework (sem React/Vue/Angular).
- **Para que serve:** dar comportamento às telas (montar HTML, tratar cliques, chamar a API).
- **Como foi usado aqui:** todo o front-end é Vanilla JS, dividido em **módulos por tela** ([`frontend/js/`](../frontend/js/): `core/`, `telas/` e `lib/`). Cada módulo se registra em `window` e é orquestrado pelo `app.js`. Não há build/compilação — os arquivos são servidos direto.

### HTML5 + CSS3
- **O que é:** as linguagens de estrutura (HTML) e estilo (CSS) das páginas web.
- **Como foi usado aqui:** existe **um único** [`index.html`](../frontend/index.html); as telas são montadas dinamicamente por JavaScript. O CSS é **separado por tela** ([`frontend/css/`](../frontend/css/)) para ficar organizável, com suporte a **tema claro/escuro** ([`themes.css`](../frontend/css/themes.css)).

### PWA (Progressive Web App)
- **O que é:** um conjunto de recursos que deixa um site se comportar como app instalável.
- **Para que serve:** o time pode "instalar" o ícone na área de trabalho e abrir em janela própria.
- **Como foi usado aqui:** via [`manifest.json`](../frontend/manifest.json) (ícones, cor de marca). **Sem** service worker, de propósito — para não cachear telas de um sistema com banco ao vivo.

### jsPDF (no navegador)
- **O que é:** biblioteca JavaScript que gera arquivos PDF no lado do cliente.
- **Como foi usado aqui:** exportar relatórios de escala/mensais em PDF direto do navegador ([`frontend/js/lib/pdf-utils.js`](../frontend/js/lib/pdf-utils.js), [`escala-relatorio.js`](../frontend/js/telas/escala-relatorio.js)).

### Docker + Docker Compose
- **O que é:** Docker empacota um programa (com tudo que precisa) em um "contêiner" isolado; o Compose sobe vários contêineres juntos.
- **Para que serve:** rodar o sistema sem instalar Node e SQL Server "na mão" na máquina.
- **Como foi usado aqui:** [`Dockerfile`](../Dockerfile) descreve a imagem do app; [`docker-compose.yml`](../docker-compose.yml) sobe **três serviços** — o banco (SQL Server), um passo que cria o banco vazio, e o app. Ver seção 5 e [`docs/DOCKER.md`](DOCKER.md).

### Serviço do Windows (schtasks / NSSM)
- **O que é:** formas de fazer um programa iniciar sozinho junto com o Windows.
- **Como foi usado aqui:** [`backend/lib/background-service.js`](../backend/lib/background-service.js) registra uma tarefa (`schtasks /SC ONSTART /RU SYSTEM`) para o servidor subir no **boot da máquina, sem login**. O NSSM é a alternativa mais robusta documentada nos guias.

### Git
- **O que é:** sistema de controle de versão.
- **Como foi usado aqui:** histórico do projeto, com convenção de mensagens (Conventional Commits em português). A branch `main` é a fonte de verdade.

### Testes em Node puro
- **O que é:** um pequeno executor de testes próprio, sem framework externo.
- **Como foi usado aqui:** [`tests/unit/run-tests.js`](../tests/unit/run-tests.js) roda os testes de regra de negócio (banco de horas, escala, permissões, validação, etc.) com `npm test`. Foca na **lógica pura**, sem precisar de banco.

---

## 3. Estrutura de pastas e arquivos

Visão de alto nível (ignorando `node_modules`, `.git` e afins):

```
App de escalas/
├── backend/                    ← todo o servidor (Node/Express)
│   ├── server.js               ← ponto de entrada: sobe e derruba o servidor HTTP
│   ├── app.js                  ← aplicação Express: middlewares, portões, rotas, erro
│   ├── config/                 ← config local (database.local.json) — NÃO versionado
│   ├── routes/                 ← a API REST, um arquivo por domínio
│   │   ├── colaboradores.js, escala.js, ausencias.js, feriados.js,
│   │   ├── plantoes.js, banco-horas.js, setores.js, jornada-semanal.js,
│   │   └── auth.js, usuarios.js, configuracao-banco.js, sistema.js
│   ├── db/                     ← acesso ao SQL Server
│   │   ├── index.js            ← conexão (pool)
│   │   └── database-config.js, database-schema.js, transactions.js, ...
│   ├── auth/                   ← segurança: sessão/login, permissões, rate limit, acesso por setor
│   ├── services/               ← regras de negócio (sem HTTP)
│   │   ├── escala.js, bancoHoras.js, plantoes.js, jornada-semanal.js, setores.js
│   │   ├── horas-em-carteira.js, exclusao-colaborador.js, folgas-domingo.js, tipos-escala.js
│   │   ├── backup-config.js, backup-service.js, backup-scheduler.js
│   │   └── backup/             ← especificacao.js (o que o backup guarda) e normalizacao.js
│   └── lib/                    ← utilitários gerais
│       ├── errors.js, validation.js, dominio.js, app-paths.js, app-state.js
│       ├── cors.js, rede.js, ip-cliente.js, cabecalhos-seguranca.js, tratador-erros.js
│       ├── bootstrap-banco.js  ← conectar + schema + retentativa + limpeza de sessões
│       └── background-service.js, folder-picker.js     (integração Windows)
│
├── frontend/                   ← tudo que roda no navegador
│   ├── index.html              ← página única; telas montadas via JS
│   ├── manifest.json           ← PWA
│   ├── style.css, css/*.css    ← estilos, separados por tela
│   └── js/                     ← módulos Vanilla JS
│       ├── core/               ← base carregada por todas as telas
│       │   ├── app.js          ← estado global e bootstrap (207 linhas)
│       │   ├── app/            ← 13 partes do antigo app.js, por responsabilidade
│       │   ├── api.js          ← camada única de acesso à API
│       │   ├── auth.js, permissoes.js, meus-setores.js  ← login, perfil e setores
│       │   └── runtime/        ← o antigo runtime-fixes.js, dividido
│       │       ├── normalizacao.js, dados-e-modais.js, relatorio-mensal.js
│       │       ├── escala-e-relatorios.js
│       │       └── plantao-colaboradores/  ← plantão, colaboradores, jornada
│       ├── telas/              ← uma pasta ou arquivo por tela
│       │   ├── escala-dia/ + escala-dia-editor.js, escala-dia-shared.js
│       │   ├── escala-relatorio/ + escala-relatorio.js
│       │   ├── dashboard/
│       │   ├── banco-horas.js, lancamentos.js, calendar.js
│       │   └── configuracoes-backup.js / configuracoes-usuarios.js
│       └── lib/                ← utilitários sem tela
│           └── pdf-utils.js, escala-report-utils.js, html-seguro.js (escapeHtml único)
│
├── database/
│   ├── migrations/             ← evolução do esquema (arquivos SQL datados)
│   └── seeds/dados-exemplo.sql ← dados de exemplo (setores, colaboradores)
│
├── docs/                       ← guias (Docker, servidor, time, robô de testes,
│                                  plano do instalador) + esta apostila
├── tests/
│   ├── unit/                   ← testes de lógica (Node puro, npm test)
│   ├── integracao/             ← rotas contra SQL Server descartável + golden master
│   ├── e2e/                    ← robô de testes no navegador (Playwright)
│   └── smoke.js                ← checagem de sintaxe (npm run smoke)
│
├── Dockerfile, docker-compose.yml   ← execução em contêiner
├── docker-compose.teste.yml         ← instância isolada para o robô de testes
├── docker/init-db.sh                ← cria o banco na primeira subida
├── package.json                     ← dependências e scripts (npm)
└── *.md                             ← README, CHANGELOG, CONTRIBUTING, SECURITY
```

### A lógica por trás dessa organização

- **`backend/routes/` x `backend/services/`:** as *rotas* só cuidam de HTTP (ler o pedido, validar, responder). A *regra de negócio* fica em `services/`, isolada — assim ela pode ser **testada sem subir servidor** (é o que os `tests/unit/` fazem). O acesso ao banco fica em `db/`, a segurança em `auth/` e os utilitários gerais em `lib/`.
- **`frontend/js/` um arquivo por tela:** o front-end é grande (~18 mil linhas); separar por tela evita um arquivo único impossível de manter. Em `core/` fica o que toda tela usa, em `telas/` um arquivo por tela e em `lib/` os utilitários sem interface. Cada arquivo é um **módulo ES** e importa o que usa (`import { ... } from`), então as dependências estão escritas no próprio código e a ordem das tags deixou de importar: o `index.html` carrega só `js/main.js`. O `api.js` centraliza **todo** acesso à API, então trocar algo na comunicação mexe em um lugar só.
- **`database/migrations/`:** o esquema não é criado "na mão"; cada mudança é um arquivo SQL datado, aplicado em ordem. Isso deixa o banco **reproduzível** e versionado junto do código.

---

## 4. Documentação do código

> **Como ler esta seção:** os arquivos **centrais** (o coração do sistema) são explicados em detalhe, quase linha a linha. Os arquivos **gigantes de interface** (milhares de linhas de UI repetitiva) são explicados **por blocos/funções**, que é o que realmente ajuda a entender — linha a linha ali seria só ruído.

### 4.1 Backend — ponto de entrada e infraestrutura

#### `backend/server.js` e `backend/app.js` — o coração do servidor

> **Atualização (auditoria de 2026-09):** o antigo `server.js` foi dividido por
> responsabilidade. O que esta seção descreve continua valendo, mas mora agora em:
> `app.js` (middlewares, portões e rotas), `lib/cors.js` (CORS),
> `lib/rede.js` (endereços de acesso e porta), `lib/bootstrap-banco.js` (conexão,
> schema e retentativa) e `server.js` (subir e derrubar o servidor). Os números de
> linha abaixo se referem ao arquivo antigo. Mudaram também: o corpo JSON é
> limitado a 1 MB (25 MB só na restauração de backup), toda resposta leva
> cabeçalhos de segurança (`lib/cabecalhos-seguranca.js`), o IP do cliente só vem
> de `X-Forwarded-For` com `TRUST_PROXY` configurado, erro inesperado não expõe
> mensagem interna (`lib/tratador-erros.js`) e conta com senha provisória só
> acessa `/api/auth/*` até trocar a senha.

Este arquivo faz o "sanduíche" de uma requisição: ela entra, passa por várias camadas de segurança (os *middlewares*), chega na rota certa, e a resposta volta. A ordem em que as camadas são declaradas **importa** — é a ordem em que a requisição passa por elas.

**Imports e configuração inicial (linhas 1–36):**

```js
const express = require('express');
const os = require('os');
const path = require('path');
const cors = require('cors');
```

- `express`: o framework web. `os`: para descobrir nome da máquina e IPs da rede. `path`: para montar caminhos de arquivo de forma segura entre sistemas. `cors`: controla quais sites podem chamar a API.
- Em seguida importa o `db` (conexão), utilitários (`backup`, `auth`, `permissoes`, `database-schema`) e **cada arquivo de rota**. Importar tudo no topo deixa explícito, logo de cara, tudo que o servidor usa.
- `DEFAULT_PORT = 4450` e `DEFAULT_HOST = '0.0.0.0'`. O host `0.0.0.0` significa "aceite conexões de qualquer interface de rede" — é isso que permite outras máquinas da rede acessarem (diferente de `localhost`, que só aceitaria a própria máquina).
- `frontendPath` aponta para a pasta `frontend` (um nível acima de `backend`). É de lá que os arquivos das telas são servidos.

**CORS same-origin por padrão (linhas 40–102):**

Esta é uma decisão de segurança importante. As funções `normalizeCorsOrigin`, `parseCorsOrigins`, `isSameOriginRequest` e `corsOptionsDelegate` implementam a regra:

> *Requisições da própria página são liberadas; requisições vindas de outro site só passam se o endereço estiver na lista `CORS_ORIGINS`. Por padrão (lista vazia), todo site de terceiros é bloqueado.*

O **porquê:** navegadores mandam o cabeçalho `Origin` até em chamadas da própria página. Se a gente simplesmente bloqueasse toda origem, o próprio front-end pararia. Então o código compara o `Origin` recebido com o `Host` da requisição (`isSameOriginRequest`) — se batem, é a própria página, libera. Isso evita que um site malicioso aberto no navegador do usuário use a sessão autenticada dele para chamar a API.

**Descoberta de endereços de acesso (linhas 104–147):** `getServerAccessUrls` monta a lista de URLs por onde o servidor pode ser acessado (localhost, nome da máquina, e cada IP de rede IPv4). É isso que alimenta a tela de "endereços para o time".

**Saúde e diagnóstico (linhas 194–236):** `getDatabaseHealth` roda um `SELECT 1` para testar o banco; `getNetworkStatusPayload` monta um retrato do servidor (host, porta, URLs, IP do cliente, estado do CORS). Alimenta a tela de diagnóstico de rede.

**Montagem dos middlewares (linhas 238–241):**

```js
app.disable('x-powered-by');        // esconde que é Express (não dá pistas a atacantes)
app.use(cors(corsOptionsDelegate)); // aplica a regra de CORS acima
app.use(express.json({ limit: '25mb' })); // entende corpo JSON (limite alto p/ backups)
app.use(express.static(frontendPath));    // serve os arquivos do front-end
```

**Rotas públicas e o "modo bootstrap" (linhas 243–296):** aqui está uma sacada elegante. Antes do login existir, há um impasse: para logar você precisa de um banco, e para configurar o banco a tela pedia login. A solução é o **modo bootstrap** (`isBootstrapConfigRequest`): *enquanto nenhum banco estiver configurado*, as rotas mínimas de configuração ficam abertas sem login (não há dado a proteger ainda). Assim que uma conexão válida é salva, `isDatabaseConfigured()` vira `true` e o cadeado fecha sozinho. `/api/health` e `/api/setup/status` também são públicas de propósito.

- **Linha 289–296:** o portão de autenticação. Tudo em `/api` (fora as exceções) passa por `requireAuth` — sem sessão válida, a requisição é barrada.

**Portão único de permissão (linhas 298–322):** em vez de espalhar "só admin" por cada rota (e correr o risco de esquecer numa rota nova), a checagem é feita **num único ponto**. `checkAccess` (do `permissoes.js`) decide: admin passa por tudo; usuário comum só faz leitura (GET) e nunca entra nas áreas administrativas. **Por quê num lugar só?** Assim, qualquer rota nova já nasce protegida por padrão.

**As rotas de domínio (linhas 341–351):** cada domínio é conectado ao seu arquivo:

```js
app.use('/api/colaboradores', colaboradoresRoutes);
app.use('/api/escala', escalaRoutes);
// ... e assim por diante
```

**Fallback do front-end (linhas 353–355):** qualquer URL que **não** comece com `/api` devolve o `index.html`. Isso é o que faz o app de página única funcionar: o navegador pede `/escala`, o servidor devolve o HTML, e o JavaScript decide o que mostrar.

**Tratamento de erro central (linhas 357–373):** dois middlewares finais. O primeiro transforma "rota não encontrada" num erro 404. O segundo é o **manipulador de erros**: pega qualquer erro que tenha borbulhado, usa `statusCode`/`message` (do `AppError`), loga no console apenas erros graves (≥500) e responde um JSON padronizado `{ error, details }`. Centralizar isso garante que o cliente **nunca** recebe um "stack trace" cru.

**Ciclo de vida do servidor (a partir da 375):** `start()` sobe o `app.listen`, e no callback tenta conectar no banco e rodar `ensureApplicationSchema` (criar/verificar tabelas). Repare (visto na seção sobre o boot): se o banco falhar aqui, o servidor **continua no ar** e apenas loga o erro, em vez de derrubar tudo. Há também tratamento de `EADDRINUSE` (porta ocupada) e desligamento gracioso (fecha o pool ao receber sinal de encerramento).

#### `backend/db/index.js` — a conexão com o banco

Arquivo curto e central. Gerencia **um pool de conexões** reaproveitável.

```js
let poolPromise = null;
let activePoolFingerprint = null;
```

- **O que é um pool:** abrir conexão com banco é caro. Um *pool* mantém um conjunto de conexões prontas e reaproveitadas. Aqui, `poolPromise` guarda a promessa do pool ativo.
- **O "fingerprint" (impressão digital):** `activePoolFingerprint` guarda uma assinatura da configuração atual (host, banco, usuário...). Isso resolve um problema real: se o usuário **troca a configuração do banco em runtime** (pela tela de configuração), o código percebe que a assinatura mudou (`activePoolFingerprint !== fingerprint`), fecha o pool antigo e abre um novo apontando para o banco certo. Sem isso, o sistema continuaria falando com o banco velho.
- `conectar(options)`: devolve o pool (criando se preciso). Aceita `options.fresh` para uma conexão descartável (usada em testes de conexão) e `options.settings` para forçar uma configuração.
- **Linha 32:** `pool.on('error', ...)` — se o pool cair (rede caiu, banco reiniciou), ele se auto-invalida (`poolPromise = null`), então a próxima chamada reconecta. É resiliência automática.
- `testarConexao(settings)`: abre um pool **descartável**, roda um `SELECT @@SERVERNAME` para provar que a conexão funciona, e fecha. É o que a tela "Testar Conexão" usa.
- `fecharConexao()`: fecha o pool com segurança (usado ao trocar de banco e no desligamento).
- **Exporta** `sql` (o próprio driver, para os tipos como `sql.Int`), `conectar`, `fecharConexao`, `testarConexao`.

---

### 4.2 Backend — banco, segurança e regras de negócio

Tudo que **não** é HTTP fica fora de `routes/`, em quatro pastas: `db/` (acesso ao banco), `auth/` (segurança), `services/` (regras de negócio) e `lib/` (utilitários gerais). Ficam separados porque podem (e devem) ser testados isoladamente.

#### Segurança

**`auth.js` — autenticação (login, sessão, senha).** É onde mora a proteção de acesso.
- **Hash de senha (`hashPassword`/`verifyPassword`):** senhas **nunca** são guardadas em texto puro. Usa `crypto.scryptSync` com um "sal" (salt) aleatório por usuário. O `scrypt` é propositalmente lento, o que dificulta ataques de força bruta. Na verificação, usa `crypto.timingSafeEqual` — uma comparação de tempo constante que evita vazar informação pela **duração** da comparação.
- **Sessões (`sessions = new Map()`):** ao logar, gera um token aleatório (`crypto.randomBytes(32)`) guardado num cookie `escalas_sid`, com validade de 12h (`SESSION_TTL_MS`). As sessões ficam **em memória** — simples e suficiente para um servidor único; reiniciar o servidor desloga todo mundo (aceitável aqui). Existe `revokeUserSessions` para encerrar na hora todas as sessões de um usuário (ao desativar a conta ou resetar senha).
- **`ensureDefaultAdmin`:** na primeira execução (tabela de usuários vazia), cria o admin. A senha vem de `ADMIN_PASSWORD` (variável de ambiente) ou é gerada aleatória e mostrada no console. *Por que isso importa:* quando o servidor roda como serviço do Windows (sem console), a senha **precisa** vir da variável, senão ninguém consegue o primeiro login.
- **`requireAuth`:** o middleware que o `server.js` usa para barrar quem não tem sessão válida.

**`permissoes.js` — quem pode o quê.** Regra de perfil isolada do HTTP (por isso é fácil de testar).
- `ADMIN_ONLY_PREFIXES`: as áreas que **nem leitura** um usuário comum acessa (`/configuracao-banco`, `/sistema`, `/usuarios`) — expõem infraestrutura.
- `checkAccess({ isAdmin, method, path })`: a decisão central. Admin passa por tudo; usuário comum só pode métodos de leitura (`GET/HEAD/OPTIONS`) e nunca nas áreas administrativas. Retorna `null` (liberado) ou `{ status, message }` (negado). É consumido no portão único do `server.js`.

**`rate-limit.js` — freio contra força bruta.** Limitador de tentativas de login, em memória, sem dependência externa.
- `createRateLimiter` conta falhas por chave (IP + usuário) numa **janela deslizante** (`DEFAULT_WINDOW_MS = 15min`); ao passar de `5` falhas, bloqueia por 15 min.
- `check(key)` é chamado **antes** de validar a senha (já bloqueado?); `registerFailure(key)` quando a senha erra; `reset(key)` quando acerta (limpa o histórico). Detalhe elegante: o tempo é injetável (`options.now`), o que deixa os testes controlarem o relógio sem esperar de verdade.

#### Banco e configuração

**`database-config.js`** — lê/valida/salva a configuração de conexão. Fonte da configuração, **em ordem de prioridade:** arquivo `database.local.json` → variáveis de ambiente (`DB_HOST`, `DB_USER`, ...) → padrões. É o que permite o Docker configurar tudo por variável, sem tela de setup.

**`database-schema.js`** — o "aplicador de migrations". `ensureApplicationSchema(pool)` roda, em ordem, os arquivos `.sql` de `database/migrations/`, cria o admin inicial e confere se todas as tabelas obrigatórias existem. `applyExampleSeed(pool)` roda o seed de dados de exemplo (idempotente). É chamado no boot e ao salvar uma nova configuração de banco.

**`schema.js`** — inspeciona o esquema real do banco em runtime (quais tabelas/colunas existem), com um cache curto. Serve para o código se adaptar a bancos em versões ligeiramente diferentes (ex.: saber se a coluna de banco de horas já existe).

**`app-paths.js`** — resolve **onde** gravar dados/config. Usa a variável `APP_DE_ESCALAS_DATA_DIR` (ex.: `C:\ProgramData\...` ou `/data` no Docker) ou, na falta dela, a pasta `backend/config`. Centralizar isso evita gravar dentro de "Program Files" (que é somente-leitura em instalações).

**`transactions.js`** — `withTransaction(sql, pool, task)`: embrulha uma operação numa transação SQL. Se `task` der certo, faz `commit`; se der erro, `rollback`. Garante que operações com vários passos (ex.: mexer em escala + banco de horas) sejam **tudo ou nada**.

#### Backup

- **`backup-config.js`** — guarda as preferências de backup (pasta de destino, agenda).
- **`backup-service.js`** — gera o backup (exporta os dados do banco para um arquivo JSON) e restaura. Inclui uma "rede de segurança": antes de restaurar, tenta salvar o estado atual, para poder voltar atrás.
- **`backup-scheduler.js`** — agenda backups automáticos periódicos (via `setInterval`).

#### Regras de negócio (o "miolo" do domínio)

Estes são os arquivos que sabem **as contas e regras** de escala. As rotas apenas os chamam.

- **`escala.js`** (~1.576 linhas) — o maior. Cuida da Escala do Dia: montar a grade a partir dos colaboradores e da jornada, aplicar almoço, sincronizar os padrões do colaborador com a escala (`syncColaboradorDefaultsToEscalaDia`), calcular estados de cada faixa de horário.
- **`bancoHoras.js`** — as contas de banco de horas: soma de créditos/débitos, saldo, movimentos.
- **`plantoes.js`** — regras de plantão (sábado/domingo), inclusive o tipo do plantão.
- **`jornada-semanal.js`** — a jornada que varia por dia da semana (normalizar payload, substituir a jornada de um colaborador).
- **`setores.js`** — validação e resolução de setor (existe? id válido?).

#### Validação, erros e integração Windows

- **`validation.js`** — as "porteiras" de entrada: `ensurePositiveInt`, `normalizeOptionalText`, `normalizeIsoDate`, `normalizeNullableTime`, `validateWorkSchedule`, `normalizeEnum` (que remove acentos e padroniza), etc. Toda rota passa o corpo da requisição por essas funções antes de tocar no banco. **Por quê:** nunca confiar no que chega do cliente.
- **`errors.js`** — define a classe `AppError` (com `statusCode`, `message`, `details`). É o "idioma de erro" do sistema: qualquer camada lança um `AppError`, e o manipulador central no `server.js` sabe traduzi-lo numa resposta HTTP limpa.
- **`background-service.js`** — registra/consulta/remove a tarefa do Windows que sobe o servidor no boot (via `schtasks`). Trata o caso de "acesso negado" com uma mensagem clara (precisa rodar como administrador).
- **`folder-picker.js`** — abre o seletor nativo de pasta do Windows (para escolher a pasta de backup).
- **`database-connection-error.js`** — traduz erros técnicos do driver (`mssql`) em mensagens compreensíveis (ex.: "não foi possível alcançar o servidor").

---

### 4.3 Backend — rotas (a API REST)

Cada arquivo em `routes/` é um **Router do Express** que agrupa os endpoints de um domínio. Todos seguem o **mesmo padrão**, o que deixa o código previsível.

#### O padrão de uma rota (vale para quase todas)

```js
const express = require('express');
const router = express.Router();
const { sql, conectar } = require('../db');
const { AppError } = require('../lib/errors');
const { /* validadores */ } = require('../lib/validation');

// 1) Uma função que monta e valida o "payload" a partir do corpo da requisição
function buildColaboradorPayload(body, fallback = {}) { /* valida cada campo */ }

// 2) Os endpoints REST
router.get('/', async (req, res, next) => { /* listar */ });
router.post('/', async (req, res, next) => { /* criar */ });
router.put('/:id', async (req, res, next) => { /* atualizar */ });
router.delete('/:id', async (req, res, next) => { /* remover */ });

module.exports = router;
```

Três princípios se repetem:
1. **Validar antes de tocar no banco** — o `buildXPayload` usa os validadores de `validation.js`. Nada entra sem passar por lá.
2. **Queries parametrizadas** — sempre `pool.request().input('id', sql.Int, id).query('... WHERE Id = @id')`. **Nunca** concatenar strings de SQL. Isso previne **injeção de SQL**.
3. **Erros via `next(error)`** — a rota não formata erro; ela repassa para o manipulador central do `server.js`.

#### Exemplo detalhado — `routes/colaboradores.js`

- **`buildColaboradorPayload(body, fallback)` (linhas 24+):** monta o objeto do colaborador validando cada campo — `nome` (obrigatório, até 300 caracteres), horários de trabalho/almoço (`normalizeNullableTime`), `setorId` (existe?), e por fim `validateWorkSchedule` (o fim é depois do início? o almoço cabe no expediente?). O parâmetro `fallback` permite atualizações parciais: se o `body` não trouxe um campo, usa o valor atual do registro.
- Ao criar/editar, além de gravar o colaborador, a rota chama `syncColaboradorDefaultsToEscalaDia` (de `escala.js`) — para que mudar o horário padrão do colaborador **reflita** na escala do dia. Operações que mexem em várias tabelas usam `withTransaction` (tudo ou nada).
- Repare nos imports: a rota puxa regras de `services/` (`escala`, `jornada-semanal`, `setores`, `exclusao-colaborador`), o controle de setores de `auth/acesso-setores` e `lib/validation`. (Até a auditoria de 2026-09 as rotas também consultavam `db/schema` para descobrir, a cada requisição, se colunas existiam; isso saiu — o servidor só libera as rotas depois de aplicar todas as migrations.) Isso mostra o desenho: **a rota coordena; os serviços fazem**.

#### Papel de cada arquivo de rota

| Arquivo | Domínio / o que expõe |
|---|---|
| `auth.js` | Login, logout, "quem sou eu" (`/me`), trocar senha. Montado **antes** do portão de permissão (para o usuário poder sair/trocar senha). Usa o `rate-limit` no login. |
| `colaboradores.js` | CRUD de colaboradores + jornada + sincronização com a escala. |
| `setores.js` | CRUD de setores. |
| `ausencias.js` | CRUD de ausências (dia inteiro ou parcial). |
| `feriados.js` | CRUD de feriados (com filtro por ano/mês). |
| `plantoes.js` | CRUD de plantões (sábado/domingo). |
| `banco-horas.js` | Consulta de saldo e lançamento de movimentos de banco de horas. |
| `escala.js` | A Escala do Dia: buscar a grade de um dia, aplicar almoço, editar. |
| `jornada-semanal.js` | Jornada que varia por dia da semana. |
| `configuracao-banco.js` | **(Admin)** Testar/salvar conexão, verificar tabelas, carregar dados de exemplo, e todo o fluxo de **backup** (gerar, restaurar, agendar, escolher pasta). |
| `sistema.js` | **(Admin)** Estado do servidor em segundo plano (instalar/remover início automático, iniciar/parar). |
| `usuarios.js` | **(Admin)** Gestão de contas de usuário. |

> As três últimas (`configuracao-banco`, `sistema`, `usuarios`) são as áreas **somente-admin**, protegidas pelo portão central de permissão (seção 4.1).

---

### 4.4 Banco de dados — migrations e seed

#### A ideia das migrations

O esquema do banco **não** é criado à mão. Cada evolução é um arquivo `.sql` **datado** em `database/migrations/`, aplicado em ordem por `ensureApplicationSchema` (seção 4.2). Duas características importantes:

- **Aplicadas uma vez por banco:** `backend/db/migracoes.js` registra cada script em `dbo.SchemaMigrations` (nome e checksum) e, a cada boot, só roda os que ainda não foram aplicados. Script já aplicado cujo arquivo mudou **não** roda de novo — só gera um aviso no log: correção de schema é sempre um arquivo novo, acrescentado ao fim da lista.
- **Idempotentes:** mesmo assim, cada arquivo pode rodar várias vezes sem estragar nada (guardas como `IF OBJECT_ID('dbo.Setores') IS NULL` e `IF COL_LENGTH(...) IS NULL`). Isso cobre um banco antigo, sem registros, que roda tudo uma vez, e um script que falhe no meio e seja repetido na subida seguinte.
- **Batches com `GO`:** o SQL é dividido por `GO` (separador de lote do SQL Server), executado um bloco por vez.

Ordem dos arquivos:

| Arquivo | O que cria/ajusta |
|---|---|
| `2026-04-27-base-schema.sql` | Tabelas base: `Colaboradores`, `Feriados`, e o núcleo. |
| `2026-04-23-banco-horas.sql` | `BancoHorasMovimentos` (créditos/débitos). |
| `2026-04-24-escala-dia.sql` | `escala_dia` (a escala materializada por dia). |
| `2026-05-21-setores-plantoes-almoco.sql` | `Setores`, `plantoes` (com tipo), `AlmocosPersonalizados`, e liga colaborador↔setor. |
| `2026-05-28-colaborador-jornada-semanal.sql` | `ColaboradorJornadaSemanal`. |
| `2026-07-08-usuarios.sql` | `Usuarios` (contas de acesso). |
| `2026-07-09-usuarios-admin.sql` | Coluna/ajuste de admin em `Usuarios`. |
| … | (a lista completa, na ordem de aplicação, está em `SCHEMA_SCRIPT_PATHS`, `backend/db/database-schema.js`) |
| `2026-09-28-plantao-colaborador.sql` | `PlantaoColaborador`: a equipe do plantão sai do JSON `plantoes.colaboradores_ids` para uma tabela de ligação com FK. |

#### As tabelas principais

| Tabela | Guarda | Colunas-chave |
|---|---|---|
| `Colaboradores` | As pessoas | `Nome`, `TrabalhoInicio/Fim`, `AlmocoInicio/Fim`, `SetorId` |
| `Setores` | Agrupamentos | `Nome` (único), `Ativo`, `Ordem` |
| `ColaboradorJornadaSemanal` | Horário por dia da semana | ligação com `Colaboradores` |
| `Ausencias` | Faltas/afastamentos | período, tipo |
| `Feriados` | Datas especiais | `Nome`, `Data`, `Tipo` (nacional/estadual/municipal) |
| `plantoes` | Trabalho de fim de semana | `data_plantao`, `tipo_plantao` (sabado/domingo) |
| `PlantaoColaborador` | Quem faz cada plantão | `PlantaoId`, `ColaboradorId` (FK para os dois lados) |
| `SchemaMigrations` | Migrations já aplicadas | `Nome`, `Checksum`, `AplicadaEm` |
| `BancoHorasMovimentos` | Créditos/débitos de horas | colaborador, valor, data |
| `escala_dia` | A escala materializada por dia | colaborador, data, horários |
| `AlmocosPersonalizados` | Almoço específico num dia | colaborador, data, início/fim |
| `Usuarios` | Contas de acesso | `Username`, `PasswordHash`, `PasswordSalt`, `IsAdmin`, `Ativo` |

#### O seed de exemplo — `database/seeds/dados-exemplo.sql`

Um script **opcional** e **idempotente** para um banco novo não começar vazio. Só faz `INSERT` com guarda `IF NOT EXISTS` — **nunca** apaga nem sobrescreve dados existentes. Adiciona: alguns setores e colaboradores de demonstração (marcados "(exemplo)"). Feriado nacional **não** entra: o sistema calcula (ver `backend/services/feriados-nacionais.js`), e gravar no banco fazia o mesmo dia aparecer duas vezes na tela. É acionado pelo botão "Carregar Dados de Exemplo" (ou pelo endpoint `POST /configuracao-banco/carregar-exemplos`).

---

### 4.5 Frontend — arquitetura e módulos

#### A arquitetura em uma frase

Uma **única página** (`index.html`) que carrega vários **módulos JavaScript**, cada um responsável por uma tela. Não há framework nem etapa de build: os arquivos `.js` são **módulos ES nativos** servidos direto (o navegador resolve os `import`), a entrada é `js/main.js`, e `carregarPagina` (em `core/app/modais-e-navegacao.js`) decide qual tela montar.

**Por que sem framework?** É uma escolha de simplicidade: qualquer navegador roda direto, não precisa de Node/npm no cliente, e o deploy é só copiar arquivos. O custo é que a organização fica por conta da disciplina do código (um arquivo por tela, `api.js` central).

#### `js/core/api.js` — a camada única de comunicação (central)

Todo acesso à API passa por aqui. Isso concentra num só lugar coisas como URL base, tratamento de sessão expirada e formato de erro.

- **URL base dinâmica (`getRuntimeApiBaseUrl`, linhas 3–14):** a base da API é derivada de `window.location.origin`. Ou seja: se você abre o app por `http://192.168.0.10:4450`, a API é chamada nesse mesmo endereço — **sem configuração**. É isso que faz o mesmo código funcionar em localhost, no IP da rede ou no Docker.
- **Vigia de sessão no `fetch` (`installSessionExpiryWatcher`):** o código "envelopa" o `window.fetch` nativo só para observar as respostas e detectar sessão expirada. (Até 2026-09 ele também reescrevia URLs antigas com `:3000` fixo; as chamadas passaram a usar `window.API` e a reescrita saiu.)
- **Sessão expirada (`notifyIfSessionExpired`, linhas 54–64):** se qualquer chamada de API (fora as de `/auth`) responder **401**, dispara o evento `auth:expired`. A aplicação escuta esse evento e volta para a tela de login — assim o usuário não fica "preso" numa tela quebrada quando a sessão de 12h vence.
- **O objeto `API` (linhas 88+):**
  - `request(endpoint, options)`: o coração. Garante `Content-Type: application/json` quando há corpo, envia o cookie de sessão, lê a resposta (JSON ou texto), e — se `!response.ok` — lança um `Error` com `.status` e `.payload`. Assim, quem chama a API só precisa de um `try/catch`.
  - `get/post/put/delete`: atalhos sobre `request`.
  - `toQuery(params)`: monta query strings ignorando valores vazios.
  - **Métodos de domínio:** funções nomeadas para cada endpoint — `getColaboradores()`, `getEscalaDia(data)`, `verificarTabelasBanco()`, `carregarExemplosBanco()`, etc. As telas chamam esses nomes, nunca URLs cruas.

#### Os módulos de tela (por responsabilidade)

Caminhos relativos a `frontend/js/`.

| Arquivo | Responsabilidade |
|---|---|
| `core/app.js` (~4.400 linhas) | O **orquestrador**. Monta o HTML das telas, controla a navegação entre elas, inicializa cada tela (`inicializarConfiguracaoBancoTela`, etc.), a barra lateral do app e as configurações. É grande porque concentra o "esqueleto" de várias telas. |
| `core/auth.js` | A tela e o fluxo de **login** (enviar credenciais, tratar erro, reagir ao evento `auth:expired`). |
| `telas/escala-dia-editor.js` (~1.826 linhas) | A **Escala do Dia**: monta a grade de horários (timeline), o arrasta-e-solta do almoço, o painel lateral de edição, a navegação por dia. |
| `telas/escala-dia-shared.js` | Funções compartilhadas da Escala do Dia (conversões de horário, helpers usados pelo editor e por outros). |
| `telas/lancamentos.js` (~1.754 linhas) | O cadastro/edição de lançamentos (colaboradores, jornada, etc.) via modais. |
| `telas/dashboard/` | A tela inicial / painel com indicadores. |
| `telas/calendar.js` | Componente de calendário (seleção de datas, feriados). |
| `telas/escala-relatorio.js` (~1.822 linhas) + `lib/escala-report-utils.js` | Geração dos relatórios de escala (mensal, por escala). |
| `lib/pdf-utils.js` | Helpers de PDF (jsPDF/canvas) usados pelos relatórios. |
| `telas/configuracoes-backup.js` | A tela de configuração de **banco e backup** (testar/salvar conexão, gerar/restaurar backup, carregar exemplos). |
| `telas/configuracoes-usuarios.js` | A tela de gestão de **usuários** (admin). |
| `core/permissoes.js` | Aplica no front-end o que o perfil pode ver/fazer (esconde botões que o usuário comum não usa). |
| `core/estado.js` | O **estado compartilhado** entre telas (listas carregadas da API, seleções, caches usados por mais de um módulo). Estado de um módulo só fica dentro dele. |
| `core/acoes-html.js` | As funções chamadas por atributos `onclick="..."` dos templates — as únicas publicadas em `window`, porque um atributo `on*` só enxerga o escopo global. |
| `core/layout-pagina.js` | Barra lateral (navegação, botão ativo, recolher) e indicador de carregamento. |
| `core/runtime/` | O antigo `runtime-fixes.js`. Apesar do nome antigo, contém **funcionalidades de verdade** (e, desde a migração para módulos, nenhum ajuste por cima de outro arquivo): caches e modais (`dados-e-modais.js`), relatório do calendário (`relatorio-mensal.js`), escala e relatórios de plantão (`escala-e-relatorios.js`) e a pasta `plantao-colaboradores/` com a tela de plantão, o editor de colaborador e a jornada semanal. |

> **Nota de manutenção:** o front não tem bundler — são **módulos ES** (desde 2026-09; antes eram `<script>` clássicos num escopo global, com ordem de carga fixa e arquivos que sobrescreviam funções de outros via `window.X = X = function...`).
>
> - Tela ou arquivo novo: exporte o que outros usam e importe onde for usar; se o módulo só registra listeners e ninguém o importa, adicione-o em `js/main.js`. Os dois `index.html` (`frontend/` e `demo/`) não mudam.
> - Estado compartilhado entre telas vai em `core/estado.js` (`estado.colaboradores`, ...). Um `export let` não serve para isso: quem importa não pode reatribuir.
> - Função chamada por `onclick="..."` num template precisa estar em `core/acoes-html.js`; o resto não vai para `window`.
> - `npm run lint` acusa nome não importado e função sem uso; `npm run analisar:codigo-morto` acusa export que ninguém importa e import de algo que não existe.

#### PWA

`manifest.json` declara nome, ícones e cor de marca, permitindo "instalar" o app. **Não há service worker** de propósito: como o sistema mostra dados ao vivo do banco, cachear telas causaria informação velha.

O cache de CSS/JS é controlado por **header, não por query string**: `backend/server.js` serve o front-end com `Cache-Control: no-store, must-revalidate` e sem `ETag`/`Last-Modified`, o que cobre também o `index.html` — que, por ser o documento de entrada, não teria onde pendurar um `?v=`. Os links são limpos por isso (`js/core/app.js`, não `js/core/app.js?v=...`): a query string é anterior ao header, deixou de ter efeito quando ele entrou e só sobrava como um passo manual de bump que ninguém mantinha em dia. A demo publicada na Vercel não passa pelo Express, então declara o mesmo header em `vercel.json`.

---

### 4.6 Frontend — CSS por tela

O CSS é **separado por tela/assunto** para não virar um arquivo único impossível de achar as coisas. Cada arquivo cuida de um pedaço:

| Arquivo | Cuida de |
|---|---|
| `base.css` | Fundamentos: variáveis (cores, raios, sombras), reset, tipografia. É a base que os outros usam. |
| `themes.css` | Tema claro/escuro (troca os valores das variáveis conforme `data-theme`). |
| `components.css` | Componentes reutilizáveis: botões, chips, badges, campos de formulário. |
| `sidebar.css` | A barra de navegação lateral do app. |
| `modals.css` | Janelas modais (cadastros, confirmações). |
| `auth.css` | A tela de login. |
| `dashboard.css` | O painel inicial. |
| `escala.css` | A **Escala do Dia** (a timeline de horários, o painel do editor). É um dos maiores. |
| `calendar.css` | O componente de calendário. |
| `colaboradores.css` | A tela de colaboradores. |
| `feriados.css` | A tela de feriados. |
| `plantao.css` | A tela de plantões. |
| `relatorios.css` | Os relatórios. |
| `configuracoes.css` | As telas de configuração (banco, backup, usuários). |
| `style.css` | Estilos gerais/legados que ainda não foram para um arquivo específico. |

> **Padrão importante:** as cores vêm de **variáveis CSS** (ex.: `var(--primary)`, `var(--card)`) definidas em `base.css`/`themes.css`. Por isso o tema escuro funciona sem reescrever tudo — só troca os valores das variáveis.

---

## 5. Como executar o projeto

Há dois caminhos: **com Docker** (mais simples, não precisa instalar Node/SQL) ou **local** (Node + SQL Server na máquina). Escolha um.

### Caminho A — Com Docker (recomendado)

Pré-requisito: **Docker Desktop** instalado e rodando.

1. **Preparar as senhas** (na pasta do projeto):
   ```bash
   cp .env.docker.example .env
   ```
   Abra o `.env` e troque `DB_PASSWORD` (forte: maiúscula, minúscula, número e símbolo) e `ADMIN_PASSWORD`.

2. **Subir tudo** (a primeira vez baixa a imagem do SQL Server, ~1,5 GB):
   ```bash
   docker compose up -d --build
   ```

3. **Acompanhar** até aparecer "Banco de dados conectado com sucesso":
   ```bash
   docker compose logs -f app
   ```

4. **Abrir:** <http://localhost:4450> e logar com `admin` + a senha do `.env`.

Comandos úteis: `docker compose stop` (para), `docker compose start` (sobe), `docker compose down` (remove contêineres, mantém dados), `docker compose down -v` (apaga **tudo**, inclusive dados). Detalhes em [`docs/DOCKER.md`](DOCKER.md).

### Caminho B — Local (Node + SQL Server)

Pré-requisitos: **Node.js** (LTS) e **SQL Server** (Express serve) instalados; um banco vazio criado (ex.: `SoftwareEscalas`).

1. **Instalar as dependências:**
   ```bash
   npm install
   ```

2. **Configurar o banco** (uma das opções):
   - **Pela tela:** rode o servidor (passo 3) e, na primeira vez, a própria tela de configuração pede host, banco, usuário e senha.
   - **Por variável de ambiente:** copie `.env.example` para `.env` e preencha `DB_SERVER` (ex.: `localhost\SQLEXPRESS`), `DB_DATABASE`, `DB_USER`, `DB_PASSWORD` e um `ADMIN_PASSWORD`.

3. **Rodar o servidor:**
   ```bash
   npm start
   ```
   O servidor sobe na porta **4450**, cria as tabelas automaticamente (migrations) e o admin inicial. Abra <http://localhost:4450>.

   Com Docker, `docker compose up -d --build` sobe o app e o banco juntos.

### Scripts do `npm`

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o servidor (`node backend/server.js`). |
| `npm test` | Roda os testes de lógica (banco de horas, escala, permissões, validação...). |
| `npm run smoke` | Checagem rápida de sintaxe (`node --check`) em todos os arquivos-chave. |
| `npm run verificar` | Sintaxe, lint, tipos, formatação e testes unitários (o mesmo que o CI roda). |
| `npm run test:integracao` | Testes das rotas contra um SQL Server descartável (`npm run integracao:banco:subir` antes). |
| `npm run analisar:codigo-morto` | Acusa exports do frontend que nenhum módulo importa e imports quebrados. |

### Acesso pelo time (rede)

Numa máquina servidora, depois de subir, descubra o IP (`ipconfig`), libere a porta 4450 no firewall, e passe ao time o endereço `http://<ip-do-servidor>:4450`. Cada pessoa pode "instalar" o ícone pelo menu do navegador (PWA). Guia completo em [`docs/SERVIDOR-COMO-INSTALAR.md`](SERVIDOR-COMO-INSTALAR.md) e [`docs/README-TIME.md`](README-TIME.md).

---

> **Fim da apostila.** Este documento reflete o estado do projeto na versão 1.6.1 (04/08/2026). Ao evoluir o código, vale revisitar as seções afetadas — especialmente a 4 (documentação do código) e a 4.4 (novas migrations).






