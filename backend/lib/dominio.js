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

module.exports = {
    AUSENCIA_PERIODOS,
    AUSENCIA_TIPOS,
    PLANTAO_TIPOS,
    PLANTAO_TIPOS_CREDITO
};
