-- Sessoes de login persistidas no banco (antes viviam num Map em memoria
-- espelhado em disco). Mover para o banco permite que o servidor reinicie sem
-- deslogar ninguem E que varias instancias compartilhem a mesma sessao — pre-
-- requisito para hospedar na nuvem com mais de um processo atras de um balanceador.
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Sessoes')
BEGIN
    CREATE TABLE Sessoes (
        Token      CHAR(64)      NOT NULL PRIMARY KEY,
        UserId     INT           NOT NULL,
        Username   NVARCHAR(100) NOT NULL,
        IsAdmin    BIT           NOT NULL CONSTRAINT DF_Sessoes_IsAdmin DEFAULT 0,
        ExpiresAt  DATETIME2     NOT NULL,
        CriadoEm   DATETIME2     NOT NULL CONSTRAINT DF_Sessoes_CriadoEm DEFAULT SYSUTCDATETIME(),
        -- Apagar o usuario limpa as sessoes dele automaticamente, sem orfaos.
        CONSTRAINT FK_Sessoes_Usuarios FOREIGN KEY (UserId)
            REFERENCES Usuarios(Id) ON DELETE CASCADE
    );

    -- Revogar todas as sessoes de um usuario (desativar conta, remover admin,
    -- resetar senha) filtra por UserId.
    CREATE INDEX IX_Sessoes_UserId ON Sessoes(UserId);

    -- A limpeza periodica de sessoes expiradas filtra por ExpiresAt.
    CREATE INDEX IX_Sessoes_ExpiresAt ON Sessoes(ExpiresAt);
END
