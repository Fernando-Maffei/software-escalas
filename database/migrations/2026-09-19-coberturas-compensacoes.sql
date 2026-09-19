/* PROTOTIPO (branch prototipo/cobertura) - cobertura e compensacoes.

   1) escala_dia ganha os tipos do dia que faltavam: domingo_folgado,
      folga_compensatoria, reposicao e cobertura. O dia passa a carregar a
      classificacao; o relatorio so le.
   2) Coberturas: quem cobriu quem, em que data e horario, e se gerou hora
      extra. O sistema so MARCA a hora extra - valor e com a folha.
   3) Compensacoes: o vinculo entre a folga (domingo folgado ou folga
      compensatoria) e o dia trabalhado em troca (reposicao).

   Idempotente: roda em todo boot, como as demais. */

-- 1) Tipos do dia ---------------------------------------------------------
IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_escala_dia_tipo'
      AND parent_object_id = OBJECT_ID('dbo.escala_dia')
      AND definition NOT LIKE '%cobertura%'
)
BEGIN
    ALTER TABLE dbo.escala_dia DROP CONSTRAINT CK_escala_dia_tipo;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_escala_dia_tipo'
      AND parent_object_id = OBJECT_ID('dbo.escala_dia')
)
BEGIN
    ALTER TABLE dbo.escala_dia
    ADD CONSTRAINT CK_escala_dia_tipo
    CHECK (tipo IN (
        'normal', 'plantao', 'folga', 'ferias', 'ausencia', 'ajuste',
        'domingo_folgado', 'folga_compensatoria', 'reposicao', 'cobertura'
    ));
END;

GO

-- 2) Coberturas -----------------------------------------------------------
IF OBJECT_ID('dbo.Coberturas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Coberturas (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Data DATE NOT NULL,
        ColaboradorId INT NOT NULL,           -- quem cobriu
        CobertoColaboradorId INT NOT NULL,    -- quem estava de folga
        HoraInicio TIME NOT NULL,
        HoraFim TIME NOT NULL,
        GeraHoraExtra BIT NOT NULL CONSTRAINT DF_Coberturas_GeraHoraExtra DEFAULT (1),
        Observacao NVARCHAR(500) NULL,
        CriadoEm DATETIME NOT NULL CONSTRAINT DF_Coberturas_CriadoEm DEFAULT (GETDATE()),
        AtualizadoEm DATETIME NOT NULL CONSTRAINT DF_Coberturas_AtualizadoEm DEFAULT (GETDATE()),
        CONSTRAINT FK_Coberturas_Colaborador FOREIGN KEY (ColaboradorId) REFERENCES dbo.Colaboradores(Id),
        CONSTRAINT FK_Coberturas_Coberto FOREIGN KEY (CobertoColaboradorId) REFERENCES dbo.Colaboradores(Id),
        CONSTRAINT CK_Coberturas_Pessoas CHECK (ColaboradorId <> CobertoColaboradorId),
        CONSTRAINT CK_Coberturas_Horario CHECK (HoraFim > HoraInicio)
    );
END;

GO

-- Uma cobertura por pessoa por dia (a escala_dia tem uma linha por dia).
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_Coberturas_Colaborador_Data' AND object_id = OBJECT_ID('dbo.Coberturas')
)
BEGIN
    CREATE UNIQUE INDEX UX_Coberturas_Colaborador_Data ON dbo.Coberturas (ColaboradorId, Data);
END;

GO

-- 3) Compensacoes ---------------------------------------------------------
IF OBJECT_ID('dbo.Compensacoes', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Compensacoes (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ColaboradorId INT NOT NULL,
        Tipo NVARCHAR(30) NOT NULL,           -- domingo_folgado | folga_compensatoria
        DataFolga DATE NOT NULL,
        DataTrabalho DATE NOT NULL,           -- dia da reposicao
        TrabalhoInicio TIME NULL,
        TrabalhoFim TIME NULL,
        Observacao NVARCHAR(500) NULL,
        CriadoEm DATETIME NOT NULL CONSTRAINT DF_Compensacoes_CriadoEm DEFAULT (GETDATE()),
        AtualizadoEm DATETIME NOT NULL CONSTRAINT DF_Compensacoes_AtualizadoEm DEFAULT (GETDATE()),
        CONSTRAINT FK_Compensacoes_Colaborador FOREIGN KEY (ColaboradorId) REFERENCES dbo.Colaboradores(Id),
        CONSTRAINT CK_Compensacoes_Tipo CHECK (Tipo IN ('domingo_folgado', 'folga_compensatoria')),
        CONSTRAINT CK_Compensacoes_Datas CHECK (DataFolga <> DataTrabalho),
        CONSTRAINT CK_Compensacoes_Horario CHECK (
            (TrabalhoInicio IS NULL AND TrabalhoFim IS NULL)
            OR (TrabalhoInicio IS NOT NULL AND TrabalhoFim IS NOT NULL AND TrabalhoFim > TrabalhoInicio)
        )
    );
END;

GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_Compensacoes_Colaborador_Folga' AND object_id = OBJECT_ID('dbo.Compensacoes')
)
BEGIN
    CREATE UNIQUE INDEX UX_Compensacoes_Colaborador_Folga ON dbo.Compensacoes (ColaboradorId, DataFolga);
END;

GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_Compensacoes_Colaborador_Trabalho' AND object_id = OBJECT_ID('dbo.Compensacoes')
)
BEGIN
    CREATE UNIQUE INDEX UX_Compensacoes_Colaborador_Trabalho ON dbo.Compensacoes (ColaboradorId, DataTrabalho);
END;
