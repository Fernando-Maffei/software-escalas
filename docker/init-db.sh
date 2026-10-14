#!/bin/bash
# Prepara o SQL Server do compose assim que ele ficar de pe, e sai:
#   1. cria o banco "SoftwareEscalas" (o app so cria as tabelas, nao o banco);
#   2. cria o login proprio do app (APP_DB_USER, padrao escalas_app), dono
#      apenas desse banco. O app conecta com ele, nunca com o sa — o sa fica so
#      para administrar (e e o que este script usa).
# Roda a cada subida do compose; tudo aqui pode repetir sem efeito colateral.
set -e

SQLCMD=/opt/mssql-tools/bin/sqlcmd
SERVIDOR=db          # nome do servico do SQL no docker-compose.yml
BANCO=SoftwareEscalas
APP_LOGIN="${APP_DB_USER:-escalas_app}"

# O nome do login vai direto no SQL: so letras, numeros e _.
if ! [[ "$APP_LOGIN" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "APP_DB_USER invalido: '$APP_LOGIN' (use so letras, numeros e _)." >&2
    exit 1
fi

if [ -z "$APP_DB_PASSWORD" ]; then
    echo "APP_DB_PASSWORD vazio: defina a senha do login do app no .env." >&2
    exit 1
fi

# Aspas simples dobradas para caber no literal N'...' do SQL.
SENHA_SQL="${APP_DB_PASSWORD//\'/\'\'}"

# -b: erro de SQL vira codigo de saida (e o set -e para o script, entao o app
# nao sobe com o banco pela metade). -x: desliga as variaveis do sqlcmd, para
# um "$(" na senha nao ser interpretado.
sql() {
    "$SQLCMD" -S "$SERVIDOR" -U sa -P "$DB_PASSWORD" -b -x "$@"
}

echo "Aguardando o SQL Server ficar pronto..."
for i in $(seq 1 30); do
    if sql -Q "SELECT 1" >/dev/null 2>&1; then
        echo "SQL Server respondeu (tentativa $i)."
        break
    fi
    echo "  ...ainda subindo ($i/30)"
    sleep 3
done

echo "Criando o banco '$BANCO' se ainda nao existir..."
sql -Q "IF DB_ID('$BANCO') IS NULL CREATE DATABASE [$BANCO];"

# A senha segue o .env: trocar APP_DB_PASSWORD e subir de novo atualiza o login.
echo "Login do app '$APP_LOGIN'..."
sql -Q "
IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = N'$APP_LOGIN')
    CREATE LOGIN [$APP_LOGIN] WITH PASSWORD = N'$SENHA_SQL', CHECK_POLICY = ON;
ELSE
    ALTER LOGIN [$APP_LOGIN] WITH PASSWORD = N'$SENHA_SQL';
"

# Dono so deste banco: o app cria e altera as proprias tabelas (migrations),
# mas nao enxerga nem administra o resto do servidor. O ALTER USER religa o
# usuario ao login quando o banco veio de um .bak de outro servidor.
sql -d "$BANCO" -Q "
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$APP_LOGIN')
    CREATE USER [$APP_LOGIN] FOR LOGIN [$APP_LOGIN];
ELSE
    ALTER USER [$APP_LOGIN] WITH LOGIN = [$APP_LOGIN];
ALTER ROLE db_owner ADD MEMBER [$APP_LOGIN];
"

echo "Banco e login prontos. As tabelas serao criadas pelo proprio app na primeira conexao."
