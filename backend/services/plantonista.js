// Plantonista e definido NO CADASTRO do colaborador (Colaboradores.IsPlantonista
// e Colaboradores.TipoPlantonista), e o resto do sistema consulta estes dois
// campos — nao ha mais uma definicao paralela na manutencao da escala.
//
//   colaborador normal             -> escala normal, sem regra de plantonista
//   plantonista de SEMANA          -> horario padrao 11:00-22:00, sem folga de domingo
//   plantonista de FINAL_SEMANA    -> plantoes de sabado/domingo e folga de domingo
//                                     (com reposicao)
//
// Quem deixa de ser plantonista nao carrega o tipo antigo: sem IsPlantonista o
// tipo vira NULL aqui e o banco recusa qualquer outra combinacao
// (CK_Colaboradores_TipoPlantonista).
const { AppError } = require('../lib/errors');
const { TIPOS_PLANTONISTA, TIPOS_PLANTONISTA_VALORES } = require('../lib/dominio');
const { normalizeBoolean, normalizeEnum } = require('../lib/validation');

// Horario padrao do plantonista de semana. E so o PADRAO do cadastro: vale
// quando o colaborador e salvo sem horario proprio; quem ja tem horario o mantem.
const HORARIO_PADRAO_SEMANA = Object.freeze({ trabalhoInicio: '11:00', trabalhoFim: '22:00' });

// Le os dois campos de uma linha do banco (PascalCase) ou de um payload
// (camelCase), sem inventar valor: ausente = colaborador normal.
function lerPlantonista(origem) {
    const isPlantonista = Boolean(origem?.IsPlantonista ?? origem?.isPlantonista);
    const tipo = origem?.TipoPlantonista ?? origem?.tipoPlantonista ?? null;

    return { isPlantonista, tipoPlantonista: isPlantonista ? tipo : null };
}

// Valida e normaliza o que o cadastro manda. `fallback` e a linha atual do
// banco (na edicao): campo nao enviado mantem o valor de la.
//
// - isPlantonista falso  -> tipo SEMPRE null, mesmo que venha preenchido;
// - isPlantonista true   -> tipo obrigatorio e dentro da lista.
function normalizarPlantonista(body = {}, fallback = {}) {
    const atual = lerPlantonista(fallback);
    const isPlantonista = body.isPlantonista !== undefined
        ? normalizeBoolean(body.isPlantonista, 'E plantonista', { defaultValue: false })
        : atual.isPlantonista;

    if (!isPlantonista) {
        return { isPlantonista: false, tipoPlantonista: null };
    }

    const bruto = body.tipoPlantonista !== undefined ? body.tipoPlantonista : atual.tipoPlantonista;

    if (bruto === undefined || bruto === null || String(bruto).trim() === '') {
        throw new AppError(400, 'Escolha o tipo de plantonista.');
    }

    return {
        isPlantonista: true,
        tipoPlantonista: normalizeEnum(bruto, 'Tipo de plantonista', TIPOS_PLANTONISTA_VALORES)
    };
}

// Plantonista de semana sem horario proprio recebe o padrao 11:00-22:00.
// So preenche quando NAO ha entrada nem saida: horario parcial e erro do
// usuario e segue para a validacao normal da jornada.
function aplicarHorarioPadrao(tipoPlantonista, horarios) {
    if (tipoPlantonista !== TIPOS_PLANTONISTA.SEMANA || horarios.trabalhoInicio || horarios.trabalhoFim) {
        return horarios;
    }

    return { ...horarios, ...HORARIO_PADRAO_SEMANA };
}

// Folga de domingo (com reposicao) existe so para plantonista de final de
// semana: o de semana nao tem folga no domingo, e colaborador normal nao e
// plantonista.
function temFolgaDeDomingo(colaborador) {
    const { isPlantonista, tipoPlantonista } = lerPlantonista(colaborador);

    return isPlantonista && tipoPlantonista === TIPOS_PLANTONISTA.FINAL_SEMANA;
}

// Mesma derivacao da migration 2026-09-30-plantonista-colaborador.sql, para o
// backup ANTIGO (sem IsPlantonista): tipo de escala com regra de folga de
// domingo, ou folga de domingo registrada, vira plantonista de final de semana.
// So toca linhas ainda nao marcadas.
const SQL_DERIVAR_PLANTONISTA_DE_BACKUP_ANTIGO = `
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
      )
`;

module.exports = {
    HORARIO_PADRAO_SEMANA,
    SQL_DERIVAR_PLANTONISTA_DE_BACKUP_ANTIGO,
    aplicarHorarioPadrao,
    lerPlantonista,
    normalizarPlantonista,
    temFolgaDeDomingo
};
