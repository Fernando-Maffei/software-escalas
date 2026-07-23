# Changelog

Todas as alteracoes relevantes deste projeto serao documentadas neste arquivo.

## [1.6.0] - 2026-07-22

### Adicionado
- Perfil de visualizacao: usuario nao-administrador entra direto num calendario compartilhado, somente leitura, com as folgas, ferias e ausencias de toda a equipe. A barra lateral esconde as telas que ele nao pode usar, restando apenas Calendario e "Sair".
- Conta de visualizacao compartilhada: contas nao-administradoras nascem sem exigencia de troca de senha no primeiro acesso, para que a equipe inteira use o mesmo login sem que a primeira pessoa a entrar tranque as demais. A senha e definida (ou gerada) pelo administrador e so ele pode altera-la, pela tela de Usuarios.
- Portao central de permissao no backend (`backend/utils/permissoes.js`): usuario comum so faz requisicoes de leitura e nao acessa `/api/configuracao-banco`, `/api/sistema` e `/api/usuarios` nem para leitura. Aplicado num unico middleware, para que rota nova nasca protegida por padrao.

### Alterado
- A primeira tela so e renderizada depois que o perfil do usuario e conhecido — antes o dashboard chegava a aparecer e so entao era trocado.

### Seguranca
- Fechada a lacuna em que qualquer usuario autenticado podia trocar a configuracao do banco, restaurar backup por cima dos dados, parar o servidor da equipe, excluir colaborador, ajustar saldo de banco de horas ou reconstruir a escala. Ate a versao 1.5.0, `requireAdmin` protegia apenas `/api/usuarios`.

## [1.5.0] - 2026-07-09

### Adicionado
- Tela de configuracao inicial do banco: numa instalacao nova (sem `database.local.json` e sem `.env`), o navegador abre direto um formulario de conexao com o SQL Server, sem exigir login — resolvendo o impasse em que o login dependia do banco e a tela de banco dependia do login. Assim que a conexao e salva, as rotas voltam a exigir autenticacao.
- Gestao de usuarios (Configuracoes > Usuarios, visivel apenas para administradores): criar contas com senha temporaria (troca obrigatoria no primeiro acesso), ativar/desativar, promover/remover administrador e resetar senha.
- Papel de administrador (`Usuarios.IsAdmin`): somente admins gerenciam contas. Em bancos existentes, o usuario mais antigo e promovido automaticamente na migracao.

### Alterado
- Salvar a configuracao do banco agora verifica/cria as tabelas e o usuario administrador imediatamente (antes so acontecia no reinicio do servidor).
- Desativar um usuario, remover o papel de admin ou resetar a senha encerra as sessoes ativas dele na hora.

### Seguranca
- Protecoes na gestao de contas: ninguem desativa ou rebaixa a propria conta, e o ultimo administrador ativo nao pode ser desativado nem rebaixado.

## [1.4.0] - 2026-07-08

### Removido
- Aplicativo desktop Electron e o fluxo de instalador Squirrel (`electron/`, `forge.config.js`, `gerar-instalador.bat`, `scripts/release-desktop.js`, `scripts/show-installer-builder.ps1`). Gerava instaladores de 100+MB por arquitetura e exigia builds separados para `x64`/`x86`/`arm64`, deixando o processo de instalar e atualizar pesado e lento.
- Conceito de "modo" standalone/server/client do assistente de primeira configuracao do Electron — sem o app desktop, "modo cliente" passa a ser simplesmente abrir o navegador no endereco do servidor, sem nenhuma instalacao.

### Adicionado
- "Servidor em segundo plano" (iniciar com o Windows sem depender de janela aberta) agora e um recurso do proprio backend web, controlado pela tela Configuracoes > Comunicacao em Rede (`GET/POST /api/sistema/servidor-background/*`), sem depender do Electron.

### Alterado
- `parar-servidor.bat` agora encerra apenas o processo que esta escutando na porta do servidor, em vez de matar todo processo `node.exe` da maquina.
- `node_modules` caiu de ~550MB para ~70MB com a remocao das dependencias do Electron/Electron Forge.

## [1.3.0] - 2026-07-08

### Adicionado
- Login obrigatorio para acessar o sistema e a API (`/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/trocar-senha`).
- Usuario administrador criado automaticamente na primeira execucao (`ADMIN_USERNAME`/`ADMIN_PASSWORD`), com troca de senha obrigatoria quando a senha e gerada automaticamente.

### Alterado
- CORS deixa de liberar qualquer origem por padrao: sem `CORS_ORIGINS` configurada, apenas requisicoes de mesma origem sao aceitas.
- Verificacao/criacao das tabelas da aplicacao passa a rodar automaticamente na inicializacao do servidor, nao apenas ao clicar em "verificar tabelas".

### Seguranca
- Fechada a exposicao total da API na rede local sem autenticacao (qualquer dispositivo na rede tinha acesso irrestrito, inclusive a configuracao do banco de dados).

## [1.2.1] - 2026-05-31

### Adicionado
- Diagnostico de comunicacao em rede em Configuracoes > Ferramentas.
- Endpoint `/api/network/status` para validar servidor, banco, URLs de acesso e cliente conectado.
- Modo servidor em segundo plano no Windows por tarefa agendada.
- Endereco recomendado por nome da maquina, usando porta padrao `4450`.

### Alterado
- Porta padrao do servidor de rede alterada para `4450`.
- Cliente desktop aceita nome da maquina como endereco do servidor e completa a porta padrao automaticamente.
- Chamadas antigas para `localhost:3000` passam a ser normalizadas pela base dinamica da API.

### Corrigido
- Reduzida a dependencia de IP fixo para acesso entre maquinas na mesma rede.
- Mensagem mais clara quando a porta do servidor ja esta em uso.

## [1.2.0] - 2026-05-31

### Adicionado
- Jornada semanal flexivel por colaborador, com horarios diferentes por dia da semana.
- Cadastro, edicao e fallback de jornada semanal para colaboradores antigos.
- Relatorios de escala separados por setor.
- Personalizacao de cores da tela de escala.
- Submenus na tela de configuracoes.
- Botao para resetar almocos da escala do dia para o cadastro base.

### Alterado
- Escala do dia passa a considerar a jornada semanal normal, inclusive sabado e domingo.
- Plantoes ficam separados da jornada normal e restritos ao fluxo de sabado.
- Dashboard e relatorios passam a respeitar setor e jornada semanal.
- Exportacao mensal de escala ganhou layout de planilha, mais legivel e sem textura no PDF.
- Instalador passa a usar a versao `1.2.0`.

### Corrigido
- Ajustes de CSS nas telas de escala, colaboradores e configuracoes.
- Linha de "trabalhando" e timeline da escala com horarios ate 22:00.
- Exportacao em PDF evitando cortes e imagens gigantes com artefatos.
- Scripts de criacao/atualizacao de tabelas novas sem apagar dados existentes.
