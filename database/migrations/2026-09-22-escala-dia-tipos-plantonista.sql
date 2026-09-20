/*
    Tipos de dia novos em escala_dia, para o plantonista.

    Ate aqui o dia so podia ser normal / plantao / folga / ferias / ausencia /
    ajuste. Faltava distinguir quatro situacoes que o plantonista cria:

      domingo_folgado      o domingo de folga que a CLT exige
      reposicao            trabalhou num dia que seria folga, repondo o domingo
      folga_compensatoria  folgou em troca de trabalho extra (caso geral)
      cobertura            assumiu o posto de alguem que estava de folga

    'cobertura' fica separada de 'plantao' de proposito: plantao e turno extra
    num dia em que ninguem trabalha (sabado/domingo/feriado); cobertura e
    quando o lancamento aponta para QUEM estava de folga. O tipo sai do
    vinculo, nao de uma escolha do usuario — quem tem o vinculo vira cobertura,
    quem nao tem continua plantao.

    ATENCAO, recriacao de CHECK com banco cheio: o CHECK novo e um
    SUPERCONJUNTO do antigo (mantem os seis valores e soma quatro). Por isso
    nenhuma linha ja gravada pode viola-lo e o ADD CONSTRAINT nao tem como
    falhar por dado existente — o que importa porque uma falha aqui derrubaria
    todo o bootstrap do schema e o app nao subiria. Ainda assim: faca backup
    antes de subir com esta migracao.

    Esta migracao so ABRE os valores. Nada neste arquivo, e nada nesta fase,
    grava os tipos novos: quem passa a produzi-los e o vinculo da fase
    seguinte (FolgasDomingo).
*/

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.escala_dia')
      AND name = 'CK_escala_dia_tipo'
)
BEGIN
    ALTER TABLE dbo.escala_dia DROP CONSTRAINT CK_escala_dia_tipo;
END;
GO

ALTER TABLE dbo.escala_dia
ADD CONSTRAINT CK_escala_dia_tipo
    CHECK (tipo IN (
        'normal',
        'plantao',
        'folga',
        'ferias',
        'ausencia',
        'ajuste',
        'domingo_folgado',
        'reposicao',
        'folga_compensatoria',
        'cobertura'
    ));
GO
