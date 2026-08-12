-- Preferencia "Meus setores" por usuario: guarda, na propria conta, quais
-- setores o gestor quer ver nas telas (Escala do Dia, Dashboard, Plantao).
-- E so um filtro de visualizacao, atrelado ao usuario (segue entre
-- dispositivos). NULL ou "[]" = ver todos os setores (sem filtro).
--
-- Idempotente: as migracoes rodam todas no boot (ver database-schema.js),
-- entao so adiciona a coluna se ainda nao existir.
IF NOT EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Usuarios' AND COLUMN_NAME = 'SetoresVisiveisJson'
)
BEGIN
    ALTER TABLE dbo.Usuarios ADD SetoresVisiveisJson NVARCHAR(MAX) NULL;
END
