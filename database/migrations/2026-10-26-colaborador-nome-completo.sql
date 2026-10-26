/*
    Colaborador: nome completo, para relatorios oficiais e documentos de
    assinatura (relatorio "Lancamentos para assinatura").

        Nome          NVARCHAR(300)  nome/apelido; continua sendo o que as telas,
                                     filtros, escala e plantoes mostram
        NomeCompleto  NVARCHAR(300)  novo, opcional (NULL = ainda nao informado)

    So acrescenta a coluna: nenhum registro existente e alterado. Quem nao tem
    nome completo segue funcionando, e o relatorio usa o Nome no lugar.
*/

IF COL_LENGTH('dbo.Colaboradores', 'NomeCompleto') IS NULL
BEGIN
    ALTER TABLE dbo.Colaboradores ADD NomeCompleto NVARCHAR(300) NULL;
END;
GO
