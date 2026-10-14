// Valores validos do dominio, num lugar so. Antes cada lista existia em ate
// quatro copias (rota, servico, especificacao do backup) — e uma copia que
// ficasse para tras aceitaria ou recusaria dado diferente das outras.
//
// Os CHECKs do banco (database/migrations) sao a fonte final; estas listas
// precisam bater com eles.

const AUSENCIA_TIPOS = Object.freeze(['folga', 'ausencia', 'ferias']);

const AUSENCIA_PERIODOS = Object.freeze(['dia_inteiro', 'horas']);

// Plantao so existe em sabado, domingo ou feriado (CK_plantoes_tipo_plantao).
const PLANTAO_TIPOS = Object.freeze(['sabado', 'domingo', 'feriado']);

// Destino das horas do plantao: 'banco' credita BancoHorasMovimentos; 'extra'
// registra o plantao e a escala do dia, mas a hora e paga em folha
// (CK_plantoes_tipo_credito).
const PLANTAO_TIPOS_CREDITO = Object.freeze(['banco', 'extra']);

// Tipo de plantonista do colaborador (Colaboradores.TipoPlantonista). So vale
// com IsPlantonista = 1; fora disso o banco exige NULL
// (CK_Colaboradores_TipoPlantonista).
const TIPOS_PLANTONISTA = Object.freeze({
    SEMANA: 'SEMANA',
    FINAL_SEMANA: 'FINAL_SEMANA'
});
const TIPOS_PLANTONISTA_VALORES = Object.freeze(Object.values(TIPOS_PLANTONISTA));

module.exports = {
    TIPOS_PLANTONISTA,
    TIPOS_PLANTONISTA_VALORES,
    AUSENCIA_PERIODOS,
    AUSENCIA_TIPOS,
    PLANTAO_TIPOS,
    PLANTAO_TIPOS_CREDITO
};
