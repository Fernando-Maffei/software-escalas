/*
    Plantao: tipo de cada lancamento (campo "Tipo" da tela).

    tipo_plantao e do DIA e sai da data (sabado, domingo ou feriado). Com os
    plantonistas apareceu um lancamento que nao e o plantao do dia em si: o
    horario extra que cobre o almoco do plantonista. tipo_lancamento classifica
    cada linha para os relatorios poderem filtrar e agrupar:

      - 'sabado' / 'domingo' / 'feriado': plantao regular do dia (sempre igual
        ao tipo_plantao da linha);
      - 'cobertura_almoco': horario adicional para cobrir o almoco.

    Registros antigos viram o plantao regular do dia (copia de tipo_plantao):
    nao ha como saber, pelo dado gravado, qual deles era cobertura de almoco.
    Quem precisar reclassificar abre o dia e troca o tipo do lancamento.
*/

IF COL_LENGTH('dbo.plantoes', 'tipo_lancamento') IS NULL
BEGIN
    ALTER TABLE dbo.plantoes ADD tipo_lancamento NVARCHAR(30) NULL;
END;
GO

UPDATE dbo.plantoes
SET tipo_lancamento = LOWER(tipo_plantao)
WHERE tipo_lancamento IS NULL OR LTRIM(RTRIM(tipo_lancamento)) = '';
GO

ALTER TABLE dbo.plantoes ALTER COLUMN tipo_lancamento NVARCHAR(30) NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'CK_plantoes_tipo_lancamento'
)
BEGIN
    ALTER TABLE dbo.plantoes
    ADD CONSTRAINT CK_plantoes_tipo_lancamento
        CHECK (LOWER(tipo_lancamento) IN ('sabado', 'domingo', 'feriado', 'cobertura_almoco'));
END;
GO

-- Relatorios por tipo filtram por tipo e periodo.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'IX_plantoes_tipo_lancamento_data'
)
BEGIN
    CREATE INDEX IX_plantoes_tipo_lancamento_data
        ON dbo.plantoes (tipo_lancamento, data_plantao);
END;
GO
