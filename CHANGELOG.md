# Changelog

Todas as alteracoes relevantes deste projeto serao documentadas neste arquivo.

## [Nao publicado]

### Adicionado
- Lancar Plantao: cada lancamento escolhe entre **banco de horas** e **hora extra**. Hora extra fica registrada no plantao e continua aparecendo na escala do dia, mas nao gera movimento em `BancoHorasMovimentos` — o saldo do colaborador nao muda, porque a hora e paga em folha.
- Lancar Plantao: o dia aceita **varios lancamentos** (turnos com horarios, pessoas e destinos diferentes; por exemplo um das 08h as 13h no banco e outro das 13h as 18h como extra). Antes um indice unico por data so deixava um registro por dia.
- Lancar Plantao: **editar um lancamento** ja adicionado (colaborador, horario e destino das horas) sem precisar remover e digitar de novo.
- Migration `2026-09-04-plantao-lancamentos.sql`: troca o indice unico `UX_plantoes_data` por um indice comum, cria a coluna `tipo_credito` ('banco'/'extra', padrao 'banco') e libera 'feriado' no CHECK de `tipo_plantao`.

### Alterado
- Lancar Plantao: a barra lateral deixou de ser um checklist com um horario unico para todo mundo e virou um montador de turnos — formulario de adicionar/editar no topo, lista dos lancamentos do dia com duracao e etiqueta banco/extra por linha, e um resumo que separa quanto vai para o banco e quanto sai como hora extra. O painel passou de 400px para 460px, ganhou etiquetas de tipo do dia e de status no cabecalho e acompanha a rolagem da regua de datas.
- Lancar Plantao: a lista "Plantoes lancados" agrupa por dia e mostra cada turno do dia como uma faixa, em vez de um card por registro.
- Lancar Plantao: a regua de datas passa a ser agrupada por mes, com cabecalho ("Setembro de 2026") e a contagem de lancados sobre o total do mes (3/9). Numa grade corrida de 10 semanas, "23" podia ser de setembro ou de outubro e so dava para saber lendo a etiqueta de cada card.

- Relatorio de Plantoes: coluna "Destino" (banco de horas / hora extra) e o antigo card "Credito total da equipe" virou dois — "Credito em banco de horas" e "Horas extras (fora do banco)" —, porque somar os dois num numero so nao bate com nenhum saldo. Vale tambem para o PDF, que reaproveita a mesma tabela.
- Extrato do Banco de Horas: secao "Horas extras de plantao" com os plantoes do colaborador lancados como extra (data, horario e total), marcada como paga em folha e fora do saldo. Sem ela, um plantao de hora extra nao aparecia em lugar nenhum do extrato e parecia perdido.

### Removido
- `excluirColaborador` (app.js): funcao morta que ninguem chamava. Falava com `http://localhost:3000` no braco (so funcionaria em dev), apagava ausencias uma a uma pelo cliente e chamava `PUT /api/plantoes/:dataISO`, rota que nunca existiu — a resposta 404 era ignorada em silencio. A exclusao definitiva real mora em runtime-fixes.js e o backend ja limpa plantoes, movimentos, escala, jornada, almocos e ausencias numa tacada so.

### Corrigido
- Bootstrap do schema derrubava o app inteiro (503 em todas as rotas de dados, login incluso) num banco que ja tivesse dois turnos na mesma data: `2026-04-27-base-schema.sql` roda antes da migration que libera isso e recriava `UX_plantoes_data`, batendo em "duplicate key was found". O indice por data passa a ser comum (`IX_plantoes_data`) tambem no base-schema, que e a premissa do dia com varios lancamentos.
- Plantao em feriado de dia util era oferecido pela tela mas recusado pelo banco: o CHECK `CK_plantoes_tipo_plantao` so aceitava 'sabado' e 'domingo'.
- Calendario/Escala marcavam como "Plantao" so quem estava no primeiro turno do dia: `buscarPlantaoDoDia` parava no primeiro registro da data. Agora junta a equipe de todos os turnos.
- Dashboard e relatorio contavam turnos como se fossem plantoes: um sabado com dois turnos aparecia como dois. Passam a contar dias.
- Escala do dia: com mais de um turno no mesmo dia, `escala_dia` (que so aceita uma linha por colaborador/data) ficaria com o ultimo turno gravado. Agora quem faz dois turnos no dia vira um intervalo unico, do primeiro inicio ao ultimo fim.

## [1.6.1] - 2026-07-24

### Alterado
- Escala do Dia: cabecalho condensado de 404px para 186px (titulo na mesma faixa da data, acoes secundarias como icone, legenda sob demanda em vez de faixa fixa). Passam de 4 para 9 colaboradores visiveis sem rolar.
- Abas de setor encolhem e rolam em vez de empurrar os filtros para outra faixa.
- Relatorios: os tres relatorios viraram abas (um visivel por vez) em vez de tres cards empilhados que somavam 1405px e obrigavam a rolar. Agora cabem em 760px sem rolagem, e os filtros de cada um ficam lado a lado.
- Dashboard: cartoes de metrica compactados (padding e sub-card de destaque menores) — gastavam 257px cada para exibir um numero.
- Lancar Plantao: cartoes de sabado adensados (205px para ~137px de conteudo), reduzindo o espaco vazio da grade.

### Adicionado
- Instalacao como aplicativo (PWA): `manifest.json` e icones permitem "instalar" a Central de Escalas com icone e janela propria pelo Chrome/Edge. Em HTTPS o botao "Instalar" e automatico; em HTTP na rede local, via menu do navegador.
- Escala do Dia: alternador de densidade das linhas (confortavel 54px / compacta 41px, 12 colaboradores visiveis), com a preferencia guardada no navegador.
- Sombra na borda da coluna de colaboradores congelada, para separa-la visualmente da linha do tempo que rola por baixo.

### Corrigido
- Telas de login e configuracao inicial eram cortadas em telas de baixa altura: o cartao centralizado nao rolava quando ficava mais alto que a viewport, escondendo a senha do admin gerada na primeira execucao (so alcancavel reduzindo o zoom). Agora o container rola e o cartao se desloca conforme a altura, mantendo a centralizacao quando cabe.
- Cabecalho da barra lateral (logo e nome do sistema) era cortado pela metade em qualquer janela com menos de ~900px de altura: a barra e flex column e o cabecalho encolhia junto com o resto.
- Excluir colaborador falhava com erro 500 quando ele tinha almoco personalizado (aplicado por periodo ou ajustado a mao): a rota limpava escala, banco de horas, jornada semanal e plantoes, mas nao a tabela `AlmocosPersonalizados`, e a foreign key barrava a exclusao.
- Botao "Novo lancamento" colidia com a alca de abrir/fechar o editor lateral, que divide a mesma coluna a direita, e o rotulo podia ser cortado por poder encolher abaixo da largura do texto.
- Arquivos CSS continuavam sendo pedidos com `?v=1.5.0` dentro do `style.css` mesmo apos o bump para 1.6.0, entao o cache-busting nao valia para nenhum deles.
- Relatorio mensal saia sem nenhum colaborador quando a lista global do front-end nao estava carregada (por exemplo apos falha de carregamento inicial ou sessao expirada): cada ausencia era descartada em silencio e o relatorio parecia correto, so que vazio. Agora recarrega colaboradores e ausencias antes de montar, avisa se ainda faltar, e identifica o registro em vez de omiti-lo.
- Campo de busca em Colaboradores deixava uma fresta de 29px entre as duas barras fixas, por onde os cards apareciam ao rolar. O deslocamento era um valor fixo (88px) que nao correspondia a altura real do cabecalho; agora e medido e acompanha inclusive quando o cabecalho quebra em duas linhas.
- Configuracoes > Usuarios: o formulario de novo usuario era uma unica linha flex em que os campos encolhiam ate ~165px e o botao "Criar usuario" chegava a cobrir o campo de senha em telas medias. Reestruturado em campos rotulados numa grade que quebra + uma faixa de acoes separada, previsivel em qualquer largura.

### Adicionado
- Aviso na barra lateral do editor quando o almoco do dia e personalizado (nao segue o cadastro), para nao passar despercebido que aquele dia esta fora do padrao.

### Seguranca
- Rate limiting no login: 5 tentativas erradas por IP+usuario numa janela de 15 min bloqueiam novas tentativas por 15 min (HTTP 429 com mensagem clara). Em memoria, sem dependencia nova. Login valido zera a contagem, e a chave por IP+usuario isola as tentativas de contas e maquinas diferentes.

### Corrigido (backup/restauracao)
- Restauracao de backup nunca funcionava com preservacao de Id: neste ambiente (mssql/tedious) o `SET IDENTITY_INSERT ON` numa request nao persiste para o INSERT da request seguinte, entao falhava com "Cannot insert explicit value for identity column ... IDENTITY_INSERT is set to OFF". Corrigido pondo o SET no mesmo batch do INSERT. Valia para todas as tabelas.
- Restauracao quebrava por foreign key (`FK_AlmocosPersonalizados_Colaboradores`) e/ou perdia dados: as tabelas `Setores` e `AlmocosPersonalizados` eram capturadas no backup mas nao constavam nas ordens de limpeza/insercao — a restauracao falhava ao apagar Colaboradores e nunca reinseria essas duas.
- Backup perdia a lotacao por setor e a data de cadastro: o mapa de colunas de `Colaboradores` omitia `SetorId` e `DataCadastro`.
- Verificado de ponta a ponta contra o SQL Server real: ciclo backup->restore idempotente (nenhuma tabela perdida nem duplicada) e recuperacao real (apagados os almocos personalizados, restaurados os 4, com o setor do colaborador preservado).

### Adicionado (backup)
- Backup de seguranca automatico antes de restaurar: como a restauracao sobrescreve tudo, o sistema salva primeiro um backup do estado atual (na pasta configurada) e informa o nome do arquivo na confirmacao. E best-effort — se nao der para gravar, a restauracao segue e o usuario e avisado de que nao ha ponto de retorno.

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
