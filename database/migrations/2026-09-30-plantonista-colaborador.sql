/*
    Plantonista passa a ser definido NO CADASTRO do colaborador.

    Antes, "plantonista" era um efeito do Tipo de Escala (o molde que trazia a
    regra de folga de domingo). Agora o colaborador carrega dois campos:

        IsPlantonista   BIT           0 = colaborador normal, 1 = plantonista
        TipoPlantonista NVARCHAR(20)  'SEMANA' | 'FINAL_SEMANA' (so com IsPlantonista = 1)

    O CHECK amarra os dois: quem deixa de ser plantonista nao pode ficar com o
    tipo antigo gravado, e plantonista sem tipo e recusado. O IS NOT NULL e
    explicito de proposito: um CHECK so rejeita resultado FALSO, e NULL IN (...)
    da desconhecido — sem ele o banco aceitaria plantonista sem tipo.

    Migracao dos dados existentes (so linhas ainda nao marcadas, entao rodar de
    novo nao muda nada):
      - tipo de escala com regra de folga de domingo (DomingosFolgaCada) ou
        qualquer folga de domingo registrada  ->  FINAL_SEMANA
    Colaborador sem nenhum desses sinais continua normal (IsPlantonista = 0).
    TipoEscalaId e as tabelas de tipos de escala NAO sao tocados.

    A mesma derivacao roda ao restaurar um backup antigo, que nao tem estes
    campos (ver backend/services/plantonista.js).
*/

IF COL_LENGTH('dbo.Colaboradores', 'IsPlantonista') IS NULL
BEGIN
    ALTER TABLE dbo.Colaboradores ADD IsPlantonista BIT NOT NULL
        CONSTRAINT DF_Colaboradores_IsPlantonista DEFAULT (0);
END;
GO

IF COL_LENGTH('dbo.Colaboradores', 'TipoPlantonista') IS NULL
BEGIN
    ALTER TABLE dbo.Colaboradores ADD TipoPlantonista NVARCHAR(20) NULL;
END;
GO

UPDATE c
SET IsPlantonista = 1,
    TipoPlantonista = 'FINAL_SEMANA'
FROM dbo.Colaboradores c
WHERE c.IsPlantonista = 0
  AND (
      EXISTS (
          SELECT 1 FROM dbo.TiposEscala t
          WHERE t.Id = c.TipoEscalaId AND t.DomingosFolgaCada IS NOT NULL
      )
      OR EXISTS (
          SELECT 1 FROM dbo.FolgasDomingo f WHERE f.ColaboradorId = c.Id
      )
  );
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_Colaboradores_TipoPlantonista'
      AND parent_object_id = OBJECT_ID('dbo.Colaboradores')
)
BEGIN
    ALTER TABLE dbo.Colaboradores ADD CONSTRAINT CK_Colaboradores_TipoPlantonista CHECK (
        (IsPlantonista = 0 AND TipoPlantonista IS NULL)
        OR (IsPlantonista = 1 AND TipoPlantonista IS NOT NULL AND TipoPlantonista IN ('SEMANA', 'FINAL_SEMANA'))
    );
END;
GO
