/*
    Plantao: varios lancamentos no mesmo dia e escolha entre banco de horas e
    hora extra.

    1) O indice UNICO por data so deixava UM registro por dia, entao nao dava
       para ter dois turnos com horarios diferentes (ex.: um das 08h as 13h e
       outro das 13h as 18h). Vira indice comum: a busca por data continua
       rapida, mas o dia aceita varias linhas.
    2) Coluna tipo_credito: 'banco' credita BancoHorasMovimentos como sempre;
       'extra' registra o plantao (e a escala do dia) sem gerar movimento — a
       hora e paga em folha, nao entra no saldo.
    3) O CHECK do tipo_plantao ainda recusava 'feriado', apesar de a tela
       oferecer feriado como data lancavel. Passa a aceitar os tres tipos.
*/

IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'UX_plantoes_data'
)
BEGIN
    DROP INDEX UX_plantoes_data ON dbo.plantoes;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'IX_plantoes_data'
)
BEGIN
    CREATE INDEX IX_plantoes_data
        ON dbo.plantoes (data_plantao);
END;
GO

IF COL_LENGTH('dbo.plantoes', 'tipo_credito') IS NULL
BEGIN
    ALTER TABLE dbo.plantoes ADD tipo_credito NVARCHAR(20) NULL;
END;
GO

-- Tudo que ja existia era credito de banco de horas.
UPDATE dbo.plantoes
SET tipo_credito = 'banco'
WHERE tipo_credito IS NULL OR LTRIM(RTRIM(tipo_credito)) = '';
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.plantoes')
      AND c.name = 'tipo_credito'
)
BEGIN
    ALTER TABLE dbo.plantoes
    ADD CONSTRAINT DF_plantoes_tipo_credito DEFAULT ('banco') FOR tipo_credito;
END;
GO

ALTER TABLE dbo.plantoes ALTER COLUMN tipo_credito NVARCHAR(20) NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'CK_plantoes_tipo_credito'
)
BEGIN
    ALTER TABLE dbo.plantoes
    ADD CONSTRAINT CK_plantoes_tipo_credito
        CHECK (LOWER(tipo_credito) IN ('banco', 'extra'));
END;
GO

-- Feriado ja era um tipo valido no codigo, mas o CHECK antigo derrubava o
-- INSERT. Recria a restricao com os tres tipos.
IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'CK_plantoes_tipo_plantao'
)
BEGIN
    ALTER TABLE dbo.plantoes DROP CONSTRAINT CK_plantoes_tipo_plantao;
END;
GO

ALTER TABLE dbo.plantoes
ADD CONSTRAINT CK_plantoes_tipo_plantao
    CHECK (LOWER(tipo_plantao) IN ('sabado', 'domingo', 'feriado'));
GO
