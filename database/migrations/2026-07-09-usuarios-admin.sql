IF COL_LENGTH('dbo.Usuarios', 'IsAdmin') IS NULL
BEGIN
    ALTER TABLE dbo.Usuarios
        ADD IsAdmin BIT NOT NULL CONSTRAINT DF_Usuarios_IsAdmin DEFAULT (0);
END;
GO

-- Garante que sempre exista pelo menos um administrador: se ninguem esta
-- marcado, promove o usuario ativo mais antigo (ou, na falta de ativos,
-- o mais antigo de todos). Em instalacoes existentes isso promove o admin
-- criado no bootstrap da versao 1.3.0.
IF NOT EXISTS (SELECT 1 FROM dbo.Usuarios WHERE IsAdmin = 1)
BEGIN
    UPDATE u
    SET IsAdmin = 1
    FROM dbo.Usuarios u
    WHERE u.Id = COALESCE(
        (SELECT MIN(Id) FROM dbo.Usuarios WHERE Ativo = 1),
        (SELECT MIN(Id) FROM dbo.Usuarios)
    );
END;
GO
