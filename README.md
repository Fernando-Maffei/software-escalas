# Central de Escalas

![Versão](https://img.shields.io/badge/versão-1.6.3-6366f1)
![Node](https://img.shields.io/badge/Node-20%2B-3c873a)
![Licença](https://img.shields.io/badge/licença-proprietária-lightgrey)
[![CI](https://github.com/Fernando-Maffei/software-escalas/actions/workflows/ci.yml/badge.svg)](https://github.com/Fernando-Maffei/software-escalas/actions/workflows/ci.yml)

Sistema web para gestão de escalas de trabalho, colaboradores, ausências e plantões.
Uma máquina roda o servidor; qualquer dispositivo da rede acessa pelo navegador, sem instalar nada.

## Índice

- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Início rápido](#início-rápido-desenvolvimento)
- [Testes e qualidade](#testes-e-qualidade)
- [Estrutura do código](#estrutura-do-código)
- [Implantação](#implantação)
- [Login e primeiro acesso](#login-e-primeiro-acesso)
- [Configuração inicial do banco](#configuração-inicial-do-banco)
- [Usuários do sistema](#usuários-do-sistema)
- [Backup](#backup)
- [Atualização](#atualização)
- [Versionamento](#versionamento)
- [Documentação](#documentação)
- [Licença](#licença)

## Funcionalidades

- Cadastro de colaboradores com horários de trabalho e almoço
- Lançamento de ausências, férias e folgas
- Calendário mensal com feriados e eventos
- Escala diária com timeline visual e resumo por horário
- Plantões de sábado, domingo e feriado
- Relatórios e exportação de dados (PDF)
- Autenticação com perfis de usuário e controle de acesso
- Backup automático (inclusive antes de restaurações)
- Tema claro e escuro
- Instalável como aplicativo (PWA)

## Tecnologias

| Camada | Stack |
|--------|-------|
| Frontend | HTML, CSS e JavaScript |
| Backend | Node.js 20+ e Express |
| Banco de dados | SQL Server |

## Início rápido (desenvolvimento)

### Com Docker (recomendado)

Sobe o servidor **e** o banco juntos, sem instalar Node nem SQL Server na máquina:

```bash
cp .env.docker.example .env
```
```bash
docker compose up -d --build
```

Acesse `http://localhost:4450`. O banco `SoftwareEscalas`, as tabelas e o
administrador são criados automaticamente na primeira subida — se `ADMIN_PASSWORD`
ficar vazio, a senha aparece uma única vez em `docker compose logs app`. Os dados
ficam em volumes e sobrevivem a reinícios; com `restart: always` os containers
voltam sozinhos quando a máquina liga.

```bash
docker compose down
```

### Sem Docker

Requer Node 20+ e um SQL Server acessível:

```bash
npm install
npm start
```

Acesse `http://localhost:4450`. Configure a conexão com o SQL Server pela própria
tela de configuração inicial (veja [Configuração inicial do banco](#configuração-inicial-do-banco)).

## Testes e qualidade

Uma verificação completa antes de abrir um Pull Request (o CI roda o mesmo):

```bash
npm run verificar
```

Ela executa, em ordem:

| Comando | O que faz |
|---|---|
| `npm run smoke` | Checagem de sintaxe de todos os `.js` |
| `npm run lint` | ESLint. No frontend (sem bundler) os globais são calculados do próprio código, então chamar uma função que não existe é erro |
| `npm run typecheck` | TypeScript em modo `checkJs` sobre backend, scripts e testes |
| `npm run format:check` | Prettier (por enquanto só nos arquivos novos — ver `.prettierignore`) |
| `npm test` | Testes unitários das regras de negócio, sem banco |

### Testes de integração (SQL Server de verdade)

Sobem o servidor em processo contra um SQL Server descartável em Docker e
exercitam as rotas por HTTP: login e permissões, colaboradores, lançamentos,
folgas de domingo, limite de setores e backup/restauração.

```bash
npm run integracao:banco:subir
```
```bash
npm run test:integracao
```

O banco de teste fica em `127.0.0.1:14339` (container `escalas-integracao-db`) e
é apagado e recriado a cada execução. Por segurança, os testes só aceitam banco
com "Integracao" no nome — nunca tocam a produção (porta 4450/1433).
`npm run integracao:banco:derrubar` remove o container.

Para conferir telas no navegador com dados de exemplo, sem tocar na produção:

```bash
npm run integracao:servidor
```

Abra `http://127.0.0.1:4480` (login `admin` / `Admin!Integracao1`).

### Prova de equivalência em refatorações grandes

`tests/integracao/golden-master.js` executa um roteiro fixo por todas as rotas de
dados e fotografa todas as tabelas. Gere antes da mudança e compare depois
(no mesmo dia):

```bash
node tests/integracao/golden-master.js gerar antes.json
```
```bash
node tests/integracao/golden-master.js comparar antes.json
```

### Robô de testes de tela (Playwright)

```bash
npm run e2e:demo
```

Clica aleatoriamente pelas telas da demo (sem backend). Para rodar contra uma
instância com banco, use `npm run teste:subir` e `npm run e2e:teste` (detalhes em
[`docs/ROBO-DE-TESTES.md`](docs/ROBO-DE-TESTES.md)).

### Código morto no frontend

```bash
npm run analisar:codigo-morto
```

Monta o grafo de chamadas das funções globais do frontend a partir do que
executa e acusa as que nada alcança ou que estão declaradas em dois arquivos.

## Estrutura do código

```
backend/
  server.js            sobe e derruba o servidor HTTP
  app.js               aplicação Express: portões (banco pronto, login,
                       permissão), rotas, tratamento de erro
  routes/              uma rota por recurso; coordena, não calcula
  services/            regras de negócio (escala, banco de horas, plantões,
                       backup/, horas-em-carteira, exclusão de colaborador...)
  auth/                sessões, permissões, limite de setores, rate limit
  db/                  conexão, transação, bootstrap do schema
  lib/                 validação, domínio, erros, CORS, IP, cabeçalhos
database/migrations/   scripts SQL idempotentes, aplicados a cada boot
frontend/              HTML/CSS/JS sem bundler (scripts clássicos, escopo global)
demo/                  modo demonstração (mock da API) usado pelo robô
tests/unit|integracao|e2e
```

A auditoria técnica completa, com o que foi corrigido e o que está pendente,
está em [`AUDITORIA.md`](AUDITORIA.md).

## Implantação

O modelo recomendado é **um servidor central na rede**; o time acessa pelo navegador.
A forma mais simples de manter esse servidor no ar é o Docker: `restart: always`
faz app e banco subirem sozinhos quando a máquina liga, sem ninguém precisar logar.

- **Montar o servidor** (serviço do Windows, firewall, IP fixo):
  [`docs/SERVIDOR-COMO-INSTALAR.md`](docs/SERVIDOR-COMO-INSTALAR.md)
- **Acessar e instalar o app** (para o time, Chrome/Edge):
  [`docs/README-TIME.md`](docs/README-TIME.md)

Para parar o servidor, use `docker compose down` (ou pare o serviço, se
configurado sem Docker).

## Login e primeiro acesso

A partir da versão 1.3.0 o sistema exige login. Na primeira execução com um banco
novo, se a tabela `Usuarios` estiver vazia, um administrador é criado automaticamente:

- **Usuário:** valor de `ADMIN_USERNAME` (padrão `admin`)
- **Senha:** valor de `ADMIN_PASSWORD` se definido no `.env` (mínimo de 8
  caracteres); caso contrário — ou se for curta demais — uma senha aleatória é
  gerada e exibida **uma única vez** (na tela de configuração inicial ou no console
  do servidor), com troca obrigatória no primeiro login.

Enquanto a senha provisória não for trocada, o servidor recusa as rotas de dados.
Para trocar a senha é preciso informar a senha atual; a troca encerra as outras
sessões abertas da conta.

Com um proxy reverso na frente do app (nginx, IIS), configure `TRUST_PROXY` para o
limite de tentativas de login enxergar o IP real do cliente (ver `.env.example`).

Veja [`.env.example`](.env.example) para `ADMIN_USERNAME`, `ADMIN_PASSWORD` e a lista
de origens liberadas em `CORS_ORIGINS`.

## Configuração inicial do banco

A partir da versão 1.5.0, numa máquina sem banco configurado (sem
`backend/config/database.local.json` e sem `.env`), abrir o sistema no navegador
mostra direto a tela **Configuração inicial**: informe servidor, instância, banco e
credenciais do SQL Server, teste e salve. O sistema cria as tabelas e o administrador
na hora — sem editar nenhum arquivo. Depois de configurado, tudo volta a exigir login.

## Usuários do sistema

Administradores gerenciam contas em **Configurações → Usuários**: criar usuário (com
senha temporária e troca obrigatória no primeiro acesso), ativar/desativar,
promover/remover administrador e resetar senha. Usuários comuns não veem essa tela. O
sistema impede desativar ou rebaixar a própria conta e o último administrador ativo.

Uma conta pode ter **setores permitidos**: nesse caso ela só vê colaboradores
desses setores — e as ausências, plantões, banco de horas, jornadas e folgas
deles — em todas as telas e na API.

## Backup

Em **Configurações → Banco de dados** é possível gerar backups na pasta do servidor,
agendar backups automáticos e restaurar um arquivo. **Exportar Dados** baixa o
mesmo backup completo; **Importar Dados** restaura o sistema a partir dele. Antes
de restaurar, um backup de segurança do estado atual é salvo automaticamente. O
arquivo de backup não contém contas nem sessões.

## Atualização

1. Atualize os arquivos do projeto (`git pull`)
2. Suba novamente:
   - **Com Docker:** `docker compose up -d --build` (o `--build` é o que leva
     as mudanças de backend para dentro da imagem)
   - **Sem Docker:** pare o servidor, rode `npm install` caso as dependências
     tenham mudado e inicie de novo com `npm start`

As configurações de banco e backup ficam em `backend/config/`, fora do código, e não
são afetadas pela atualização.

## Versionamento

Versão atual: **1.6.3**. O histórico completo fica em [`CHANGELOG.md`](CHANGELOG.md).
Segue [SemVer](https://semver.org/lang/pt-BR/): correção (`1.0.1`), funcionalidade
(`1.1.0`), mudança que quebra fluxo (`2.0.0`).

> Desde a versão 1.4.0 o sistema deixou de ser distribuído como aplicativo desktop
> (Electron/`.exe`). O modelo atual é um servidor web acessado pelo navegador.

## Documentação

- [`docs/SERVIDOR-COMO-INSTALAR.md`](docs/SERVIDOR-COMO-INSTALAR.md) — montar o servidor central
- [`docs/README-TIME.md`](docs/README-TIME.md) — guia do time (acesso e instalação do app)
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — fluxo de branches, commits e testes
- [`SECURITY.md`](SECURITY.md) — política de segurança
- [`CHANGELOG.md`](CHANGELOG.md) — histórico de versões

## Licença

Software proprietário — uso interno, todos os direitos reservados. Veja [`LICENSE`](LICENSE).

## Autor

Fernando Maffei
