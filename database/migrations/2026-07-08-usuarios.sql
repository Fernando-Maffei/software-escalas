IF OBJECT_ID('dbo.Usuarios', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Usuarios (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Username NVARCHAR(100) NOT NULL,
        PasswordHash NVARCHAR(255) NOT NULL,
        PasswordSalt NVARCHAR(255) NOT NULL,
        DeveTrocarSenha BIT NOT NULL CONSTRAINT DF_Usuarios_DeveTrocarSenha DEFAULT (0),
        Ativo BIT NOT NULL CONSTRAINT DF_Usuarios_Ativo DEFAULT (1),
        CreatedAt DATETIME NOT NULL CONSTRAINT DF_Usuarios_CreatedAt DEFAULT (GETDATE()),
        UltimoLoginAt DATETIME NULL
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Usuarios')
      AND name = 'UX_Usuarios_Username'
)
BEGIN
    CREATE UNIQUE INDEX UX_Usuarios_Username
        ON dbo.Usuarios (Username);
END;
GO
