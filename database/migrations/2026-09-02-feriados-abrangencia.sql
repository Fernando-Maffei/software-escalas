-- Abrangencia do feriado: nacional, estadual ou municipal.
--
-- Feriados.Tipo nasceu como NVARCHAR(50) livre, com default 'municipal' e sem
-- nenhuma restricao. Na pratica virou campo decorativo: nada no sistema o
-- consultava, e os valores gravados divergiam em caixa ('Nacional' do
-- importador convivendo com 'municipal' do default).
--
-- Agora a coluna e a TAG que identifica a origem do feriado no cadastro, na
-- escala e nos relatorios. A regra de negocio continua a mesma para os tres:
-- nacional, estadual e municipal valem igual para toda a empresa, e todos sao
-- lidos por classificarDia. O tipo diz de onde o feriado veio, nao quem ele
-- atinge.

-- 1) Normaliza o que ja existe, antes de restringir.
-- COLLATE binario de proposito: a collation padrao do banco e case-insensitive,
-- entao "Tipo <> LOWER(Tipo)" nunca seria verdadeiro e o UPDATE nao faria nada.
UPDATE dbo.Feriados
SET Tipo = LOWER(LTRIM(RTRIM(Tipo)))
WHERE Tipo IS NOT NULL
  AND Tipo COLLATE Latin1_General_BIN <> LOWER(LTRIM(RTRIM(Tipo))) COLLATE Latin1_General_BIN;
GO

-- Valores fora do vocabulario (inclusive vazios) viram 'municipal', que e o
-- default historico da coluna: feriado cadastrado a mao, sem origem declarada,
-- e quase sempre municipal.
UPDATE dbo.Feriados
SET Tipo = 'municipal'
WHERE Tipo IS NULL
   OR Tipo NOT IN ('nacional', 'estadual', 'municipal');
GO

-- 2) So entao aplica a restricao, para o UPDATE acima nao esbarrar nela.
IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.Feriados')
      AND name = 'CK_Feriados_Tipo'
)
BEGIN
    ALTER TABLE dbo.Feriados DROP CONSTRAINT CK_Feriados_Tipo;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.Feriados')
      AND name = 'CK_Feriados_Tipo'
)
BEGIN
    ALTER TABLE dbo.Feriados
    ADD CONSTRAINT CK_Feriados_Tipo
        CHECK (Tipo IN ('nacional', 'estadual', 'municipal'));
END;
GO

-- 3) Duas datas podem ser feriado ao mesmo tempo em abrangencias diferentes:
-- um feriado municipal pode cair no mesmo dia de um nacional. O indice UNIQUE
-- em Data impedia cadastrar os dois, e fazia o importador de feriados
-- nacionais falhar naquela data com "Ja existe um feriado cadastrado".
--
-- Vira unico por (Data, Tipo): continua barrando o cadastro repetido da mesma
-- abrangencia na mesma data, que e o engano real, e libera a coexistencia.
IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Feriados')
      AND name = 'UX_Feriados_Data'
)
BEGIN
    DROP INDEX UX_Feriados_Data ON dbo.Feriados;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Feriados')
      AND name = 'UX_Feriados_Data_Tipo'
)
BEGIN
    CREATE UNIQUE INDEX UX_Feriados_Data_Tipo
        ON dbo.Feriados (Data, Tipo);
END;
GO
