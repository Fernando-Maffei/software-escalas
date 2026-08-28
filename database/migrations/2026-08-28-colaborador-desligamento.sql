-- Desligamento de colaborador (soft delete + retencao).
-- Ativo = 0 esconde o colaborador das telas ativas, mas preserva o historico.
-- DataDesligamento e a referencia para a limpeza definitiva posterior.
IF COL_LENGTH('dbo.Colaboradores', 'Ativo') IS NULL
BEGIN
    ALTER TABLE dbo.Colaboradores ADD Ativo BIT NOT NULL
        CONSTRAINT DF_Colaboradores_Ativo DEFAULT (1);
END;
GO

IF COL_LENGTH('dbo.Colaboradores', 'DataDesligamento') IS NULL
BEGIN
    ALTER TABLE dbo.Colaboradores ADD DataDesligamento DATE NULL;
END;
GO
