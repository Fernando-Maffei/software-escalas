// Banco em memoria com o minimo que ensureEscalaBaseForPeriod consulta:
// colaboradores, jornada semanal, feriados e escala_dia (listagem, MERGE de
// uma linha ou em lote, DELETE por colaborador + dia). Responde pelo texto da
// consulta, como o driver faria, e devolve as linhas no formato do mssql (DATE
// e TIME como Date em UTC).
//
// Serve para provar sem SQL Server que a ORQUESTRACAO (quais linhas, com quais
// valores) nao mudou. O SQL em si so o banco de verdade prova (golden master e
// testes de integracao).

function dataSql(dataISO) {
    return new Date(`${dataISO}T00:00:00Z`);
}

function criarBancoEscalaFalso({ colaboradores = [], jornada = [], feriados = [], escala = [] } = {}) {
    const linhas = new Map();
    let proximoId = 1;
    const comandos = [];

    function chave(colaboradorId, dataISO) {
        return `${colaboradorId}|${dataISO}`;
    }

    function gravar(valores) {
        const k = chave(valores.colaborador_id, valores.data);
        const atual = linhas.get(k);
        const linha = {
            ...(atual || { id: proximoId++, criado_em: 'criado' }),
            ...valores,
            atualizado_em: 'atualizado'
        };
        linhas.set(k, linha);
        return linha;
    }

    for (const linha of escala) {
        gravar(linha);
    }

    function comoDoDriver(linha) {
        return { ...linha, data: dataSql(linha.data) };
    }

    // Valores de um MERGE: de uma linha (@colaboradorId) ou do lote
    // (@colaboradorId0, @colaboradorId1, ...).
    function linhasDoMerge(inputs) {
        const campos = {
            colaborador_id: 'colaboradorId',
            data: 'data',
            hora_inicio: 'horaInicio',
            hora_fim: 'horaFim',
            almoco_inicio: 'almocoInicio',
            almoco_fim: 'almocoFim',
            tipo: 'tipo',
            observacao: 'observacao',
            origem_tipo: 'origemTipo',
            origem_id: 'origemId',
            ajuste_manual: 'ajusteManual',
            almoco_ajustado: 'almocoAjustado'
        };
        const sufixos = 'colaboradorId' in inputs
            ? ['']
            : Object.keys(inputs)
                .filter((nome) => /^colaboradorId\d+$/.test(nome))
                .map((nome) => nome.slice('colaboradorId'.length))
                .sort((a, b) => Number(a) - Number(b));

        return sufixos.map((sufixo) => Object.fromEntries(
            Object.entries(campos).map(([coluna, campo]) => [coluna, inputs[`${campo}${sufixo}`]])
        ));
    }

    function responder(texto, inputs) {
        comandos.push(texto.includes('MERGE escala_dia') ? 'merge' : texto.includes('DELETE') ? 'delete' : 'select');

        if (texto.includes('MERGE escala_dia')) {
            return linhasDoMerge(inputs).map((valores) => comoDoDriver(gravar(valores)));
        }

        if (texto.includes('DELETE FROM escala_dia')) {
            linhas.delete(chave(inputs.colaboradorId, inputs.data));
            return [];
        }

        if (texto.includes('FROM Feriados')) {
            return feriados
                .filter((dataISO) => dataISO >= inputs.dataInicio && dataISO <= inputs.dataFim)
                .map((dataISO) => ({ Data: dataSql(dataISO) }));
        }

        // Fontes da hidratacao e almoco personalizado: o cenario nao tem nenhum.
        if (/FROM (AlmocosPersonalizados|Ausencias|plantoes|FolgasDomingo)\b/.test(texto)) {
            return [];
        }

        if (texto.includes('FROM ColaboradorJornadaSemanal')) {
            return jornada.filter((linha) => !inputs.colaboradorId || linha.ColaboradorId === inputs.colaboradorId);
        }

        if (texto.includes('FROM escala_dia e')) {
            const porId = new Map(colaboradores.map((c) => [c.Id, c]));
            // Listagem por periodo (listEscalaDiaRows, so ativos) ou de um
            // colaborador inteiro (syncColaboradorDefaultsToEscalaDia).
            return [...linhas.values()]
                .filter((linha) => !inputs.dataInicio || (linha.data >= inputs.dataInicio && linha.data <= inputs.dataFim))
                .filter((linha) => !inputs.data || linha.data === inputs.data)
                .filter((linha) => !texto.includes('c.Ativo = 1') || porId.get(linha.colaborador_id)?.Ativo === true)
                .filter((linha) => !inputs.colaboradorId || linha.colaborador_id === inputs.colaboradorId)
                .map((linha) => {
                    const colaborador = porId.get(linha.colaborador_id);
                    return {
                        ...linha,
                        data: undefined,
                        dataISO: linha.data,
                        colaboradorNome: colaborador.Nome,
                        setorId: colaborador.SetorId,
                        setorNome: colaborador.SetorNome
                    };
                })
                // ORDER BY e.data, c.Nome, como as consultas de verdade.
                .sort((a, b) => a.dataISO.localeCompare(b.dataISO) || a.colaboradorNome.localeCompare(b.colaboradorNome));
        }

        if (texto.includes('FROM Colaboradores c')) {
            const id = inputs.colaboradorId ?? inputs.id;
            return colaboradores.filter((c) => !id || c.Id === id);
        }

        throw new Error(`Consulta nao prevista no banco falso: ${texto.trim().slice(0, 80)}`);
    }

    return {
        comandos,
        // Estado final da tabela, ordenado, para comparar.
        tabela: () => [...linhas.values()].sort((a, b) => a.id - b.id),
        // Para imitar a transacao descartada: guarda e devolve o estado.
        instantaneo: () => new Map([...linhas].map(([k, linha]) => [k, { ...linha }])),
        restaurar(estado) {
            linhas.clear();
            estado.forEach((linha, k) => linhas.set(k, { ...linha }));
        },
        request() {
            const inputs = {};
            const request = {
                input(nome, _tipo, valor) {
                    inputs[nome] = valor;
                    return request;
                },
                async query(texto) {
                    return { recordset: responder(texto, inputs) };
                }
            };
            return request;
        }
    };
}

module.exports = { criarBancoEscalaFalso };
