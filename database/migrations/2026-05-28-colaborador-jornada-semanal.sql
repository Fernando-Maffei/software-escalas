IF OBJECT_ID('dbo.ColaboradorJornadaSemanal', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ColaboradorJornadaSemanal (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ColaboradorId INT NOT NULL,
        DiaSemana TINYINT NOT NULL,
        TrabalhoInicio TIME NULL,
        TrabalhoFim TIME NULL,
        AlmocoInicio TIME NULL,
        AlmocoFim TIME NULL,
        Ativo BIT NOT NULL CONSTRAINT DF_ColaboradorJornadaSemanal_Ativo DEFAULT (1),
        DataCadastro DATETIME NOT NULL CONSTRAINT DF_ColaboradorJornadaSemanal_DataCadastro DEFAULT (GETDATE()),
        DataAtualizacao DATETIME NOT NULL CONSTRAINT DF_ColaboradorJornadaSemanal_DataAtualizacao DEFAULT (GETDATE())
    );
END;
GO

IF COL_LENGTH('dbo.ColaboradorJornadaSemanal', 'ColaboradorId') IS NULL
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal ADD ColaboradorId INT NULL;
END;
GO

IF COL_LENGTH('dbo.ColaboradorJornadaSemanal', 'DiaSemana') IS NULL
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal ADD DiaSemana TINYINT NULL;
END;
GO

IF COL_LENGTH('dbo.ColaboradorJornadaSemanal', 'TrabalhoInicio') IS NULL
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal ADD TrabalhoInicio TIME NULL;
END;
GO

IF COL_LENGTH('dbo.ColaboradorJornadaSemanal', 'TrabalhoFim') IS NULL
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal ADD TrabalhoFim TIME NULL;
END;
GO

IF COL_LENGTH('dbo.ColaboradorJornadaSemanal', 'AlmocoInicio') IS NULL
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal ADD AlmocoInicio TIME NULL;
END;
GO

IF COL_LENGTH('dbo.ColaboradorJornadaSemanal', 'AlmocoFim') IS NULL
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal ADD AlmocoFim TIME NULL;
END;
GO

IF COL_LENGTH('dbo.ColaboradorJornadaSemanal', 'Ativo') IS NULL
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal ADD Ativo BIT NULL;
END;
GO

IF COL_LENGTH('dbo.ColaboradorJornadaSemanal', 'DataCadastro') IS NULL
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal ADD DataCadastro DATETIME NULL;
END;
GO

IF COL_LENGTH('dbo.ColaboradorJornadaSemanal', 'DataAtualizacao') IS NULL
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal ADD DataAtualizacao DATETIME NULL;
END;
GO

UPDATE dbo.ColaboradorJornadaSemanal
SET
    Ativo = ISNULL(Ativo, 1),
    DataCadastro = ISNULL(DataCadastro, GETDATE()),
    DataAtualizacao = ISNULL(DataAtualizacao, GETDATE());
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.ColaboradorJornadaSemanal')
      AND c.name = 'Ativo'
)
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal
    ADD CONSTRAINT DF_ColaboradorJornadaSemanal_Ativo DEFAULT (1) FOR Ativo;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.ColaboradorJornadaSemanal')
      AND c.name = 'DataCadastro'
)
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal
    ADD CONSTRAINT DF_ColaboradorJornadaSemanal_DataCadastro DEFAULT (GETDATE()) FOR DataCadastro;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.ColaboradorJornadaSemanal')
      AND c.name = 'DataAtualizacao'
)
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal
    ADD CONSTRAINT DF_ColaboradorJornadaSemanal_DataAtualizacao DEFAULT (GETDATE()) FOR DataAtualizacao;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('dbo.ColaboradorJornadaSemanal')
      AND name = 'FK_ColaboradorJornadaSemanal_Colaboradores'
)
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal
    ADD CONSTRAINT FK_ColaboradorJornadaSemanal_Colaboradores
        FOREIGN KEY (ColaboradorId) REFERENCES dbo.Colaboradores(Id);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.ColaboradorJornadaSemanal')
      AND name = 'CK_ColaboradorJornadaSemanal_DiaSemana'
)
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal
    ADD CONSTRAINT CK_ColaboradorJornadaSemanal_DiaSemana
        CHECK (DiaSemana BETWEEN 0 AND 6);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.ColaboradorJornadaSemanal')
      AND name = 'CK_ColaboradorJornadaSemanal_Horario'
)
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal
    ADD CONSTRAINT CK_ColaboradorJornadaSemanal_Horario
        CHECK (
            (TrabalhoInicio IS NULL AND TrabalhoFim IS NULL)
            OR
            (TrabalhoInicio IS NOT NULL AND TrabalhoFim IS NOT NULL AND TrabalhoInicio < TrabalhoFim)
        );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.ColaboradorJornadaSemanal')
      AND name = 'CK_ColaboradorJornadaSemanal_Almoco'
)
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal
    ADD CONSTRAINT CK_ColaboradorJornadaSemanal_Almoco
        CHECK (
            (AlmocoInicio IS NULL AND AlmocoFim IS NULL)
            OR
            (AlmocoInicio IS NOT NULL AND AlmocoFim IS NOT NULL AND AlmocoInicio < AlmocoFim)
        );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.ColaboradorJornadaSemanal')
      AND name = 'CK_ColaboradorJornadaSemanal_AlmocoDentroJornada'
)
BEGIN
    ALTER TABLE dbo.ColaboradorJornadaSemanal
    ADD CONSTRAINT CK_ColaboradorJornadaSemanal_AlmocoDentroJornada
        CHECK (
            (AlmocoInicio IS NULL AND AlmocoFim IS NULL)
            OR
            (TrabalhoInicio IS NOT NULL AND TrabalhoFim IS NOT NULL AND AlmocoInicio > TrabalhoInicio AND AlmocoFim < TrabalhoFim)
        );
END;
GO

ALTER TABLE dbo.ColaboradorJornadaSemanal ALTER COLUMN ColaboradorId INT NOT NULL;
ALTER TABLE dbo.ColaboradorJornadaSemanal ALTER COLUMN DiaSemana TINYINT NOT NULL;
ALTER TABLE dbo.ColaboradorJornadaSemanal ALTER COLUMN Ativo BIT NOT NULL;
ALTER TABLE dbo.ColaboradorJornadaSemanal ALTER COLUMN DataCadastro DATETIME NOT NULL;
ALTER TABLE dbo.ColaboradorJornadaSemanal ALTER COLUMN DataAtualizacao DATETIME NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.ColaboradorJornadaSemanal')
      AND name = 'UX_ColaboradorJornadaSemanal_Colaborador_Dia'
)
BEGIN
    CREATE UNIQUE INDEX UX_ColaboradorJornadaSemanal_Colaborador_Dia
        ON dbo.ColaboradorJornadaSemanal (ColaboradorId, DiaSemana);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.ColaboradorJornadaSemanal')
      AND name = 'IX_ColaboradorJornadaSemanal_Dia_Ativo'
)
BEGIN
    CREATE INDEX IX_ColaboradorJornadaSemanal_Dia_Ativo
        ON dbo.ColaboradorJornadaSemanal (DiaSemana, Ativo, ColaboradorId);
END;
GO
