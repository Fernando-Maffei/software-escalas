/*
    Tipo de Escala: o padrao semanal vira DADO reutilizavel, nao codigo.

    Ate aqui o padrao de dias de cada pessoa so existia em
    ColaboradorJornadaSemanal, uma linha por (colaborador, dia da semana).
    Isso ja permitia qualquer padrao — inclusive o plantonista de sabado a
    quarta — mas so no braco, pessoa por pessoa, sem nome e sem como repetir.

    TiposEscala e o MOLDE; ColaboradorJornadaSemanal continua sendo a regra
    efetiva de cada pessoa. Aplicar um tipo preenche a jornada do colaborador
    e nada mais: o gerador de escala (ensureEscalaBaseForPeriod) nao muda uma
    linha e continua lendo so a jornada semanal. Por isso um colaborador pode
    ter um tipo e ainda assim divergir dele num dia — o tipo e ponto de
    partida, nao amarra.

    CicloTipo ja aceita 'dias' no CHECK, embora o codigo so trate 'semanal'.
    E de proposito: 12x36 e um ciclo de 2 dias que desliza pela semana e nao
    cabe num modelo indexado por dia-da-semana. Deixar o valor previsto agora
    evita ter que recriar um CHECK com o banco de producao cheio quando (e se)
    12x36 entrar.

    DomingosFolgaCada / ExigeReposicao guardam a regra da CLT como DADO
    configuravel por tipo (a frequencia depende do setor/convencao coletiva,
    entao nao pode ser numero fixo no codigo). Nada neste arquivo aplica essa
    regra — ela e so registrada aqui; quem consome vem nas fases seguintes.
*/

IF OBJECT_ID('dbo.TiposEscala', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TiposEscala (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Nome NVARCHAR(120) NOT NULL,
        CicloTipo NVARCHAR(20) NOT NULL CONSTRAINT DF_TiposEscala_CicloTipo DEFAULT ('semanal'),
        DomingosFolgaCada INT NULL,
        ExigeReposicao BIT NOT NULL CONSTRAINT DF_TiposEscala_ExigeReposicao DEFAULT (0),
        Ativo BIT NOT NULL CONSTRAINT DF_TiposEscala_Ativo DEFAULT (1),
        Ordem INT NOT NULL CONSTRAINT DF_TiposEscala_Ordem DEFAULT (0),
        Observacao NVARCHAR(500) NULL,
        CriadoEm DATETIME NOT NULL CONSTRAINT DF_TiposEscala_CriadoEm DEFAULT (GETDATE()),
        AtualizadoEm DATETIME NOT NULL CONSTRAINT DF_TiposEscala_AtualizadoEm DEFAULT (GETDATE())
    );
END;
GO

IF COL_LENGTH('dbo.TiposEscala', 'CicloTipo') IS NULL
BEGIN
    ALTER TABLE dbo.TiposEscala ADD CicloTipo NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH('dbo.TiposEscala', 'DomingosFolgaCada') IS NULL
BEGIN
    ALTER TABLE dbo.TiposEscala ADD DomingosFolgaCada INT NULL;
END;
GO

IF COL_LENGTH('dbo.TiposEscala', 'ExigeReposicao') IS NULL
BEGIN
    ALTER TABLE dbo.TiposEscala ADD ExigeReposicao BIT NULL;
END;
GO

IF COL_LENGTH('dbo.TiposEscala', 'Observacao') IS NULL
BEGIN
    ALTER TABLE dbo.TiposEscala ADD Observacao NVARCHAR(500) NULL;
END;
GO

UPDATE dbo.TiposEscala
SET
    CicloTipo = COALESCE(NULLIF(LTRIM(RTRIM(CicloTipo)), ''), 'semanal'),
    ExigeReposicao = ISNULL(ExigeReposicao, 0),
    Ativo = ISNULL(Ativo, 1),
    Ordem = ISNULL(Ordem, 0),
    CriadoEm = ISNULL(CriadoEm, GETDATE()),
    AtualizadoEm = ISNULL(AtualizadoEm, GETDATE());
GO

ALTER TABLE dbo.TiposEscala ALTER COLUMN CicloTipo NVARCHAR(20) NOT NULL;
ALTER TABLE dbo.TiposEscala ALTER COLUMN ExigeReposicao BIT NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.TiposEscala')
      AND name = 'CK_TiposEscala_CicloTipo'
)
BEGIN
    ALTER TABLE dbo.TiposEscala
    ADD CONSTRAINT CK_TiposEscala_CicloTipo
        CHECK (LOWER(CicloTipo) IN ('semanal', 'dias'));
END;
GO

-- Zero ou negativo nao e "a cada N domingos", e sinal de dado errado.
IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.TiposEscala')
      AND name = 'CK_TiposEscala_DomingosFolgaCada'
)
BEGIN
    ALTER TABLE dbo.TiposEscala
    ADD CONSTRAINT CK_TiposEscala_DomingosFolgaCada
        CHECK (DomingosFolgaCada IS NULL OR DomingosFolgaCada > 0);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.TiposEscala')
      AND name = 'UX_TiposEscala_Nome'
)
BEGIN
    CREATE UNIQUE INDEX UX_TiposEscala_Nome
        ON dbo.TiposEscala (Nome);
END;
GO

/* O padrao semanal do tipo: uma linha por dia da semana (0 = domingo). */
IF OBJECT_ID('dbo.TipoEscalaDia', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TipoEscalaDia (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        TipoEscalaId INT NOT NULL,
        DiaSemana TINYINT NOT NULL,
        Trabalha BIT NOT NULL CONSTRAINT DF_TipoEscalaDia_Trabalha DEFAULT (0),
        TrabalhoInicio TIME NULL,
        TrabalhoFim TIME NULL,
        AlmocoInicio TIME NULL,
        AlmocoFim TIME NULL
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('dbo.TipoEscalaDia')
      AND name = 'FK_TipoEscalaDia_TiposEscala'
)
BEGIN
    ALTER TABLE dbo.TipoEscalaDia
    ADD CONSTRAINT FK_TipoEscalaDia_TiposEscala
        FOREIGN KEY (TipoEscalaId) REFERENCES dbo.TiposEscala(Id);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.TipoEscalaDia')
      AND name = 'CK_TipoEscalaDia_DiaSemana'
)
BEGIN
    ALTER TABLE dbo.TipoEscalaDia
    ADD CONSTRAINT CK_TipoEscalaDia_DiaSemana
        CHECK (DiaSemana BETWEEN 0 AND 6);
END;
GO

-- Mesma regra da ColaboradorJornadaSemanal: dia marcado como trabalhado
-- precisa de inicio e fim, e o inicio vem antes do fim.
IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.TipoEscalaDia')
      AND name = 'CK_TipoEscalaDia_Horario'
)
BEGIN
    ALTER TABLE dbo.TipoEscalaDia
    ADD CONSTRAINT CK_TipoEscalaDia_Horario
        CHECK (
            (Trabalha = 0)
            OR
            (TrabalhoInicio IS NOT NULL AND TrabalhoFim IS NOT NULL AND TrabalhoInicio < TrabalhoFim)
        );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.TipoEscalaDia')
      AND name = 'CK_TipoEscalaDia_Almoco'
)
BEGIN
    ALTER TABLE dbo.TipoEscalaDia
    ADD CONSTRAINT CK_TipoEscalaDia_Almoco
        CHECK (
            (AlmocoInicio IS NULL AND AlmocoFim IS NULL)
            OR
            (AlmocoInicio IS NOT NULL AND AlmocoFim IS NOT NULL AND AlmocoInicio < AlmocoFim)
        );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.TipoEscalaDia')
      AND name = 'UX_TipoEscalaDia_Tipo_Dia'
)
BEGIN
    CREATE UNIQUE INDEX UX_TipoEscalaDia_Tipo_Dia
        ON dbo.TipoEscalaDia (TipoEscalaId, DiaSemana);
END;
GO

/* Vinculo do colaborador com o tipo. Nulo = sem tipo (segue so a jornada). */
IF COL_LENGTH('dbo.Colaboradores', 'TipoEscalaId') IS NULL
BEGIN
    ALTER TABLE dbo.Colaboradores ADD TipoEscalaId INT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('dbo.Colaboradores')
      AND name = 'FK_Colaboradores_TiposEscala'
)
BEGIN
    ALTER TABLE dbo.Colaboradores
    ADD CONSTRAINT FK_Colaboradores_TiposEscala
        FOREIGN KEY (TipoEscalaId) REFERENCES dbo.TiposEscala(Id);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Colaboradores')
      AND name = 'IX_Colaboradores_TipoEscalaId'
)
BEGIN
    CREATE INDEX IX_Colaboradores_TipoEscalaId
        ON dbo.Colaboradores (TipoEscalaId);
END;
GO

/*
    Dois moldes de partida. Os HORARIOS sao chute — o que vale aqui e o
    PADRAO DE DIAS. Ajuste os horarios na tela antes de aplicar a alguem.
    Ficam inertes ate serem aplicados a um colaborador.
*/
IF NOT EXISTS (SELECT 1 FROM dbo.TiposEscala WHERE Nome = N'5x2 Comercial')
BEGIN
    INSERT INTO dbo.TiposEscala (Nome, CicloTipo, DomingosFolgaCada, ExigeReposicao, Ordem, Observacao)
    VALUES (N'5x2 Comercial', 'semanal', NULL, 0, 1,
            N'Segunda a sexta. Ajuste os horarios conforme o setor.');

    INSERT INTO dbo.TipoEscalaDia (TipoEscalaId, DiaSemana, Trabalha, TrabalhoInicio, TrabalhoFim, AlmocoInicio, AlmocoFim)
    SELECT
        (SELECT Id FROM dbo.TiposEscala WHERE Nome = N'5x2 Comercial'),
        d.DiaSemana,
        d.Trabalha,
        CASE WHEN d.Trabalha = 1 THEN CAST('08:00' AS TIME) END,
        CASE WHEN d.Trabalha = 1 THEN CAST('18:00' AS TIME) END,
        CASE WHEN d.Trabalha = 1 THEN CAST('12:00' AS TIME) END,
        CASE WHEN d.Trabalha = 1 THEN CAST('13:00' AS TIME) END
    FROM (VALUES (0, 0), (1, 1), (2, 1), (3, 1), (4, 1), (5, 1), (6, 0)) AS d(DiaSemana, Trabalha);
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.TiposEscala WHERE Nome = N'Plantonista Sáb-Qua')
BEGIN
    INSERT INTO dbo.TiposEscala (Nome, CicloTipo, DomingosFolgaCada, ExigeReposicao, Ordem, Observacao)
    VALUES (N'Plantonista Sáb-Qua', 'semanal', 4, 1, 2,
            N'Trabalha de sabado a quarta, folga quinta e sexta. Folga um domingo a cada 4 e repoe num dia de folga.');

    INSERT INTO dbo.TipoEscalaDia (TipoEscalaId, DiaSemana, Trabalha, TrabalhoInicio, TrabalhoFim, AlmocoInicio, AlmocoFim)
    SELECT
        (SELECT Id FROM dbo.TiposEscala WHERE Nome = N'Plantonista Sáb-Qua'),
        d.DiaSemana,
        d.Trabalha,
        CASE WHEN d.Trabalha = 1 THEN CAST('13:00' AS TIME) END,
        CASE WHEN d.Trabalha = 1 THEN CAST('22:00' AS TIME) END,
        CASE WHEN d.Trabalha = 1 THEN CAST('17:00' AS TIME) END,
        CASE WHEN d.Trabalha = 1 THEN CAST('18:00' AS TIME) END
    FROM (VALUES (0, 1), (1, 1), (2, 1), (3, 1), (4, 0), (5, 0), (6, 1)) AS d(DiaSemana, Trabalha);
END;
GO
