-- Permite 'feriado' em plantoes.tipo_plantao.
--
-- A constraint CK_plantoes_tipo_plantao nasceu em 2026-05-21 aceitando apenas
-- 'sabado' e 'domingo'. O resto do sistema, porem, sempre tratou tres tipos:
-- backend/utils/plantoes.js declara PLANTAO_TIPOS = ['sabado','domingo',
-- 'feriado'], resolvePlantaoTypeByDate devolve 'feriado' quando a data esta na
-- tabela Feriados, e a tela oferece feriados na regua de datas.
--
-- O descompasso ficou escondido porque dependia de dois fatos ao mesmo tempo:
-- so da para lancar plantao em feriado se o feriado estiver cadastrado, e
-- instalacoes sem feriados cadastrados nunca chegavam ao INSERT. Assim que o
-- primeiro feriado e cadastrado, todo lancamento nele falha com:
--
--   The INSERT statement conflicted with the CHECK constraint
--   "CK_plantoes_tipo_plantao"
--
-- A migracao anterior nao conserta sozinha: ela cria a constraint dentro de um
-- IF NOT EXISTS, entao em banco ja existente o CHECK antigo permanece. Por
-- isso aqui a constraint e derrubada e recriada.

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'CK_plantoes_tipo_plantao'
)
BEGIN
    ALTER TABLE dbo.plantoes DROP CONSTRAINT CK_plantoes_tipo_plantao;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'CK_plantoes_tipo_plantao'
)
BEGIN
    ALTER TABLE dbo.plantoes
    ADD CONSTRAINT CK_plantoes_tipo_plantao
        CHECK (LOWER(tipo_plantao) IN ('sabado', 'domingo', 'feriado'));
END;
GO

-- Um dia pode ter mais de um lancamento (turnos com horarios e pessoas
-- diferentes: alguem das 08h as 13h e outra pessoa das 13h as 18h). O indice
-- UNIQUE em data_plantao, criado no schema base, impedia isso no banco.
--
-- Vira indice comum: o dia deixa de ser unico, mas continua indexado, que era
-- o outro papel do indice (as consultas filtram e ordenam por data_plantao).
-- Quem garante coerencia do dia agora e a rota, que substitui a data inteira
-- dentro de uma transacao.
IF EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'UX_plantoes_data'
      AND is_unique = 1
)
BEGIN
    DROP INDEX UX_plantoes_data ON dbo.plantoes;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.plantoes')
      AND name = 'IX_plantoes_data'
)
BEGIN
    CREATE INDEX IX_plantoes_data
        ON dbo.plantoes (data_plantao);
END;
GO
