const assert = require('node:assert/strict');

const {
    dividirTrecho,
    gerarTrechosNecessarios,
    juntarTrechos,
    resumirCobertura,
    tipoDoDia,
    validarTrechosDaCobertura
} = require('../../backend/services/cobertura-trechos');

// Plantonista de semana: segunda a sexta, 11h as 22h.
const JORNADA_SEMANA = new Map([1, 2, 3, 4, 5].map((dia) => [dia, { horaInicio: '11:00', horaFim: '22:00' }]));

// Novembro de 2026: 02/11 (segunda) e 15/11 (domingo) sao feriados nacionais.
const cobertura = { titularId: 10, dataInicio: '2026-11-03', dataFim: '2026-11-06' };

function trecho(dataISO, horaInicio, horaFim, substitutoId = null, tipoCredito = null) {
    return { dataISO, horaInicio, horaFim, substitutoId, tipoCredito };
}

module.exports = [
    {
        name: 'cobertura: tipo do dia separa dia util, fim de semana e feriado (feriado vence o domingo)',
        run() {
            assert.equal(tipoDoDia('2026-11-03'), 'util');
            assert.equal(tipoDoDia('2026-11-07'), 'sabado');
            assert.equal(tipoDoDia('2026-11-08'), 'domingo');
            assert.equal(tipoDoDia('2026-11-02'), 'feriado');
            assert.equal(tipoDoDia('2026-11-15'), 'feriado');
            // Feriado municipal so existe pelo Set cadastrado.
            assert.equal(tipoDoDia('2026-11-04', new Set(['2026-11-04'])), 'feriado');
        }
    },
    {
        name: 'cobertura: ferias geram um trecho pendente por dia de jornada, horario corrido',
        run() {
            const trechos = gerarTrechosNecessarios({
                dataInicio: '2026-11-01',
                dataFim: '2026-11-15',
                jornadaPorDiaSemana: JORNADA_SEMANA
            });

            // 10 dias de segunda a sexta entre 01/11 e 15/11, inclusive o
            // feriado de 02/11; sabado e domingo nao tem jornada, entao nao
            // geram trecho.
            assert.equal(trechos.length, 10);
            assert.deepEqual(trechos[0], {
                dataISO: '2026-11-02',
                tipoDia: 'feriado',
                horaInicio: '11:00:00',
                horaFim: '22:00:00',
                substitutoId: null,
                tipoCredito: null
            });
            assert.ok(trechos.every((item) => item.horaInicio === '11:00:00' && item.horaFim === '22:00:00'));
            assert.ok(!trechos.some((item) => ['sabado', 'domingo'].includes(item.tipoDia)));
        }
    },
    {
        name: 'cobertura: plantonista de fim de semana gera trechos de sabado e domingo',
        run() {
            const jornada = new Map([[6, { horaInicio: '08:00', horaFim: '18:00' }], [0, { horaInicio: '08:00', horaFim: '14:00' }]]);
            const trechos = gerarTrechosNecessarios({ dataInicio: '2026-11-07', dataFim: '2026-11-15', jornadaPorDiaSemana: jornada });

            assert.deepEqual(trechos.map((item) => [item.dataISO, item.tipoDia, item.horaFim]), [
                ['2026-11-07', 'sabado', '18:00:00'],
                ['2026-11-08', 'domingo', '14:00:00'],
                ['2026-11-14', 'sabado', '18:00:00'],
                ['2026-11-15', 'feriado', '14:00:00']
            ]);
        }
    },
    {
        name: 'cobertura: ausencia por horas cobre so a parte que cai na jornada',
        run() {
            const trechos = gerarTrechosNecessarios({
                dataInicio: '2026-11-03',
                dataFim: '2026-11-03',
                jornadaPorDiaSemana: JORNADA_SEMANA,
                ausencia: { periodoTipo: 'horas', horaInicio: '08:00', horaFim: '16:00' }
            });

            assert.deepEqual(trechos.map((item) => [item.horaInicio, item.horaFim]), [['11:00:00', '16:00:00']]);

            // Ausencia fora da jornada nao deixa nada a cobrir.
            assert.deepEqual(gerarTrechosNecessarios({
                dataInicio: '2026-11-03',
                dataFim: '2026-11-03',
                jornadaPorDiaSemana: JORNADA_SEMANA,
                ausencia: { periodoTipo: 'horas', horaInicio: '07:00', horaFim: '10:00' }
            }), []);
        }
    },
    {
        name: 'cobertura: periodo invertido e recusado',
        run() {
            assert.throws(
                () => gerarTrechosNecessarios({ dataInicio: '2026-11-10', dataFim: '2026-11-03', jornadaPorDiaSemana: JORNADA_SEMANA }),
                /maior ou igual/
            );
        }
    },
    {
        name: 'cobertura: dividir 16h-22h as 19h da duas metades que herdam o resto; o id fica na primeira',
        run() {
            const original = { id: 7, ...trecho('2026-11-03', '16:00:00', '22:00:00', 3, 'extra') };
            const [primeira, segunda] = dividirTrecho(original, '19:00');

            assert.deepEqual(primeira, { ...original, horaFim: '19:00:00' });
            assert.deepEqual(segunda, { ...trecho('2026-11-03', '19:00:00', '22:00:00', 3, 'extra') });
            assert.ok(!('id' in segunda));
        }
    },
    {
        name: 'cobertura: divisao na ponta ou fora do trecho e recusada',
        run() {
            const original = trecho('2026-11-03', '16:00:00', '22:00:00');

            assert.throws(() => dividirTrecho(original, '16:00'), /entre 16:00 e 22:00/);
            assert.throws(() => dividirTrecho(original, '22:00'), /entre 16:00 e 22:00/);
            assert.throws(() => dividirTrecho(original, '23:00'), /entre 16:00 e 22:00/);
        }
    },
    {
        name: 'cobertura: juntar desfaz a divisao, em qualquer ordem',
        run() {
            const original = { id: 7, ...trecho('2026-11-03', '16:00:00', '22:00:00', 3, 'banco') };
            const [primeira, segunda] = dividirTrecho(original, '19:00');

            assert.deepEqual(juntarTrechos(primeira, segunda), original);
            assert.deepEqual(juntarTrechos(segunda, primeira), original);
        }
    },
    {
        name: 'cobertura: so junta trechos do mesmo dia, emendados e com o mesmo substituto e credito',
        run() {
            const a = trecho('2026-11-03', '16:00:00', '19:00:00', 3, 'banco');

            assert.throws(() => juntarTrechos(a, trecho('2026-11-04', '19:00:00', '22:00:00', 3, 'banco')), /mesmo dia/);
            assert.throws(() => juntarTrechos(a, trecho('2026-11-03', '20:00:00', '22:00:00', 3, 'banco')), /em sequencia/);
            assert.throws(() => juntarTrechos(a, trecho('2026-11-03', '19:00:00', '22:00:00', 4, 'banco')), /mesmo substituto/);
            assert.throws(() => juntarTrechos(a, trecho('2026-11-03', '19:00:00', '22:00:00', 3, 'extra')), /mesmo credito/);
        }
    },
    {
        name: 'cobertura: validacao normaliza, ordena e aceita trechos pendentes e divididos',
        run() {
            const validos = validarTrechosDaCobertura({
                ...cobertura,
                trechos: [
                    trecho('2026-11-04', '11:00', '22:00'),
                    trecho('2026-11-03', '19:00', '22:00', '5', 'extra'),
                    trecho('2026-11-03', '11:00', '19:00', 4, 'banco')
                ]
            });

            assert.deepEqual(validos.map((item) => [item.dataISO, item.horaInicio, item.substitutoId, item.tipoCredito, item.tipoDia]), [
                ['2026-11-03', '11:00:00', 4, 'banco', 'util'],
                ['2026-11-03', '19:00:00', 5, 'extra', 'util'],
                ['2026-11-04', '11:00:00', null, null, 'util']
            ]);
        }
    },
    {
        // O que impede o mesmo horario de ser coberto duas vezes.
        name: 'cobertura: trechos do mesmo dia que se sobrepoem sao recusados',
        run() {
            assert.throws(
                () => validarTrechosDaCobertura({
                    ...cobertura,
                    trechos: [trecho('2026-11-03', '11:00', '19:00', 4, 'banco'), trecho('2026-11-03', '18:00', '22:00', 5, 'banco')]
                }),
                /03\/11\/2026 os trechos 11:00-19:00 e 18:00-22:00 se sobrepoem/
            );

            // Emendados (um termina onde o outro comeca) nao se sobrepoem.
            assert.equal(validarTrechosDaCobertura({
                ...cobertura,
                trechos: [trecho('2026-11-03', '11:00', '19:00'), trecho('2026-11-03', '19:00', '22:00')]
            }).length, 2);
        }
    },
    {
        name: 'cobertura: titular nao cobre a si mesmo',
        run() {
            assert.throws(
                () => validarTrechosDaCobertura({ ...cobertura, trechos: [trecho('2026-11-03', '11:00', '22:00', 10, 'banco')] }),
                /titular nao pode cobrir/
            );
        }
    },
    {
        // Sem credito padrao, por decisao do time.
        name: 'cobertura: trecho atribuido exige escolher banco ou hora extra',
        run() {
            assert.throws(
                () => validarTrechosDaCobertura({ ...cobertura, trechos: [trecho('2026-11-03', '11:00', '22:00', 4)] }),
                /banco de horas ou para hora extra/
            );
            assert.throws(
                () => validarTrechosDaCobertura({ ...cobertura, trechos: [trecho('2026-11-03', '11:00', '22:00', 4, 'folga')] }),
                /Credito do trecho 1/
            );

            // Pendente nao credita ninguem: o credito enviado e descartado.
            const [pendente] = validarTrechosDaCobertura({ ...cobertura, trechos: [trecho('2026-11-03', '11:00', '22:00', null, 'extra')] });
            assert.equal(pendente.tipoCredito, null);
        }
    },
    {
        name: 'cobertura: trecho fora do periodo ou com horario invertido e recusado',
        run() {
            assert.throws(
                () => validarTrechosDaCobertura({ ...cobertura, trechos: [trecho('2026-11-07', '11:00', '22:00')] }),
                /07\/11\/2026\) esta fora do periodo/
            );
            assert.throws(
                () => validarTrechosDaCobertura({ ...cobertura, trechos: [trecho('2026-11-03', '22:00', '11:00')] }),
                /terminar depois de comecar/
            );
            assert.throws(
                () => validarTrechosDaCobertura({ ...cobertura, trechos: [trecho('2026-11-03', '11:00', '22:00', 'abc', 'banco')] }),
                /Substituto do trecho 1 invalido/
            );
        }
    },
    {
        name: 'cobertura: resumo diz o que esta coberto, parcial e pendente, e as horas por substituto',
        run() {
            const resumo = resumirCobertura([
                trecho('2026-11-03', '11:00:00', '22:00:00', 4, 'banco'),
                trecho('2026-11-04', '11:00:00', '16:00:00', 5, 'banco'),
                trecho('2026-11-04', '16:00:00', '22:00:00'),
                trecho('2026-11-05', '11:00:00', '22:00:00'),
                trecho('2026-11-06', '11:00:00', '16:00:00', 5, 'extra')
            ]);

            assert.equal(resumo.situacao, 'parcial');
            assert.equal(resumo.minutosCobertos, (11 + 5 + 5) * 60);
            assert.equal(resumo.minutosPendentes, (6 + 11) * 60);
            assert.deepEqual(resumo.dias.map((dia) => [dia.dataISO, dia.situacao]), [
                ['2026-11-03', 'coberto'],
                ['2026-11-04', 'parcial'],
                ['2026-11-05', 'pendente'],
                ['2026-11-06', 'coberto']
            ]);
            assert.deepEqual(resumo.substitutos, [{ substitutoId: 4, minutos: 660 }, { substitutoId: 5, minutos: 600 }]);
        }
    },
    {
        name: 'cobertura: resumo geral coberto, pendente e vazio',
        run() {
            assert.equal(resumirCobertura([trecho('2026-11-03', '11:00:00', '22:00:00', 4, 'banco')]).situacao, 'coberto');
            assert.equal(resumirCobertura([trecho('2026-11-03', '11:00:00', '22:00:00')]).situacao, 'pendente');
            assert.equal(resumirCobertura([]).situacao, 'vazia');
        }
    }
];
