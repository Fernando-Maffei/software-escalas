IF COL_LENGTH('dbo.Ausencias', 'Subtipo') IS NULL
BEGIN
    ALTER TABLE dbo.Ausencias ADD Subtipo NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH('dbo.Ausencias', 'DescontaBancoHoras') IS NULL
BEGIN
    ALTER TABLE dbo.Ausencias ADD DescontaBancoHoras BIT NULL;
END;
GO

IF COL_LENGTH('dbo.Ausencias', 'Observacao') IS NULL
BEGIN
    ALTER TABLE dbo.Ausencias ADD Observacao NVARCHAR(500) NULL;
END;
GO

UPDATE dbo.Ausencias
SET
    Subtipo = COALESCE(Subtipo, CASE
        WHEN LOWER(Tipo) = 'ferias' THEN 'ferias'
        WHEN LOWER(Tipo) = 'folga' THEN 'folga'
        ELSE 'comum'
    END),
    DescontaBancoHoras = COALESCE(DescontaBancoHoras, CASE
        WHEN LOWER(Tipo) = 'ferias' THEN 0
        ELSE 1
    END)
WHERE Subtipo IS NULL OR DescontaBancoHoras IS NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.Ausencias')
      AND name = 'DF_Ausencias_DescontaBancoHoras'
)
BEGIN
    ALTER TABLE dbo.Ausencias
    ADD CONSTRAINT DF_Ausencias_DescontaBancoHoras DEFAULT (1) FOR DescontaBancoHoras;
END;
GO

ALTER TABLE dbo.Ausencias ALTER COLUMN DescontaBancoHoras BIT NOT NULL;
GO

IF COL_LENGTH('dbo.plantoes', 'hora_inicio') IS NULL
BEGIN
    ALTER TABLE dbo.plantoes ADD hora_inicio TIME NULL;
END;
GO

IF COL_LENGTH('dbo.plantoes', 'hora_fim') IS NULL
BEGIN
    ALTER TABLE dbo.plantoes ADD hora_fim TIME NULL;
END;
GO

IF COL_LENGTH('dbo.plantoes', 'observacao') IS NULL
BEGIN
    ALTER TABLE dbo.plantoes ADD observacao NVARCHAR(500) NULL;
END;
GO

IF OBJECT_ID('dbo.BancoHorasMovimentos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BancoHorasMovimentos (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ColaboradorId INT NOT NULL,
        DataReferencia DATE NOT NULL,
        Minutos INT NOT NULL,
        OrigemTipo NVARCHAR(30) NOT NULL,
        OrigemId INT NULL,
        Descricao NVARCHAR(255) NOT NULL,
        Observacao NVARCHAR(500) NULL,
        CriadoEm DATETIME NOT NULL CONSTRAINT DF_BancoHorasMovimentos_CriadoEm DEFAULT (GETDATE()),
        CONSTRAINT FK_BancoHorasMovimentos_Colaboradores
            FOREIGN KEY (ColaboradorId) REFERENCES dbo.Colaboradores(Id)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.BancoHorasMovimentos')
      AND name = 'IX_BancoHorasMovimentos_Colaborador_Data'
)
BEGIN
    CREATE INDEX IX_BancoHorasMovimentos_Colaborador_Data
        ON dbo.BancoHorasMovimentos (ColaboradorId, DataReferencia DESC, Id DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.BancoHorasMovimentos')
      AND name = 'UX_BancoHorasMovimentos_Origem'
)
BEGIN
    CREATE UNIQUE INDEX UX_BancoHorasMovimentos_Origem
        ON dbo.BancoHorasMovimentos (ColaboradorId, OrigemTipo, OrigemId)
        WHERE OrigemId IS NOT NULL;
END;
GO
