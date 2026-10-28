// Trechos de cobertura de dia util na escala do dia. Nada disso e gravado em
// escala_dia: a linha la e uma por pessoa por dia, e quem cobre o plantonista
// muitas vezes ja trabalhou o proprio expediente. Por isso a cobertura entra
// na LEITURA, em cima das linhas que a escala ja tem:
//
//   - substituto com linha no dia: os trechos vao em `coberturas`, um segundo
//     turno desenhado ao lado do expediente (como a ausencia parcial);
//   - substituto sem linha (dia fora da jornada dele): ganha uma linha tipo
//     'cobertura' com o primeiro trecho, e os demais vao em `coberturas`.
//
// Puro de proposito: os trechos ja chegam filtrados (cobertura-dia-util.js).

function segmentoDoTrecho(trecho) {
    return {
        trechoId: trecho.id,
        coberturaId: trecho.coberturaId,
        titularId: trecho.titularId,
        titularNome: trecho.titularNome,
        horaInicio: trecho.horaInicio,
        horaFim: trecho.horaFim,
        minutos: trecho.minutos,
        tipoCredito: trecho.tipoCredito
    };
}

function linhaDeCobertura(colaborador, trecho) {
    const setorId = colaborador.SetorId ?? colaborador.setorId ?? null;

    return {
        id: null,
        colaboradorId: Number(colaborador.Id ?? colaborador.id),
        colaboradorNome: colaborador.Nome ?? colaborador.nome ?? null,
        setorId: setorId === null ? null : Number(setorId),
        setorNome: colaborador.SetorNome ?? colaborador.setorNome ?? null,
        dataISO: trecho.dataISO,
        horaInicio: trecho.horaInicio,
        horaFim: trecho.horaFim,
        almocoInicio: null,
        almocoFim: null,
        tipo: 'cobertura',
        observacao: trecho.titularNome ? `Cobrindo ${trecho.titularNome}` : null,
        origemTipo: 'cobertura',
        origemId: trecho.id,
        ajusteManual: false,
        almocoAjustado: false,
        almocoPersonalizado: false,
        criadoEm: null,
        atualizadoEm: null
    };
}

// `colaboradores`: Map id -> cadastro de quem pode ganhar linha (ativos).
// `setorId`/`colaboradorId`: os mesmos filtros da leitura, para a linha criada
// aqui respeitar o que a consulta pediu.
function anexarCoberturasNaEscala(itens, trechos, opcoes = {}) {
    const { colaboradores = new Map(), setorId = null, colaboradorId = null } = opcoes;
    const resultado = (itens || []).map((item) => ({ ...item, coberturas: [] }));
    const porChave = new Map(resultado.map((item) => [`${Number(item.colaboradorId)}|${item.dataISO}`, item]));
    let criouLinha = false;

    for (const trecho of trechos || []) {
        const chave = `${trecho.substitutoId}|${trecho.dataISO}`;
        const existente = porChave.get(chave);

        if (existente) {
            existente.coberturas.push(segmentoDoTrecho(trecho));
            continue;
        }

        const colaborador = colaboradores.get(trecho.substitutoId);

        if (!colaborador
            || (colaboradorId && Number(colaboradorId) !== trecho.substitutoId)
            || (setorId && Number(colaborador.SetorId ?? colaborador.setorId) !== Number(setorId))) {
            continue;
        }

        const nova = { ...linhaDeCobertura(colaborador, trecho), coberturas: [] };
        porChave.set(chave, nova);
        resultado.push(nova);
        criouLinha = true;
    }

    // So reordena quando entrou linha nova: a ordem que veio do SQL (data,
    // nome) fica intacta no caso comum.
    if (criouLinha) {
        resultado.sort((a, b) => String(a.dataISO).localeCompare(String(b.dataISO))
            || String(a.colaboradorNome || '').localeCompare(String(b.colaboradorNome || ''), 'pt-BR'));
    }

    return resultado;
}

module.exports = {
    anexarCoberturasNaEscala
};
