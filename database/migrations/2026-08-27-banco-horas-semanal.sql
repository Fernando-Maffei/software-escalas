-- Grade semanal de banco de horas (lancamento manual do gestor toda segunda).
-- Cada celula da tela = 1 linha: saldo acumulado do colaborador naquela semana.
-- Separada de BancoHorasMovimentos (livro-razao); esta e o substituto do ponto
-- enquanto nao ha API do sistema de pontos.
IF OBJECT_ID('dbo.BancoHorasSemanal', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BancoHorasSemanal (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ColaboradorId INT NOT NULL,
        SemanaSegunda DATE NOT NULL,          -- segunda-feira de referencia da semana
        Minutos INT NOT NULL,                 -- saldo acumulado em minutos (pode ser negativo)
        Observacao NVARCHAR(500) NULL,
        AtualizadoEm DATETIME NOT NULL
            CONSTRAINT DF_BancoHorasSemanal_AtualizadoEm DEFAULT (GETDATE()),
        CONSTRAINT FK_BancoHorasSemanal_Colaboradores
            FOREIGN KEY (ColaboradorId) REFERENCES dbo.Colaboradores(Id)
    );
END;
GO

-- Uma linha por colaborador por semana (o upsert bate nesse indice).
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.BancoHorasSemanal')
      AND name = 'UX_BancoHorasSemanal_Colaborador_Semana'
)
BEGIN
    CREATE UNIQUE INDEX UX_BancoHorasSemanal_Colaborador_Semana
        ON dbo.BancoHorasSemanal (ColaboradorId, SemanaSegunda);
END;
GO

-- Observacao por semana (a coluna Observacao da planilha: nota da linha inteira,
-- nao de um colaborador). Uma linha por segunda-feira.
IF OBJECT_ID('dbo.BancoHorasSemanalNota', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BancoHorasSemanalNota (
        SemanaSegunda DATE NOT NULL PRIMARY KEY,
        Observacao NVARCHAR(500) NULL,
        AtualizadoEm DATETIME NOT NULL
            CONSTRAINT DF_BancoHorasSemanalNota_AtualizadoEm DEFAULT (GETDATE())
    );
END;
GO

-- Status do lancamento: 'auto' (gerado pelo botao, amarelo, aguardando validacao)
-- ou 'confirmado' (verde). Linhas antigas/manuais nascem confirmadas.
IF COL_LENGTH('dbo.BancoHorasSemanal', 'Status') IS NULL
BEGIN
    ALTER TABLE dbo.BancoHorasSemanal ADD Status NVARCHAR(20) NOT NULL
        CONSTRAINT DF_BancoHorasSemanal_Status DEFAULT ('confirmado');
END;
GO
