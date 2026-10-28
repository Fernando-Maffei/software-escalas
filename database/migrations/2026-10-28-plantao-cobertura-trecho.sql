/*
    Cobertura de plantonista em sabado, domingo e feriado vira plantao.

    O trecho da cobertura (CoberturaTrechos) que cai num dia de plantao gera
    uma linha em plantoes, com o substituto na equipe, e cobertura_trecho_id
    aponta de volta para o trecho. A partir dai o plantao segue o caminho de
    todo plantao: escala do dia, banco de horas, banco semanal, relatorios.

    A linha e DERIVADA: o servico de coberturas a apaga e recria a cada
    gravacao (backend/services/cobertura-plantoes.js), e o editor do dia de
    plantao nao a regrava. cobertura_trecho_id nulo = plantao lancado a mao,
    que e tudo o que existia ate aqui.

    FK sem cascata de proposito: apagar o trecho com o plantao ainda la
    deixaria movimento de banco e linha de escala apontando para o nada. O
    servico apaga o plantao (e o que ele gerou) antes; esquecer isso falha.

    So acrescenta a coluna; nenhum registro existente e alterado.
*/
IF COL_LENGTH('dbo.plantoes', 'cobertura_trecho_id') IS NULL
BEGIN
    ALTER TABLE dbo.plantoes ADD cobertura_trecho_id INT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'FK_plantoes_CoberturaTrechos'
)
BEGIN
    ALTER TABLE dbo.plantoes
    ADD CONSTRAINT FK_plantoes_CoberturaTrechos
        FOREIGN KEY (cobertura_trecho_id) REFERENCES dbo.CoberturaTrechos (Id);
END;
GO

-- Um plantao por trecho.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'UX_plantoes_cobertura_trecho'
)
BEGIN
    CREATE UNIQUE INDEX UX_plantoes_cobertura_trecho
        ON dbo.plantoes (cobertura_trecho_id)
        WHERE cobertura_trecho_id IS NOT NULL;
END;
GO
