-- Controle de acesso por setor, por conta de login: quais setores a conta TEM
-- PERMISSAO de ver. Diferente de SetoresVisiveisJson (que e a preferencia
-- self-service "Meus setores", o foco DENTRO do permitido): este e o teto,
-- definido por um administrador na tela de Usuarios e imposto no backend.
-- NULL ou "[]" = sem restricao (ve todos os setores).
--
-- Idempotente: as migracoes rodam todas no boot (ver database-schema.js).
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Usuarios' AND COLUMN_NAME = 'SetoresPermitidosJson'
)
BEGIN
    ALTER TABLE dbo.Usuarios ADD SetoresPermitidosJson NVARCHAR(MAX) NULL;
END
