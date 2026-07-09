# Changelog

Todas as alteracoes relevantes deste projeto serao documentadas neste arquivo.

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
