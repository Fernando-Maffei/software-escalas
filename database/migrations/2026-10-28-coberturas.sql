/*
    Cobertura de plantonista: quem assume o horario de quem esta fora.

    Coberturas guarda o CASO — de quem e o horario, em que periodo e, quando
    houver, a ausencia (ferias, folga, atestado) que o abriu. Cobertura avulsa
    (troca combinada, sem ausencia) deixa AusenciaId nulo.

    CoberturaTrechos guarda a DIVISAO desse horario: dia + horario + quem cobre.
    Os trechos de um dia particionam o horario necessario (o servico recusa
    sobreposicao — ver backend/services/cobertura-trechos.js), entao:
      - SubstitutoId nulo = trecho pendente, ainda descoberto;
      - um mesmo horario nunca e coberto duas vezes.
    O horario fica gravado no trecho (copia, nao referencia a jornada): mudar a
    jornada do titular depois nao reescreve cobertura antiga.

    TipoCredito sem DEFAULT de proposito: o time escolhe banco ou hora extra em
    cada trecho atribuido. O CHECK amarra os dois — pendente nao credita
    ninguem, atribuido precisa da escolha.

    Esta migracao so cria o registro. Nada aqui gera escala, plantao ou banco
    de horas: isso vem nas fases seguintes, sempre derivado destas tabelas.
*/
IF OBJECT_ID('dbo.Coberturas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Coberturas (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        TitularId INT NOT NULL,
        DataInicio DATE NOT NULL,
        DataFim DATE NOT NULL,
        AusenciaId INT NULL,
        Observacao NVARCHAR(500) NULL,
        CriadoEm DATETIME NOT NULL CONSTRAINT DF_Coberturas_CriadoEm DEFAULT (GETDATE()),
        AtualizadoEm DATETIME NOT NULL CONSTRAINT DF_Coberturas_AtualizadoEm DEFAULT (GETDATE()),
        CONSTRAINT FK_Coberturas_Titular FOREIGN KEY (TitularId) REFERENCES dbo.Colaboradores(Id),
        CONSTRAINT CK_Coberturas_Periodo CHECK (DataInicio <= DataFim)
    );
END;
GO

-- Sem FK para Ausencias de proposito (mesmo motivo do PlantaoId em
-- FolgasDomingo): apagar as ferias nao pode apagar em cascata quem ja cobriu.
-- A rota trata a ausencia que sumiu.

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Coberturas')
      AND name = 'IX_Coberturas_Titular_Periodo'
)
BEGIN
    CREATE INDEX IX_Coberturas_Titular_Periodo
        ON dbo.Coberturas (TitularId, DataInicio, DataFim);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Coberturas')
      AND name = 'IX_Coberturas_Periodo'
)
BEGIN
    CREATE INDEX IX_Coberturas_Periodo
        ON dbo.Coberturas (DataInicio, DataFim);
END;
GO

IF OBJECT_ID('dbo.CoberturaTrechos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CoberturaTrechos (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CoberturaId INT NOT NULL,
        Data DATE NOT NULL,
        HoraInicio TIME NOT NULL,
        HoraFim TIME NOT NULL,
        SubstitutoId INT NULL,
        TipoCredito NVARCHAR(20) NULL,
        Observacao NVARCHAR(500) NULL,
        CriadoEm DATETIME NOT NULL CONSTRAINT DF_CoberturaTrechos_CriadoEm DEFAULT (GETDATE()),
        AtualizadoEm DATETIME NOT NULL CONSTRAINT DF_CoberturaTrechos_AtualizadoEm DEFAULT (GETDATE()),
        CONSTRAINT FK_CoberturaTrechos_Cobertura FOREIGN KEY (CoberturaId)
            REFERENCES dbo.Coberturas(Id) ON DELETE CASCADE,
        CONSTRAINT FK_CoberturaTrechos_Substituto FOREIGN KEY (SubstitutoId)
            REFERENCES dbo.Colaboradores(Id),
        CONSTRAINT CK_CoberturaTrechos_Horario CHECK (HoraInicio < HoraFim),
        CONSTRAINT CK_CoberturaTrechos_Credito CHECK (
            (SubstitutoId IS NULL AND TipoCredito IS NULL)
            OR (SubstitutoId IS NOT NULL AND TipoCredito IS NOT NULL AND LOWER(TipoCredito) IN ('banco', 'extra'))
        )
    );
END;
GO

-- A tela abre a cobertura e lista os trechos dela por dia.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.CoberturaTrechos')
      AND name = 'IX_CoberturaTrechos_Cobertura_Data'
)
BEGIN
    CREATE INDEX IX_CoberturaTrechos_Cobertura_Data
        ON dbo.CoberturaTrechos (CoberturaId, Data, HoraInicio);
END;
GO

-- Conflitos do substituto e a escala do dia buscam por dia e por pessoa.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.CoberturaTrechos')
      AND name = 'IX_CoberturaTrechos_Data_Substituto'
)
BEGIN
    CREATE INDEX IX_CoberturaTrechos_Data_Substituto
        ON dbo.CoberturaTrechos (Data, SubstitutoId);
END;
GO
