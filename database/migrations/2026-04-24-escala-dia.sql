IF OBJECT_ID('dbo.escala_dia', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.escala_dia (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        colaborador_id INT NOT NULL,
        data DATE NOT NULL,
        hora_inicio TIME NULL,
        hora_fim TIME NULL,
        almoco_inicio TIME NULL,
        almoco_fim TIME NULL,
        tipo NVARCHAR(30) NOT NULL CONSTRAINT DF_escala_dia_tipo DEFAULT ('normal'),
        observacao NVARCHAR(500) NULL,
        origem_tipo NVARCHAR(30) NULL,
        origem_id INT NULL,
        ajuste_manual BIT NOT NULL CONSTRAINT DF_escala_dia_ajuste_manual DEFAULT (0),
        almoco_ajustado BIT NOT NULL CONSTRAINT DF_escala_dia_almoco_ajustado DEFAULT (0),
        criado_em DATETIME NOT NULL CONSTRAINT DF_escala_dia_criado_em DEFAULT (GETDATE()),
        atualizado_em DATETIME NOT NULL CONSTRAINT DF_escala_dia_atualizado_em DEFAULT (GETDATE())
    );
END;

IF COL_LENGTH('dbo.escala_dia', 'hora_inicio') IS NULL
BEGIN
    ALTER TABLE dbo.escala_dia ADD hora_inicio TIME NULL;
END;

IF COL_LENGTH('dbo.escala_dia', 'hora_fim') IS NULL
BEGIN
    ALTER TABLE dbo.escala_dia ADD hora_fim TIME NULL;
END;

IF COL_LENGTH('dbo.escala_dia', 'almoco_inicio') IS NULL
BEGIN
    ALTER TABLE dbo.escala_dia ADD almoco_inicio TIME NULL;
END;

IF COL_LENGTH('dbo.escala_dia', 'almoco_fim') IS NULL
BEGIN
    ALTER TABLE dbo.escala_dia ADD almoco_fim TIME NULL;
END;

IF COL_LENGTH('dbo.escala_dia', 'tipo') IS NULL
BEGIN
    ALTER TABLE dbo.escala_dia ADD tipo NVARCHAR(30) NULL;
END;

IF COL_LENGTH('dbo.escala_dia', 'observacao') IS NULL
BEGIN
    ALTER TABLE dbo.escala_dia ADD observacao NVARCHAR(500) NULL;
END;

IF COL_LENGTH('dbo.escala_dia', 'origem_tipo') IS NULL
BEGIN
    ALTER TABLE dbo.escala_dia ADD origem_tipo NVARCHAR(30) NULL;
END;

IF COL_LENGTH('dbo.escala_dia', 'origem_id') IS NULL
BEGIN
    ALTER TABLE dbo.escala_dia ADD origem_id INT NULL;
END;

IF COL_LENGTH('dbo.escala_dia', 'ajuste_manual') IS NULL
BEGIN
    ALTER TABLE dbo.escala_dia ADD ajuste_manual BIT NULL;
END;

IF COL_LENGTH('dbo.escala_dia', 'almoco_ajustado') IS NULL
BEGIN
    ALTER TABLE dbo.escala_dia ADD almoco_ajustado BIT NULL;
END;

IF COL_LENGTH('dbo.escala_dia', 'criado_em') IS NULL
BEGIN
    ALTER TABLE dbo.escala_dia ADD criado_em DATETIME NULL;
END;

IF COL_LENGTH('dbo.escala_dia', 'atualizado_em') IS NULL
BEGIN
    ALTER TABLE dbo.escala_dia ADD atualizado_em DATETIME NULL;
END;

UPDATE dbo.escala_dia
SET
    tipo = ISNULL(tipo, 'normal'),
    ajuste_manual = ISNULL(ajuste_manual, 0),
    almoco_ajustado = ISNULL(almoco_ajustado, 0),
    criado_em = ISNULL(criado_em, GETDATE()),
    atualizado_em = ISNULL(atualizado_em, GETDATE());

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.escala_dia')
      AND name = 'DF_escala_dia_tipo'
)
BEGIN
    ALTER TABLE dbo.escala_dia
    ADD CONSTRAINT DF_escala_dia_tipo DEFAULT ('normal') FOR tipo;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.escala_dia')
      AND name = 'DF_escala_dia_ajuste_manual'
)
BEGIN
    ALTER TABLE dbo.escala_dia
    ADD CONSTRAINT DF_escala_dia_ajuste_manual DEFAULT (0) FOR ajuste_manual;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.escala_dia')
      AND name = 'DF_escala_dia_almoco_ajustado'
)
BEGIN
    ALTER TABLE dbo.escala_dia
    ADD CONSTRAINT DF_escala_dia_almoco_ajustado DEFAULT (0) FOR almoco_ajustado;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.escala_dia')
      AND name = 'DF_escala_dia_criado_em'
)
BEGIN
    ALTER TABLE dbo.escala_dia
    ADD CONSTRAINT DF_escala_dia_criado_em DEFAULT (GETDATE()) FOR criado_em;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.escala_dia')
      AND name = 'DF_escala_dia_atualizado_em'
)
BEGIN
    ALTER TABLE dbo.escala_dia
    ADD CONSTRAINT DF_escala_dia_atualizado_em DEFAULT (GETDATE()) FOR atualizado_em;
END;

ALTER TABLE dbo.escala_dia ALTER COLUMN tipo NVARCHAR(30) NOT NULL;
ALTER TABLE dbo.escala_dia ALTER COLUMN ajuste_manual BIT NOT NULL;
ALTER TABLE dbo.escala_dia ALTER COLUMN almoco_ajustado BIT NOT NULL;
ALTER TABLE dbo.escala_dia ALTER COLUMN criado_em DATETIME NOT NULL;
ALTER TABLE dbo.escala_dia ALTER COLUMN atualizado_em DATETIME NOT NULL;

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('dbo.escala_dia')
      AND name = 'FK_escala_dia_colaborador'
)
BEGIN
    ALTER TABLE dbo.escala_dia
    ADD CONSTRAINT FK_escala_dia_colaborador
        FOREIGN KEY (colaborador_id) REFERENCES dbo.Colaboradores(Id);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.escala_dia')
      AND name = 'UX_escala_dia_colaborador_data'
)
BEGIN
    CREATE UNIQUE INDEX UX_escala_dia_colaborador_data
        ON dbo.escala_dia (colaborador_id, data);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.escala_dia')
      AND name = 'IX_escala_dia_data'
)
BEGIN
    CREATE INDEX IX_escala_dia_data
        ON dbo.escala_dia (data, colaborador_id);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.escala_dia')
      AND name = 'IX_escala_dia_origem'
)
BEGIN
    CREATE INDEX IX_escala_dia_origem
        ON dbo.escala_dia (origem_tipo, origem_id, data);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.escala_dia')
      AND name = 'CK_escala_dia_tipo'
)
BEGIN
    ALTER TABLE dbo.escala_dia
    ADD CONSTRAINT CK_escala_dia_tipo
        CHECK (tipo IN ('normal', 'plantao', 'folga', 'ferias', 'ausencia', 'ajuste'));
END;
