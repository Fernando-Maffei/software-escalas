#!/bin/bash
# Cria o banco "SoftwareEscalas" assim que o SQL Server ficar de pe.
# O app nao cria o banco sozinho (so as tabelas) — este passo cobre isso.
# Roda uma vez, na subida do compose, e sai.
set -e

SQLCMD=/opt/mssql-tools/bin/sqlcmd
SERVIDOR=db          # nome do servico do SQL no docker-compose.yml
BANCO=SoftwareEscalas

echo "Aguardando o SQL Server ficar pronto..."
for i in $(seq 1 30); do
    if "$SQLCMD" -S "$SERVIDOR" -U sa -P "$DB_PASSWORD" -Q "SELECT 1" >/dev/null 2>&1; then
        echo "SQL Server respondeu (tentativa $i)."
        break
    fi
    echo "  ...ainda subindo ($i/30)"
    sleep 3
done

echo "Criando o banco '$BANCO' se ainda nao existir..."
"$SQLCMD" -S "$SERVIDOR" -U sa -P "$DB_PASSWORD" \
    -Q "IF DB_ID('$BANCO') IS NULL CREATE DATABASE [$BANCO];"

echo "Banco pronto. As tabelas serao criadas pelo proprio app na primeira conexao."
