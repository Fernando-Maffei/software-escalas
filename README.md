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

## Autor

Fernando Maffei
