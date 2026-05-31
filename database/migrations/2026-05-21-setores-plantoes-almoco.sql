IF OBJECT_ID('dbo.Setores', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Setores (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Nome NVARCHAR(120) NOT NULL,
        Ativo BIT NOT NULL CONSTRAINT DF_Setores_Ativo DEFAULT (1),
        Ordem INT NOT NULL CONSTRAINT DF_Setores_Ordem DEFAULT (0),
        CriadoEm DATETIME NOT NULL CONSTRAINT DF_Setores_CriadoEm DEFAULT (GETDATE()),
        AtualizadoEm DATETIME NOT NULL CONSTRAINT DF_Setores_AtualizadoEm DEFAULT (GETDATE())
    );
END;
GO

IF COL_LENGTH('dbo.Setores', 'Nome') IS NULL
BEGIN
    ALTER TABLE dbo.Setores ADD Nome NVARCHAR(120) NULL;
END;
GO

IF COL_LENGTH('dbo.Setores', 'Ativo') IS NULL
BEGIN
    ALTER TABLE dbo.Setores ADD Ativo BIT NULL;
END;
GO

IF COL_LENGTH('dbo.Setores', 'Ordem') IS NULL
BEGIN
    ALTER TABLE dbo.Setores ADD Ordem INT NULL;
END;
GO

IF COL_LENGTH('dbo.Setores', 'CriadoEm') IS NULL
BEGIN
    ALTER TABLE dbo.Setores ADD CriadoEm DATETIME NULL;
END;
GO

IF COL_LENGTH('dbo.Setores', 'AtualizadoEm') IS NULL
BEGIN
    ALTER TABLE dbo.Setores ADD AtualizadoEm DATETIME NULL;
END;
GO

UPDATE dbo.Setores
SET
    Nome = NULLIF(LTRIM(RTRIM(Nome)), ''),
    Ativo = ISNULL(Ativo, 1),
    Ordem = ISNULL(Ordem, 0),
    CriadoEm = ISNULL(CriadoEm, GETDATE()),
    AtualizadoEm = ISNULL(AtualizadoEm, GETDATE());
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.Setores')
      AND c.name = 'Ativo'
)
BEGIN
    ALTER TABLE dbo.Setores
    ADD CONSTRAINT DF_Setores_Ativo DEFAULT (1) FOR Ativo;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.Setores')
      AND c.name = 'Ordem'
)
BEGIN
    ALTER TABLE dbo.Setores
    ADD CONSTRAINT DF_Setores_Ordem DEFAULT (0) FOR Ordem;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.Setores')
      AND c.name = 'CriadoEm'
)
BEGIN
    ALTER TABLE dbo.Setores
    ADD CONSTRAINT DF_Setores_CriadoEm DEFAULT (GETDATE()) FOR CriadoEm;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.Setores')
      AND c.name = 'AtualizadoEm'
)
BEGIN
    ALTER TABLE dbo.Setores
    ADD CONSTRAINT DF_Setores_AtualizadoEm DEFAULT (GETDATE()) FOR AtualizadoEm;
END;
GO

UPDATE dbo.Setores
SET AtualizadoEm = GETDATE()
WHERE AtualizadoEm IS NULL;
GO

IF EXISTS (SELECT 1 FROM dbo.Setores WHERE Nome = N'Implantacao' AND NOT EXISTS (SELECT 1 FROM dbo.Setores WHERE Nome = N'Implantação'))
BEGIN
    UPDATE dbo.Setores
    SET Nome = N'Implantação',
        AtualizadoEm = GETDATE()
    WHERE Nome = N'Implantacao';
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Setores WHERE Nome = N'Implantação')
BEGIN
    INSERT INTO dbo.Setores (Nome, Ordem)
    VALUES (N'Implantação', 1);
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Setores WHERE Nome = N'N1')
BEGIN
    INSERT INTO dbo.Setores (Nome, Ordem)
    VALUES (N'N1', 2);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Setores')
      AND name = 'UX_Setores_Nome'
)
BEGIN
    CREATE UNIQUE INDEX UX_Setores_Nome
        ON dbo.Setores (Nome);
END;
GO

ALTER TABLE dbo.Setores ALTER COLUMN Nome NVARCHAR(120) NOT NULL;
ALTER TABLE dbo.Setores ALTER COLUMN Ativo BIT NOT NULL;
ALTER TABLE dbo.Setores ALTER COLUMN Ordem INT NOT NULL;
ALTER TABLE dbo.Setores ALTER COLUMN CriadoEm DATETIME NOT NULL;
ALTER TABLE dbo.Setores ALTER COLUMN AtualizadoEm DATETIME NOT NULL;
GO

IF COL_LENGTH('dbo.Colaboradores', 'SetorId') IS NULL
BEGIN
    ALTER TABLE dbo.Colaboradores ADD SetorId INT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('dbo.Colaboradores')
      AND name = 'FK_Colaboradores_Setores'
)
BEGIN
    ALTER TABLE dbo.Colaboradores
    ADD CONSTRAINT FK_Colaboradores_Setores
        FOREIGN KEY (SetorId) REFERENCES dbo.Setores(Id);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Colaboradores')
      AND name = 'IX_Colaboradores_SetorId'
)
BEGIN
    CREATE INDEX IX_Colaboradores_SetorId
        ON dbo.Colaboradores (SetorId, Nome);
END;
GO

IF OBJECT_ID('dbo.AlmocosPersonalizados', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AlmocosPersonalizados (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ColaboradorId INT NOT NULL,
        Data DATE NOT NULL,
        AlmocoInicio TIME NOT NULL,
        AlmocoFim TIME NOT NULL,
        CriadoEm DATETIME NOT NULL CONSTRAINT DF_AlmocosPersonalizados_CriadoEm DEFAULT (GETDATE()),
        AtualizadoEm DATETIME NOT NULL CONSTRAINT DF_AlmocosPersonalizados_AtualizadoEm DEFAULT (GETDATE())
    );
END;
GO

IF COL_LENGTH('dbo.AlmocosPersonalizados', 'ColaboradorId') IS NULL
BEGIN
    ALTER TABLE dbo.AlmocosPersonalizados ADD ColaboradorId INT NULL;
END;
GO

IF COL_LENGTH('dbo.AlmocosPersonalizados', 'Data') IS NULL
BEGIN
    ALTER TABLE dbo.AlmocosPersonalizados ADD Data DATE NULL;
END;
GO

IF COL_LENGTH('dbo.AlmocosPersonalizados', 'AlmocoInicio') IS NULL
BEGIN
    ALTER TABLE dbo.AlmocosPersonalizados ADD AlmocoInicio TIME NULL;
END;
GO

IF COL_LENGTH('dbo.AlmocosPersonalizados', 'AlmocoFim') IS NULL
BEGIN
    ALTER TABLE dbo.AlmocosPersonalizados ADD AlmocoFim TIME NULL;
END;
GO

IF COL_LENGTH('dbo.AlmocosPersonalizados', 'CriadoEm') IS NULL
BEGIN
    ALTER TABLE dbo.AlmocosPersonalizados ADD CriadoEm DATETIME NULL;
END;
GO

IF COL_LENGTH('dbo.AlmocosPersonalizados', 'AtualizadoEm') IS NULL
BEGIN
    ALTER TABLE dbo.AlmocosPersonalizados ADD AtualizadoEm DATETIME NULL;
END;
GO

UPDATE dbo.AlmocosPersonalizados
SET
    CriadoEm = ISNULL(CriadoEm, GETDATE()),
    AtualizadoEm = ISNULL(AtualizadoEm, GETDATE());
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.AlmocosPersonalizados')
      AND c.name = 'CriadoEm'
)
BEGIN
    ALTER TABLE dbo.AlmocosPersonalizados
    ADD CONSTRAINT DF_AlmocosPersonalizados_CriadoEm DEFAULT (GETDATE()) FOR CriadoEm;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.AlmocosPersonalizados')
      AND c.name = 'AtualizadoEm'
)
BEGIN
    ALTER TABLE dbo.AlmocosPersonalizados
    ADD CONSTRAINT DF_AlmocosPersonalizados_AtualizadoEm DEFAULT (GETDATE()) FOR AtualizadoEm;
END;
GO

ALTER TABLE dbo.AlmocosPersonalizados ALTER COLUMN ColaboradorId INT NOT NULL;
ALTER TABLE dbo.AlmocosPersonalizados ALTER COLUMN Data DATE NOT NULL;
ALTER TABLE dbo.AlmocosPersonalizados ALTER COLUMN AlmocoInicio TIME NOT NULL;
ALTER TABLE dbo.AlmocosPersonalizados ALTER COLUMN AlmocoFim TIME NOT NULL;
ALTER TABLE dbo.AlmocosPersonalizados ALTER COLUMN CriadoEm DATETIME NOT NULL;
ALTER TABLE dbo.AlmocosPersonalizados ALTER COLUMN AtualizadoEm DATETIME NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('dbo.AlmocosPersonalizados')
      AND name = 'FK_AlmocosPersonalizados_Colaboradores'
)
BEGIN
    ALTER TABLE dbo.AlmocosPersonalizados
    ADD CONSTRAINT FK_AlmocosPersonalizados_Colaboradores
        FOREIGN KEY (ColaboradorId) REFERENCES dbo.Colaboradores(Id);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.AlmocosPersonalizados')
      AND name = 'UX_AlmocosPersonalizados_Colaborador_Data'
)
BEGIN
    CREATE UNIQUE INDEX UX_AlmocosPersonalizados_Colaborador_Data
        ON dbo.AlmocosPersonalizados (ColaboradorId, Data);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.AlmocosPersonalizados')
      AND name = 'IX_AlmocosPersonalizados_Data'
)
BEGIN
    CREATE INDEX IX_AlmocosPersonalizados_Data
        ON dbo.AlmocosPersonalizados (Data, ColaboradorId);
END;
GO

IF COL_LENGTH('dbo.plantoes', 'tipo_plantao') IS NULL
BEGIN
    ALTER TABLE dbo.plantoes ADD tipo_plantao NVARCHAR(30) NULL;
END;
GO

UPDATE dbo.plantoes
SET tipo_plantao = CASE
    WHEN ((DATEDIFF(DAY, '20000102', data_plantao) % 7) + 7) % 7 = 6 THEN 'sabado'
    WHEN ((DATEDIFF(DAY, '20000102', data_plantao) % 7) + 7) % 7 = 0 THEN 'domingo'
    ELSE COALESCE(NULLIF(tipo_plantao, ''), 'sabado')
END
WHERE tipo_plantao IS NULL OR LTRIM(RTRIM(tipo_plantao)) = '';
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c
        ON c.object_id = dc.parent_object_id
       AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.plantoes')
      AND c.name = 'tipo_plantao'
)
BEGIN
    ALTER TABLE dbo.plantoes
    ADD CONSTRAINT DF_plantoes_tipo_plantao DEFAULT ('sabado') FOR tipo_plantao;
END;
GO

ALTER TABLE dbo.plantoes ALTER COLUMN tipo_plantao NVARCHAR(30) NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'CK_plantoes_tipo_plantao'
)
BEGIN
    ALTER TABLE dbo.plantoes
    ADD CONSTRAINT CK_plantoes_tipo_plantao
        CHECK (LOWER(tipo_plantao) IN ('sabado', 'domingo'));
END;
GO
