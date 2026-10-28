const assert = require('node:assert/strict');

const {
    agruparPorDia,
    atribuirPendentes,
    ausenciasSemCobertura,
    dividirAoMeio,
    indiceCoberturaPorDia,
    montarRelatorioCoberturas,
    resumirTrechos,
    rotuloDia,
    rotuloOrigem,
    textoCoberturaDoDia,
    textoDuracao,
    textoSegundoTurno,
    trechosParaEnvio
} = require('../../frontend/js/lib/coberturas');

const trecho = (extra = {}) => ({
    id: 5,
    dataISO: '2027-01-04',
    tipoDia: 'util',
    horaInicio: '16:00:00',
    horaFim: '22:00:00',
    substitutoId: 20,
    substitutoNome: 'Bruno',
    substitutoOculto: false,
    tipoCredito: 'banco',
    observacao: null,
    ...extra
});

module.exports = [
    {
        // O exemplo do pedido: 16h-22h vira 16h-19h + 19h-22h.
        name: 'dividir corta na meia hora do meio; a segunda metade nasce pendente e sem id',
        run() {
            const [primeira, segunda] = dividirAoMeio(trecho());

            assert.deepEqual([primeira.horaInicio, primeira.horaFim], ['16:00:00', '19:00']);
            assert.equal(primeira.id, 5);
            assert.equal(primeira.substitutoId, 20);
            assert.deepEqual([segunda.horaInicio, segunda.horaFim], ['19:00', '22:00:00']);
            assert.ok(!('id' in segunda));
            assert.equal(segunda.substitutoId, null);
            assert.equal(segunda.tipoCredito, null);
            assert.equal(segunda.dataISO, '2027-01-04');
        }
    },
    {
        name: 'dividir horario curto usa o meio exato e recusa o que nao cabe',
        run() {
            const [a, b] = dividirAoMeio(trecho({ horaInicio: '10:00', horaFim: '10:20' }));
            assert.deepEqual([a.horaFim, b.horaInicio], ['10:10', '10:10']);
            assert.equal(dividirAoMeio(trecho({ horaInicio: '10:00', horaFim: '10:01' })), null);
        }
    },
    {
        name: 'atribuir pendentes so preenche quem nao tem substituto',
        run() {
            const trechos = atribuirPendentes(
                [trecho(), trecho({ id: 6, substitutoId: null, tipoCredito: null })],
                '30',
                'extra'
            );

            assert.deepEqual(trechos.map((item) => [item.substitutoId, item.tipoCredito]), [[20, 'banco'], [30, 'extra']]);
        }
    },
    {
        name: 'resumo, agrupamento por dia e envio seguem a mesma conta do servidor',
        run() {
            const trechos = [
                trecho({ dataISO: '2027-01-05' }),
                trecho({ id: 7, horaInicio: '11:00', horaFim: '16:00', substitutoId: null, tipoCredito: 'banco' })
            ];

            assert.deepEqual(resumirTrechos(trechos), { situacao: 'parcial', minutosCobertos: 360, minutosPendentes: 300 });
            assert.deepEqual(resumirTrechos([]).situacao, 'vazia');
            assert.deepEqual(agruparPorDia(trechos).map((dia) => [dia.dataISO, dia.itens.map((item) => item.indice)]), [
                ['2027-01-04', [1]],
                ['2027-01-05', [0]]
            ]);
            // Pendente vai sem credito, mesmo que a tela tenha guardado um.
            assert.deepEqual(trechosParaEnvio(trechos)[1], {
                id: 7,
                dataISO: '2027-01-04',
                horaInicio: '11:00',
                horaFim: '16:00',
                substitutoId: null,
                tipoCredito: null,
                observacao: null
            });
        }
    },
    {
        name: 'rotulos de dia, duracao e origem',
        run() {
            assert.equal(rotuloDia('2027-01-04'), 'Seg 04/01');
            assert.equal(textoDuracao(330), '5h30');
            assert.equal(textoDuracao(660), '11h');
            assert.equal(rotuloOrigem({ ausencia: { tipo: 'ferias' } }), 'Ferias');
            assert.equal(rotuloOrigem({ ausencia: null }), 'Avulsa');
            assert.equal(rotuloOrigem({ ausencia: null, ausenciaRemovida: true }), 'Ausencia removida');
        }
    },
    {
        name: 'precisam de cobertura: plantonista ativo, dia inteiro, nao terminou e sem cobertura',
        run() {
            const colaboradores = [
                { Id: 1, Nome: 'Ana', IsPlantonista: true, Ativo: true },
                { Id: 2, Nome: 'Bruno', IsPlantonista: false, Ativo: true },
                { Id: 3, Nome: 'Caio', IsPlantonista: true, Ativo: false }
            ];
            const ausencias = [
                { Id: 10, ColaboradorId: 1, Tipo: 'ferias', PeriodoTipo: 'dia_inteiro', DataInicio: '2027-01-04T00:00:00.000Z', DataFim: '2027-01-08T00:00:00.000Z' },
                { Id: 11, ColaboradorId: 1, Tipo: 'ausencia', PeriodoTipo: 'horas', DataInicio: '2027-01-12', DataFim: '2027-01-12' },
                { Id: 12, ColaboradorId: 1, Tipo: 'folga', PeriodoTipo: 'dia_inteiro', DataInicio: '2026-12-01', DataFim: '2026-12-02' },
                { Id: 13, ColaboradorId: 2, Tipo: 'ferias', PeriodoTipo: 'dia_inteiro', DataInicio: '2027-01-04', DataFim: '2027-01-08' },
                { Id: 14, ColaboradorId: 3, Tipo: 'ferias', PeriodoTipo: 'dia_inteiro', DataInicio: '2027-01-04', DataFim: '2027-01-08' },
                { Id: 15, ColaboradorId: 1, Tipo: 'folga', PeriodoTipo: 'dia_inteiro', DataInicio: '2027-02-01', DataFim: '2027-02-01' }
            ];

            const lista = ausenciasSemCobertura(ausencias, colaboradores, [{ ausenciaId: 15 }], '2027-01-01');

            assert.deepEqual(lista.map((item) => [item.id, item.colaboradorNome, item.dataInicio]), [[10, 'Ana', '2027-01-04']]);
        }
    },
    {
        name: 'calendario: situacao e quem cobre por dia do titular',
        run() {
            const indice = indiceCoberturaPorDia([
                {
                    titularId: 1,
                    trechos: [
                        trecho({ dataISO: '2027-01-04', substitutoNome: 'Carla' }),
                        trecho({ dataISO: '2027-01-04', substitutoNome: 'Bruno' }),
                        trecho({ dataISO: '2027-01-05', substitutoId: null, substitutoNome: null })
                    ],
                    resumo: {
                        dias: [
                            { dataISO: '2027-01-04', situacao: 'coberto' },
                            { dataISO: '2027-01-05', situacao: 'pendente' }
                        ]
                    }
                }
            ]);

            assert.equal(textoCoberturaDoDia(indice.get('1|2027-01-04')), 'Coberto por Carla, Bruno');
            assert.equal(textoCoberturaDoDia(indice.get('1|2027-01-05')), 'Sem cobertura');
            assert.equal(indice.get('2|2027-01-04'), undefined);
        }
    },
    {
        name: 'segundo turno em texto para o relatorio de escala',
        run() {
            assert.equal(
                textoSegundoTurno([{ titularNome: 'Ana', horaInicio: '19:00:00', horaFim: '22:00:00', tipoCredito: 'extra' }]),
                'Cobrindo Ana 19:00-22:00 (hora extra)'
            );
            assert.equal(textoSegundoTurno(undefined), '');
        }
    },
    {
        name: 'relatorio de coberturas soma banco e extra por pessoa e separa o que ficou sem ninguem',
        run() {
            const coberturas = [
                {
                    titularNome: 'Ana',
                    trechos: [
                        trecho({ horaInicio: '11:00', horaFim: '16:00', substitutoId: 30, substitutoNome: 'Carla', tipoCredito: 'extra' }),
                        trecho({ horaInicio: '16:00', horaFim: '22:00' }),
                        trecho({ dataISO: '2027-01-05', horaInicio: '11:00', horaFim: '22:00', substitutoId: null, substitutoNome: null, tipoCredito: null }),
                        trecho({ dataISO: '2027-02-01', horaInicio: '11:00', horaFim: '22:00' })
                    ]
                }
            ];

            const relatorio = montarRelatorioCoberturas(coberturas, { inicioISO: '2027-01-01', fimISO: '2027-01-31' });
            assert.deepEqual(
                relatorio.pessoas.map((pessoa) => [pessoa.nome, pessoa.minutosBanco, pessoa.minutosExtra, pessoa.trechos.length]),
                [['Bruno', 360, 0, 1], ['Carla', 0, 300, 1]]
            );
            assert.deepEqual(relatorio.totais, { banco: 360, extra: 300, pendente: 660 });
            assert.equal(relatorio.pendentes[0].titularNome, 'Ana');

            const soCarla = montarRelatorioCoberturas(coberturas, { inicioISO: '2027-01-01', fimISO: '2027-01-31', colaboradorId: '30' });
            assert.deepEqual(soCarla.pessoas.map((pessoa) => pessoa.nome), ['Carla']);
            assert.deepEqual(soCarla.pendentes, []);
        }
    }
];
