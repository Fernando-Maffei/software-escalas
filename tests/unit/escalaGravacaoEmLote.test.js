const assert = require('node:assert/strict');

const { LINHAS_POR_LOTE, mergeEscalaDiaEmLote } = require('../../backend/services/escala-gravacao-em-lote');
const { criarBancoEscalaFalso } = require('./apoio/banco-escala-falso');

function linha(colaboradorId, data, extra = {}) {
    return {
        colaboradorId,
        data,
        horaInicio: new Date('1970-01-01T08:00:00Z'),
        horaFim: new Date('1970-01-01T17:00:00Z'),
        almocoInicio: null,
        almocoFim: null,
        tipo: 'normal',
        observacao: null,
        origemTipo: null,
        origemId: null,
        ajusteManual: false,
        almocoAjustado: false,
        ...extra
    };
}

function diasDe2026(quantidade) {
    return Array.from({ length: quantidade }, (_, indice) => {
        const data = new Date(Date.UTC(2026, 0, 1 + indice));
        return data.toISOString().slice(0, 10);
    });
}

module.exports = [
    {
        // 12 parametros por linha; o SQL Server aceita ate 2100 por comando.
        name: 'merge em lote divide em comandos de ate 150 linhas e grava todas',
        async run() {
            const banco = criarBancoEscalaFalso();
            const linhas = diasDe2026(LINHAS_POR_LOTE * 2 + 1).map((data) => linha(7, data));

            const gravadas = await mergeEscalaDiaEmLote(banco, linhas);

            assert.equal(LINHAS_POR_LOTE * 12 <= 2100, true);
            assert.equal(banco.comandos.filter((comando) => comando === 'merge').length, 3);
            assert.equal(gravadas.length, linhas.length);
            assert.equal(banco.tabela().length, linhas.length);
        }
    },
    {
        name: 'merge em lote sem linhas nao vai ao banco',
        async run() {
            const banco = criarBancoEscalaFalso();

            assert.deepEqual(await mergeEscalaDiaEmLote(banco, []), []);
            assert.equal(banco.comandos.length, 0);
        }
    },
    {
        // A listagem da escala esconde o colaborador desligado, entao a linha
        // dele chega aqui como "nova". Tem que atualizar, como o MERGE de uma
        // linha fazia — INSERT esbarraria no indice unico.
        name: 'merge em lote atualiza a linha que ja existe em vez de duplicar',
        async run() {
            const banco = criarBancoEscalaFalso({
                escala: [{ colaborador_id: 3, data: '2026-03-02', tipo: 'ajuste', ajuste_manual: true }]
            });
            const [antes] = banco.tabela();

            const [gravada] = await mergeEscalaDiaEmLote(banco, [linha(3, '2026-03-02')]);

            assert.equal(banco.tabela().length, 1);
            assert.equal(gravada.id, antes.id);
            assert.equal(gravada.tipo, 'normal');
            assert.equal(gravada.ajuste_manual, false);
        }
    },
    {
        name: 'merge em lote leva cada campo da linha para o parametro da coluna certa',
        async run() {
            const banco = criarBancoEscalaFalso();
            const completa = linha(9, '2026-05-04', {
                almocoInicio: new Date('1970-01-01T12:00:00Z'),
                almocoFim: new Date('1970-01-01T13:00:00Z'),
                tipo: 'plantao',
                observacao: 'obs',
                origemTipo: 'plantao',
                origemId: 44,
                ajusteManual: true,
                almocoAjustado: true
            });

            await mergeEscalaDiaEmLote(banco, [completa]);
            const [gravada] = banco.tabela();

            assert.deepEqual(
                {
                    colaborador_id: gravada.colaborador_id,
                    data: gravada.data,
                    hora_inicio: gravada.hora_inicio,
                    hora_fim: gravada.hora_fim,
                    almoco_inicio: gravada.almoco_inicio,
                    almoco_fim: gravada.almoco_fim,
                    tipo: gravada.tipo,
                    observacao: gravada.observacao,
                    origem_tipo: gravada.origem_tipo,
                    origem_id: gravada.origem_id,
                    ajuste_manual: gravada.ajuste_manual,
                    almoco_ajustado: gravada.almoco_ajustado
                },
                {
                    colaborador_id: 9,
                    data: '2026-05-04',
                    hora_inicio: completa.horaInicio,
                    hora_fim: completa.horaFim,
                    almoco_inicio: completa.almocoInicio,
                    almoco_fim: completa.almocoFim,
                    tipo: 'plantao',
                    observacao: 'obs',
                    origem_tipo: 'plantao',
                    origem_id: 44,
                    ajuste_manual: true,
                    almoco_ajustado: true
                }
            );
        }
    }
];
