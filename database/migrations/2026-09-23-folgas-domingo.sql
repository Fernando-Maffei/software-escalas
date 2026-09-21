/*
    FolgasDomingo: o vinculo explicito do plantonista.

    UMA linha guarda o evento inteiro, em vez de registros soltos que alguem
    teria que correlacionar depois:

      "Maria folgou domingo 26/10, repos na quinta 30/10 das 8h as 17h,
       coberta por Joao no plantao #42."

    Isso atende as duas ligacoes pedidas de uma vez — domingo folgado <-> dia
    da reposicao, e quem cobriu <-> quem estava de folga — e mantem as DATAS
    CONCRETAS no evento do mes, nao no cadastro do colaborador. O cadastro
    segue guardando so a regra (TiposEscala.DomingosFolgaCada).

    Nada aqui aplica regra de negocio: a tabela registra o que foi decidido.
    Conferir se a folga esta em dia com a frequencia da convencao e assunto do
    endpoint /verificar, separado do relatorio de proposito.

    Por que os horarios da reposicao ficam aqui: o dia reposto e, por
    definicao, um dia que a jornada semanal marca como folga — entao nao ha
    horario padrao de onde puxar. Sem estas colunas a linha de escala da
    reposicao nasceria sem horario.

    PlantaoId e anulavel: as vezes o posto nao precisa de cobertura, ou ela e
    lancada depois. CobertoPorColaboradorId idem.
*/

IF OBJECT_ID('dbo.FolgasDomingo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.FolgasDomingo (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ColaboradorId INT NOT NULL,
        DataDomingo DATE NOT NULL,
        DataReposicao DATE NULL,
        ReposicaoHoraInicio TIME NULL,
        ReposicaoHoraFim TIME NULL,
        CobertoPorColaboradorId INT NULL,
        PlantaoId INT NULL,
        Observacao NVARCHAR(500) NULL,
        CriadoEm DATETIME NOT NULL CONSTRAINT DF_FolgasDomingo_CriadoEm DEFAULT (GETDATE()),
        AtualizadoEm DATETIME NOT NULL CONSTRAINT DF_FolgasDomingo_AtualizadoEm DEFAULT (GETDATE())
    );
END;
GO

IF COL_LENGTH('dbo.FolgasDomingo', 'DataReposicao') IS NULL
BEGIN
    ALTER TABLE dbo.FolgasDomingo ADD DataReposicao DATE NULL;
END;
GO

IF COL_LENGTH('dbo.FolgasDomingo', 'ReposicaoHoraInicio') IS NULL
BEGIN
    ALTER TABLE dbo.FolgasDomingo ADD ReposicaoHoraInicio TIME NULL;
END;
GO

IF COL_LENGTH('dbo.FolgasDomingo', 'ReposicaoHoraFim') IS NULL
BEGIN
    ALTER TABLE dbo.FolgasDomingo ADD ReposicaoHoraFim TIME NULL;
END;
GO

IF COL_LENGTH('dbo.FolgasDomingo', 'CobertoPorColaboradorId') IS NULL
BEGIN
    ALTER TABLE dbo.FolgasDomingo ADD CobertoPorColaboradorId INT NULL;
END;
GO

IF COL_LENGTH('dbo.FolgasDomingo', 'PlantaoId') IS NULL
BEGIN
    ALTER TABLE dbo.FolgasDomingo ADD PlantaoId INT NULL;
END;
GO

IF COL_LENGTH('dbo.FolgasDomingo', 'Observacao') IS NULL
BEGIN
    ALTER TABLE dbo.FolgasDomingo ADD Observacao NVARCHAR(500) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('dbo.FolgasDomingo')
      AND name = 'FK_FolgasDomingo_Colaborador'
)
BEGIN
    ALTER TABLE dbo.FolgasDomingo
    ADD CONSTRAINT FK_FolgasDomingo_Colaborador
        FOREIGN KEY (ColaboradorId) REFERENCES dbo.Colaboradores(Id);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('dbo.FolgasDomingo')
      AND name = 'FK_FolgasDomingo_CobertoPor'
)
BEGIN
    ALTER TABLE dbo.FolgasDomingo
    ADD CONSTRAINT FK_FolgasDomingo_CobertoPor
        FOREIGN KEY (CobertoPorColaboradorId) REFERENCES dbo.Colaboradores(Id);
END;
GO

-- Sem FK para plantoes de proposito: excluir um plantao nao pode derrubar o
-- registro da folga, que continua sendo verdade (a folga aconteceu, so a
-- cobertura foi desfeita). A rota limpa o PlantaoId orfao ao ler.

/*
    DataDomingo precisa MESMO ser domingo. DATEPART(dw, ...) depende de
    SET DATEFIRST e por isso nao e deterministica — SQL Server recusa num
    CHECK. A conta abaixo e a mesma ja usada na migracao de plantoes:
    '20000102' foi um domingo, entao o resto por 7 da 0 nos domingos.
*/
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.FolgasDomingo')
      AND name = 'CK_FolgasDomingo_EhDomingo'
)
BEGIN
    ALTER TABLE dbo.FolgasDomingo
    ADD CONSTRAINT CK_FolgasDomingo_EhDomingo
        CHECK ((((DATEDIFF(DAY, '20000102', DataDomingo) % 7) + 7) % 7) = 0);
END;
GO

-- Dia reposto precisa de horario: ele e um dia que a jornada marca como
-- folga, entao nao ha horario padrao de onde puxar na hora de montar a escala.
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.FolgasDomingo')
      AND name = 'CK_FolgasDomingo_Reposicao'
)
BEGIN
    ALTER TABLE dbo.FolgasDomingo
    ADD CONSTRAINT CK_FolgasDomingo_Reposicao
        CHECK (
            DataReposicao IS NULL
            OR (
                ReposicaoHoraInicio IS NOT NULL
                AND ReposicaoHoraFim IS NOT NULL
                AND ReposicaoHoraInicio < ReposicaoHoraFim
            )
        );
END;
GO

-- Ninguem cobre a propria folga.
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.FolgasDomingo')
      AND name = 'CK_FolgasDomingo_CobrePorOutro'
)
BEGIN
    ALTER TABLE dbo.FolgasDomingo
    ADD CONSTRAINT CK_FolgasDomingo_CobrePorOutro
        CHECK (CobertoPorColaboradorId IS NULL OR CobertoPorColaboradorId <> ColaboradorId);
END;
GO

-- Um colaborador tem no maximo uma folga registrada por domingo.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.FolgasDomingo')
      AND name = 'UX_FolgasDomingo_Colaborador_Domingo'
)
BEGIN
    CREATE UNIQUE INDEX UX_FolgasDomingo_Colaborador_Domingo
        ON dbo.FolgasDomingo (ColaboradorId, DataDomingo);
END;
GO

-- A hidratacao da escala busca por periodo, pelas duas datas.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.FolgasDomingo')
      AND name = 'IX_FolgasDomingo_DataDomingo'
)
BEGIN
    CREATE INDEX IX_FolgasDomingo_DataDomingo
        ON dbo.FolgasDomingo (DataDomingo, ColaboradorId);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.FolgasDomingo')
      AND name = 'IX_FolgasDomingo_DataReposicao'
)
BEGIN
    CREATE INDEX IX_FolgasDomingo_DataReposicao
        ON dbo.FolgasDomingo (DataReposicao, ColaboradorId);
END;
GO
