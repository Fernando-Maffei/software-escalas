IF OBJECT_ID('dbo.Colaboradores', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Colaboradores (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Nome NVARCHAR(300) NOT NULL,
        TrabalhoInicio TIME NULL,
        TrabalhoFim TIME NULL,
        AlmocoInicio TIME NULL,
        AlmocoFim TIME NULL
    );
END;
GO

IF COL_LENGTH('dbo.Colaboradores', 'Nome') IS NULL
BEGIN
    ALTER TABLE dbo.Colaboradores ADD Nome NVARCHAR(300) NULL;
END;
GO

IF COL_LENGTH('dbo.Colaboradores', 'TrabalhoInicio') IS NULL
BEGIN
    ALTER TABLE dbo.Colaboradores ADD TrabalhoInicio TIME NULL;
END;
GO

IF COL_LENGTH('dbo.Colaboradores', 'TrabalhoFim') IS NULL
BEGIN
    ALTER TABLE dbo.Colaboradores ADD TrabalhoFim TIME NULL;
END;
GO

IF COL_LENGTH('dbo.Colaboradores', 'AlmocoInicio') IS NULL
BEGIN
    ALTER TABLE dbo.Colaboradores ADD AlmocoInicio TIME NULL;
END;
GO

IF COL_LENGTH('dbo.Colaboradores', 'AlmocoFim') IS NULL
BEGIN
    ALTER TABLE dbo.Colaboradores ADD AlmocoFim TIME NULL;
END;
GO

IF OBJECT_ID('dbo.Feriados', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Feriados (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Nome NVARCHAR(200) NOT NULL,
        Data DATE NOT NULL,
        Tipo NVARCHAR(50) NOT NULL CONSTRAINT DF_Feriados_Tipo DEFAULT ('municipal')
    );
END;
GO

IF COL_LENGTH('dbo.Feriados', 'Nome') IS NULL
BEGIN
    ALTER TABLE dbo.Feriados ADD Nome NVARCHAR(200) NULL;
END;
GO

IF COL_LENGTH('dbo.Feriados', 'Data') IS NULL
BEGIN
    ALTER TABLE dbo.Feriados ADD Data DATE NULL;
END;
GO

IF COL_LENGTH('dbo.Feriados', 'Tipo') IS NULL
BEGIN
    ALTER TABLE dbo.Feriados ADD Tipo NVARCHAR(50) NULL;
END;
GO

UPDATE dbo.Feriados
SET Tipo = COALESCE(NULLIF(Tipo, ''), 'municipal')
WHERE Tipo IS NULL OR LTRIM(RTRIM(Tipo)) = '';
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.Feriados')
      AND name = 'DF_Feriados_Tipo'
)
BEGIN
    ALTER TABLE dbo.Feriados
    ADD CONSTRAINT DF_Feriados_Tipo DEFAULT ('municipal') FOR Tipo;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Feriados')
      AND name = 'UX_Feriados_Data'
)
BEGIN
    CREATE UNIQUE INDEX UX_Feriados_Data
        ON dbo.Feriados (Data);
END;
GO

IF OBJECT_ID('dbo.Ausencias', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Ausencias (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ColaboradorId INT NOT NULL,
        Tipo NVARCHAR(30) NOT NULL,
        DataInicio DATE NOT NULL,
        DataFim DATE NOT NULL,
        DataCadastro DATETIME NOT NULL CONSTRAINT DF_Ausencias_DataCadastro DEFAULT (GETDATE()),
        PeriodoTipo NVARCHAR(20) NOT NULL CONSTRAINT DF_Ausencias_PeriodoTipo DEFAULT ('dia_inteiro'),
        HoraInicio TIME NULL,
        HoraFim TIME NULL,
        Subtipo NVARCHAR(50) NULL,
        DescontaBancoHoras BIT NULL,
        Observacao NVARCHAR(500) NULL
    );
END;
GO

IF COL_LENGTH('dbo.Ausencias', 'ColaboradorId') IS NULL
BEGIN
    ALTER TABLE dbo.Ausencias ADD ColaboradorId INT NULL;
END;
GO

IF COL_LENGTH('dbo.Ausencias', 'Tipo') IS NULL
BEGIN
    ALTER TABLE dbo.Ausencias ADD Tipo NVARCHAR(30) NULL;
END;
GO

IF COL_LENGTH('dbo.Ausencias', 'DataInicio') IS NULL
BEGIN
    ALTER TABLE dbo.Ausencias ADD DataInicio DATE NULL;
END;
GO

IF COL_LENGTH('dbo.Ausencias', 'DataFim') IS NULL
BEGIN
    ALTER TABLE dbo.Ausencias ADD DataFim DATE NULL;
END;
GO

IF COL_LENGTH('dbo.Ausencias', 'DataCadastro') IS NULL
BEGIN
    ALTER TABLE dbo.Ausencias ADD DataCadastro DATETIME NULL;
END;
GO

IF COL_LENGTH('dbo.Ausencias', 'PeriodoTipo') IS NULL
BEGIN
    ALTER TABLE dbo.Ausencias ADD PeriodoTipo NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH('dbo.Ausencias', 'HoraInicio') IS NULL
BEGIN
    ALTER TABLE dbo.Ausencias ADD HoraInicio TIME NULL;
END;
GO

IF COL_LENGTH('dbo.Ausencias', 'HoraFim') IS NULL
BEGIN
    ALTER TABLE dbo.Ausencias ADD HoraFim TIME NULL;
END;
GO

UPDATE dbo.Ausencias
SET
    DataCadastro = COALESCE(DataCadastro, GETDATE()),
    PeriodoTipo = COALESCE(NULLIF(PeriodoTipo, ''), 'dia_inteiro')
WHERE DataCadastro IS NULL OR PeriodoTipo IS NULL OR LTRIM(RTRIM(PeriodoTipo)) = '';
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.Ausencias')
      AND name = 'DF_Ausencias_DataCadastro'
)
BEGIN
    ALTER TABLE dbo.Ausencias
    ADD CONSTRAINT DF_Ausencias_DataCadastro DEFAULT (GETDATE()) FOR DataCadastro;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.Ausencias')
      AND name = 'DF_Ausencias_PeriodoTipo'
)
BEGIN
    ALTER TABLE dbo.Ausencias
    ADD CONSTRAINT DF_Ausencias_PeriodoTipo DEFAULT ('dia_inteiro') FOR PeriodoTipo;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('dbo.Ausencias')
      AND name = 'FK_Ausencias_Colaboradores'
)
BEGIN
    ALTER TABLE dbo.Ausencias
    ADD CONSTRAINT FK_Ausencias_Colaboradores
        FOREIGN KEY (ColaboradorId) REFERENCES dbo.Colaboradores(Id);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Ausencias')
      AND name = 'IX_Ausencias_Colaborador_Data'
)
BEGIN
    CREATE INDEX IX_Ausencias_Colaborador_Data
        ON dbo.Ausencias (ColaboradorId, DataInicio, DataFim);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.Ausencias')
      AND name = 'CK_Ausencias_Tipo'
)
BEGIN
    ALTER TABLE dbo.Ausencias
    ADD CONSTRAINT CK_Ausencias_Tipo
        CHECK (LOWER(Tipo) IN ('folga', 'ausencia', 'ferias'));
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.Ausencias')
      AND name = 'CK_Ausencias_PeriodoTipo'
)
BEGIN
    ALTER TABLE dbo.Ausencias
    ADD CONSTRAINT CK_Ausencias_PeriodoTipo
        CHECK (LOWER(PeriodoTipo) IN ('dia_inteiro', 'horas'));
END;
GO

IF OBJECT_ID('dbo.plantoes', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.plantoes (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        data_plantao DATE NOT NULL,
        colaboradores_ids NVARCHAR(MAX) NOT NULL CONSTRAINT DF_plantoes_colaboradores DEFAULT ('[]'),
        criado_em DATETIME NOT NULL CONSTRAINT DF_plantoes_criado_em DEFAULT (GETDATE()),
        atualizado_em DATETIME NOT NULL CONSTRAINT DF_plantoes_atualizado_em DEFAULT (GETDATE()),
        hora_inicio TIME NULL,
        hora_fim TIME NULL,
        observacao NVARCHAR(500) NULL
    );
END;
GO

IF COL_LENGTH('dbo.plantoes', 'data_plantao') IS NULL
BEGIN
    ALTER TABLE dbo.plantoes ADD data_plantao DATE NULL;
END;
GO

IF COL_LENGTH('dbo.plantoes', 'colaboradores_ids') IS NULL
BEGIN
    ALTER TABLE dbo.plantoes ADD colaboradores_ids NVARCHAR(MAX) NULL;
END;
GO

IF COL_LENGTH('dbo.plantoes', 'criado_em') IS NULL
BEGIN
    ALTER TABLE dbo.plantoes ADD criado_em DATETIME NULL;
END;
GO

IF COL_LENGTH('dbo.plantoes', 'atualizado_em') IS NULL
BEGIN
    ALTER TABLE dbo.plantoes ADD atualizado_em DATETIME NULL;
END;
GO

UPDATE dbo.plantoes
SET
    colaboradores_ids = COALESCE(NULLIF(colaboradores_ids, ''), '[]'),
    criado_em = COALESCE(criado_em, GETDATE()),
    atualizado_em = COALESCE(atualizado_em, GETDATE())
WHERE colaboradores_ids IS NULL OR criado_em IS NULL OR atualizado_em IS NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'DF_plantoes_colaboradores'
)
BEGIN
    ALTER TABLE dbo.plantoes
    ADD CONSTRAINT DF_plantoes_colaboradores DEFAULT ('[]') FOR colaboradores_ids;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'DF_plantoes_criado_em'
)
BEGIN
    ALTER TABLE dbo.plantoes
    ADD CONSTRAINT DF_plantoes_criado_em DEFAULT (GETDATE()) FOR criado_em;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'DF_plantoes_atualizado_em'
)
BEGIN
    ALTER TABLE dbo.plantoes
    ADD CONSTRAINT DF_plantoes_atualizado_em DEFAULT (GETDATE()) FOR atualizado_em;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'UX_plantoes_data'
)
BEGIN
    CREATE UNIQUE INDEX UX_plantoes_data
        ON dbo.plantoes (data_plantao);
END;
GO
