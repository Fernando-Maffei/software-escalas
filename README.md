# Software de Escalas

Sistema para gestao de escalas de trabalho, colaboradores, ausencias e plantoes.

## Funcionalidades

- Cadastro de colaboradores com horarios de trabalho e almoco
- Lancamento de ausencias, ferias e folgas
- Calendario mensal com feriados e eventos
- Escala diaria com timeline visual
- Resumo por horario
- Plantoes de sabado
- Relatorios e exportacao de dados
- Tema claro e escuro

## Tecnologias

- Frontend: HTML, CSS e JavaScript
- Backend: Node.js e Express
- Banco de dados: SQL Server

## Login

A partir da versao 1.3.0 o sistema exige login. Na primeira execucao, se a
tabela `Usuarios` estiver vazia, um usuario administrador e criado
automaticamente:

- Usuario: valor de `ADMIN_USERNAME` (padrao `admin`)
- Senha: valor de `ADMIN_PASSWORD`, se definida no `.env`; caso contrario,
  uma senha aleatoria e gerada e impressa **uma unica vez** no console do
  servidor na primeira inicializacao. Anote essa senha, pois nesse caso o
  sistema pede a troca no primeiro login.

Veja `.env.example` para configurar `ADMIN_USERNAME`/`ADMIN_PASSWORD` e a
lista de origens liberadas em `CORS_ORIGINS`.

## Como executar manualmente

1. Instale o Node.js 20 ou superior
2. Abra a pasta do projeto
3. Rode `npm install`
4. Rode `npm start`
5. Acesse `http://localhost:4450`

## Como iniciar o servidor (uma maquina na rede)

Uma maquina roda o servidor; qualquer outro computador, notebook, tablet ou
celular na mesma rede acessa pelo navegador, sem instalar nada.

1. Instale o Node.js 20 ou superior nessa maquina
2. Copie a pasta do projeto para ela
3. Dê duplo clique em `iniciar-servidor.bat`
4. Na primeira execucao o script instala as dependencias automaticamente
5. Depois disso ele sobe o servidor e abre o navegador em `http://localhost:4450`

Observacoes:

- O servidor fica ligado enquanto a janela do `.bat` estiver aberta
- Para encerrar, feche a janela ou use `parar-servidor.bat`
- Se precisar, configure a conexao com o SQL Server pela tela de configuracoes do sistema
- Se voce ja tiver um `backend/config/database.local.json` configurado, pode copiar esse arquivo junto para evitar reconfigurar

## Como acessar de outros dispositivos na rede

Depois que o servidor estiver rodando numa maquina (veja acima), qualquer
outro dispositivo na mesma rede local acessa direto pelo navegador em
`http://<nome-ou-ip-da-maquina-servidora>:4450` — nao precisa instalar nada
nesses outros dispositivos.

## Servidor em segundo plano (iniciar com o Windows)

Para nao depender de deixar a janela do `.bat` aberta, a maquina que hospeda
o servidor pode configurar uma inicializacao automatica pelo Agendador de
Tarefas do Windows, direto pela tela **Configuracoes > Comunicacao em Rede**
do proprio sistema (logado como administrador dessa maquina):

- **Instalar inicio automatico**: cria uma tarefa que sobe `node backend/server.js`
  automaticamente a cada login do Windows nessa maquina, sem precisar abrir o `.bat`
- **Iniciar agora** / **Parar**: controla a tarefa sem esperar o proximo login
- **Remover**: desfaz a inicializacao automatica

## Como atualizar uma instalacao existente

1. Pare o servidor (`parar-servidor.bat`, ou pela tela de segundo plano se estiver configurado)
2. Substitua os arquivos do projeto pela nova versao (ou `git pull`)
3. Rode `npm install` caso as dependencias tenham mudado
4. Suba o servidor de novo (`iniciar-servidor.bat` ou a inicializacao automatica)

As configuracoes de banco e backup ficam em `backend/config/`, fora do
codigo do sistema, e nao sao afetadas pela atualizacao.

Sugestao simples de versionamento:

- `1.0.1` para correcao pequena
- `1.1.0` para nova funcionalidade
- `2.0.0` para mudanca grande ou quebra de fluxo

Versao atual: `1.4.0`. O historico de alteracoes fica em `CHANGELOG.md`.

## Se voce ja tinha o aplicativo desktop instalado (versoes ate 1.3.x)

A partir da versao 1.4.0 o sistema deixou de ser distribuido como aplicativo
desktop (Electron) com instalador `.exe`, pois esse formato deixava o
sistema pesado e lento para instalar e atualizar. O modelo atual e mais
leve: um servidor web numa maquina, acessado pelo navegador por qualquer
dispositivo da rede.

- Se voce ainda tem o app desktop instalado, ele continua funcionando
  normalmente — nada foi desativado remotamente.
- Ele nao vai mais receber atualizacoes por instalador. Para migrar, use o
  fluxo acima (`iniciar-servidor.bat`) nesta mesma maquina ou em outra, e
  reaproveite seu `backend/config/database.local.json` se ja tiver um.
- Pode desinstalar o app desktop antigo pelo Painel de Controle do Windows
  quando quiser, sem perder dados — os dados ficam no banco SQL Server, nao
  no aplicativo.

## Autor

Fernando Maffei
