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

## Como executar manualmente

1. Instale o Node.js 20 ou superior
2. Abra a pasta do projeto
3. Rode `npm install`
4. Rode `npm start`
5. Acesse `http://localhost:3000`

## Como abrir no modo desktop durante o desenvolvimento

1. Instale o Node.js 20 ou superior
2. Abra a pasta do projeto
3. Rode `npm install`
4. Rode `npm run desktop:start`

O aplicativo desktop:

- sobe o servidor internamente
- abre a interface em uma janela propria
- salva as configuracoes locais em uma pasta de dados do usuario no Windows

## Como gerar o instalador Windows

1. Instale o Node.js 20 ou superior
2. Abra a pasta do projeto
3. Rode `npm install`
4. Rode `npm run desktop:make`
5. Pegue o instalador em `out/make/squirrel.windows/x64/AppDeEscalasSetup.exe`

Fluxo esperado para atualizacoes:

- voce gera uma nova versao do instalador
- o cliente executa o novo `Setup.exe`
- o app desktop e atualizado na maquina
- as configuracoes locais continuam separadas da pasta da instalacao

## Como gerar uma nova versao para atualizar clientes

Quando voce fizer melhorias no sistema e quiser mandar um novo instalador:

1. Atualize o codigo do sistema
2. Rode `npm install`, se tiver mudado dependencias
3. Gere a nova versao com um destes caminhos:
4. `npm run desktop:release -- 1.0.1`
5. ou de duplo clique em `gerar-instalador.bat`
6. Envie o arquivo `out/make/squirrel.windows/x64/AppDeEscalasSetup.exe`

O script de release:

- atualiza a versao do projeto quando voce informar uma nova
- roda a checagem de sintaxe
- roda os testes
- gera o novo instalador do Windows

Sugestao simples de versionamento:

- `1.0.1` para correcao pequena
- `1.1.0` para nova funcionalidade
- `2.0.0` para mudanca grande ou quebra de fluxo

## Como iniciar em outra maquina

Se a ideia for subir o sistema da forma mais simples possivel em outro computador:

1. Instale o Node.js 20 ou superior
2. Copie a pasta do projeto para a outra maquina
3. Dê duplo clique em `iniciar-servidor.bat`
4. Na primeira execucao o script instala as dependencias automaticamente
5. Depois disso ele sobe o servidor e abre o navegador em `http://localhost:3000`

Observacoes:

- O servidor fica ligado enquanto a janela do `.bat` estiver aberta
- Para encerrar, feche a janela ou use `parar-servidor.bat`
- Se precisar, configure a conexao com o SQL Server pela tela de configuracoes do sistema
- Se voce ja tiver um `backend/config/database.local.json` configurado, pode copiar esse arquivo junto para evitar reconfigurar
- No modo desktop, as configuracoes do banco e de backup passam a usar a pasta de dados do usuario

## Autor

Fernando Maffei
