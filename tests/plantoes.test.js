const assert = require('node:assert/strict');

const {
    agruparLancamentosPorHorario,
    buildPlantaoDiaPayload,
    formatDateToISO,
    generateUpcomingSaturdays,
    horariosSeCruzam,
    normalizeColaboradores,
    normalizePlantaoType,
    resolvePlantaoTypeByDate,
    serializePlantaoRecord
} = require('../backend/utils/plantoes');

module.exports = [
    {
        name: 'buildPlantaoDiaPayload aceita varios lancamentos no mesmo dia',
        run() {
            const payload = buildPlantaoDiaPayload({
                dataISO: '2026-09-07',
                lancamentos: [
                    { horaInicio: '08:00', horaFim: '13:00', colaboradores: [1] },
                    { horaInicio: '13:00', horaFim: '18:00', colaboradores: [2] }
                ]
            }, new Set(['2026-09-07']));

            assert.equal(payload.dataISO, '2026-09-07');
            assert.equal(payload.tipoPlantao, 'feriado');
            assert.equal(payload.lancamentos.length, 2);
            assert.deepEqual(payload.lancamentos[0].colaboradores, [1]);
            assert.equal(payload.lancamentos[0].duracaoMinutos, 300);
            assert.deepEqual(payload.lancamentos[1].colaboradores, [2]);
        }
    },
    {
        name: 'buildPlantaoDiaPayload aceita o formato antigo de um lancamento so',
        run() {
            const payload = buildPlantaoDiaPayload({
                dataISO: '2026-09-05',
                horaInicio: '08:00',
                horaFim: '12:00',
                colaboradores: [3, 1, 3]
            });

            assert.equal(payload.tipoPlantao, 'sabado');
            assert.equal(payload.lancamentos.length, 1);
            assert.deepEqual(payload.lancamentos[0].colaboradores, [1, 3]);
        }
    },
    {
        name: 'buildPlantaoDiaPayload recusa o mesmo colaborador em turnos sobrepostos',
        run() {
            assert.throws(() => buildPlantaoDiaPayload({
                dataISO: '2026-09-05',
                lancamentos: [
                    { horaInicio: '08:00', horaFim: '14:00', colaboradores: [7] },
                    { horaInicio: '13:00', horaFim: '18:00', colaboradores: [7] }
                ]
            }), /sobrep/i);
        }
    },
    {
        name: 'buildPlantaoDiaPayload permite o mesmo colaborador em turnos que so encostam',
        run() {
            const payload = buildPlantaoDiaPayload({
                dataISO: '2026-09-05',
                lancamentos: [
                    { horaInicio: '08:00', horaFim: '13:00', colaboradores: [7] },
                    { horaInicio: '13:00', horaFim: '18:00', colaboradores: [7] }
                ]
            });

            assert.equal(payload.lancamentos.length, 2);
        }
    },
    {
        name: 'buildPlantaoDiaPayload exige colaborador em cada lancamento',
        run() {
            assert.throws(() => buildPlantaoDiaPayload({
                dataISO: '2026-09-05',
                lancamentos: [{ horaInicio: '08:00', horaFim: '12:00', colaboradores: [] }]
            }), /colaborador/i);
        }
    },
    {
        name: 'agruparLancamentosPorHorario junta quem faz o mesmo turno',
        run() {
            const grupos = agruparLancamentosPorHorario([
                { horaInicio: '08:00', horaFim: '12:00', colaboradores: [2], observacao: null },
                { horaInicio: '08:00', horaFim: '12:00', colaboradores: [1], observacao: null },
                { horaInicio: '13:00', horaFim: '18:00', colaboradores: [3], observacao: null }
            ]);

            assert.equal(grupos.length, 2);
            assert.deepEqual(grupos[0].colaboradores, [1, 2]);
            assert.deepEqual(grupos[1].colaboradores, [3]);
        }
    },
    {
        name: 'agruparLancamentosPorHorario nao junta horarios diferentes',
        run() {
            const grupos = agruparLancamentosPorHorario([
                { horaInicio: '08:00', horaFim: '13:00', colaboradores: [1], observacao: null },
                { horaInicio: '13:00', horaFim: '18:00', colaboradores: [2], observacao: null }
            ]);

            assert.equal(grupos.length, 2);
        }
    },
    {
        name: 'horariosSeCruzam distingue sobreposicao de sequencia',
        run() {
            const oitoAsTreze = { horaInicio: '08:00', horaFim: '13:00' };
            const trezeAsDezoito = { horaInicio: '13:00', horaFim: '18:00' };
            const dozeAsQuinze = { horaInicio: '12:00', horaFim: '15:00' };

            assert.equal(horariosSeCruzam(oitoAsTreze, trezeAsDezoito), false);
            assert.equal(horariosSeCruzam(oitoAsTreze, dozeAsQuinze), true);
            assert.equal(horariosSeCruzam(dozeAsQuinze, oitoAsTreze), true);
        }
    },
    {
        name: 'normalizeColaboradores removes duplicates and sorts ids',
        run() {
            assert.deepEqual(normalizeColaboradores([4, '2', 4, 1]), [1, 2, 4]);
        }
    },
    {
        name: 'generateUpcomingSaturdays starts from the next saturday',
        run() {
            const sabados = generateUpcomingSaturdays(3, new Date('2026-04-23T10:00:00'));

            assert.equal(sabados.length, 3);
            assert.equal(sabados[0].dataISO, '2026-04-25');
            assert.equal(sabados[1].dataISO, '2026-05-02');
            assert.equal(sabados[2].dataISO, '2026-05-09');
        }
    },
    {
        name: 'serializePlantaoRecord normalizes date and collaborators',
        run() {
            const serialized = serializePlantaoRecord({
                id: 10,
                data_plantao: new Date('2026-04-25T12:00:00'),
                colaboradores_ids: '[5,2,5]',
                tipo_plantao: 'sabado'
            });

            assert.equal(serialized.id, 10);
            assert.equal(serialized.dataISO, '2026-04-25');
            assert.deepEqual(serialized.colaboradores, [2, 5]);
            assert.equal(serialized.tipoPlantao, 'sabado');
        }
    },
    {
        // Domingo passou a valer como plantao (cobre a folga do plantonista),
        // ao lado de sabado e feriado. Dia util comum continua recusado.
        name: 'resolvePlantaoTypeByDate accepts saturday, sunday and holiday',
        run() {
            assert.equal(resolvePlantaoTypeByDate('2026-04-25'), 'sabado');
            assert.equal(resolvePlantaoTypeByDate('2026-04-26'), 'domingo');
            assert.throws(
                () => resolvePlantaoTypeByDate('2026-04-27'),
                /somente para sabado, domingo ou feriado/i
            );
        }
    },
    {
        // Um feriado em dia util so resolve quando o Set de feriados e passado;
        // sem ele, a mesma data cai na recusa de dia util.
        name: 'resolvePlantaoTypeByDate marks a weekday as holiday only with the holiday set',
        run() {
            const feriados = new Set(['2026-04-27']);

            assert.equal(resolvePlantaoTypeByDate('2026-04-27', feriados), 'feriado');
            assert.throws(() => resolvePlantaoTypeByDate('2026-04-27'), /somente para sabado/i);
        }
    },
    {
        name: 'normalizePlantaoType validates explicit type against weekend date',
        run() {
            assert.equal(normalizePlantaoType('sabado', '2026-04-25'), 'sabado');
            assert.equal(normalizePlantaoType('domingo', '2026-04-26'), 'domingo');
            // Tipo declarado que nao bate com o dia da data e recusado.
            assert.throws(
                () => normalizePlantaoType('domingo', '2026-04-25'),
                /corresponde a sabado, nao a domingo/i
            );
        }
    },
    {
        name: 'formatDateToISO keeps local calendar date stable',
        run() {
            assert.equal(formatDateToISO(new Date('2026-04-25T09:30:00')), '2026-04-25');
        }
    }
];
