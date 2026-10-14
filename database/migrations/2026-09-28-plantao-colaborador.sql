/*
    PlantaoColaborador: a equipe do plantao numa tabela de ligacao (M17 da
    auditoria), no lugar do texto JSON em plantoes.colaboradores_ids ("[3,7]").

    Com o JSON nao havia chave estrangeira (a exclusao de um colaborador
    deixava ids orfaos nos plantoes) e achar os plantoes de uma pessoa exigia
    ler a tabela inteira: LIKE '%2%' casa tambem 12 e 21. Agora cada pessoa da
    equipe e uma linha, com FK para os dois lados; excluir o plantao leva junto
    a equipe (ON DELETE CASCADE).

    A migracao copia a equipe dos JSONs e remove a coluna antiga, numa
    transacao so. Entrada que nao e id inteiro, id repetido e id de
    colaborador que nao existe mais sao descartados (nao ha como manter uma
    FK para quem nao existe). O backup restaura arquivos antigos convertendo o
    JSON (ver backend/services/backup/normalizacao.js).
*/

IF OBJECT_ID('dbo.PlantaoColaborador', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PlantaoColaborador (
        PlantaoId INT NOT NULL,
        ColaboradorId INT NOT NULL,
        CONSTRAINT PK_PlantaoColaborador PRIMARY KEY (PlantaoId, ColaboradorId),
        CONSTRAINT FK_PlantaoColaborador_Plantao
            FOREIGN KEY (PlantaoId) REFERENCES dbo.plantoes (id) ON DELETE CASCADE,
        CONSTRAINT FK_PlantaoColaborador_Colaborador
            FOREIGN KEY (ColaboradorId) REFERENCES dbo.Colaboradores (Id)
    );

    CREATE INDEX IX_PlantaoColaborador_Colaborador ON dbo.PlantaoColaborador (ColaboradorId);
END;
GO

-- A coluna antiga so e citada por SQL dinamico: depois de removida, um
-- comando estatico que a cite nem compila.
IF COL_LENGTH('dbo.plantoes', 'colaboradores_ids') IS NOT NULL
BEGIN
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;

    EXEC(N'
        INSERT INTO dbo.PlantaoColaborador (PlantaoId, ColaboradorId)
        SELECT DISTINCT p.id, equipe.ColaboradorId
        FROM dbo.plantoes p
        CROSS APPLY (
            SELECT TRY_CAST(j.[value] AS INT) AS ColaboradorId
            FROM OPENJSON(CASE WHEN ISJSON(p.colaboradores_ids) = 1 THEN p.colaboradores_ids ELSE N''[]'' END) j
        ) equipe
        WHERE equipe.ColaboradorId IS NOT NULL
          AND EXISTS (SELECT 1 FROM dbo.Colaboradores c WHERE c.Id = equipe.ColaboradorId)
          AND NOT EXISTS (
              SELECT 1 FROM dbo.PlantaoColaborador pc
              WHERE pc.PlantaoId = p.id AND pc.ColaboradorId = equipe.ColaboradorId
          );
    ');

    DECLARE @padrao SYSNAME = (
        SELECT dc.name
        FROM sys.default_constraints dc
        INNER JOIN sys.columns c
            ON c.object_id = dc.parent_object_id
           AND c.column_id = dc.parent_column_id
        WHERE dc.parent_object_id = OBJECT_ID('dbo.plantoes')
          AND c.name = 'colaboradores_ids'
    );

    IF @padrao IS NOT NULL
    BEGIN
        DECLARE @removerPadrao NVARCHAR(400) = N'ALTER TABLE dbo.plantoes DROP CONSTRAINT ' + QUOTENAME(@padrao);
        EXEC(@removerPadrao);
    END;

    EXEC(N'ALTER TABLE dbo.plantoes DROP COLUMN colaboradores_ids');

    COMMIT TRANSACTION;
END;
GO
