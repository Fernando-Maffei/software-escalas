const assert = require('node:assert/strict');

const {
    agruparLancamentosPorHorario,
    buildPlantaoDiaPayload,
    formatDateToISO,
    generateUpcomingSaturdays,
    normalizeColaboradores,
    normalizePlantaoType,
    normalizeTipoCredito,
    resolvePlantaoTypeByDate,
    serializePlantaoRecord
} = require('../backend/utils/plantoes');

module.exports = [
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
    },
    {
        // Registro gravado antes da coluna tipo_credito existir e credito de
        // banco: e o que o sistema sempre fez ate a hora extra aparecer.
        name: 'serializePlantaoRecord defaults tipoCredito to banco',
        run() {
            assert.equal(serializePlantaoRecord({ data_plantao: '2026-04-25' }).tipoCredito, 'banco');
            assert.equal(serializePlantaoRecord({ data_plantao: '2026-04-25', tipo_credito: 'extra' }).tipoCredito, 'extra');
            assert.equal(serializePlantaoRecord({ data_plantao: '2026-04-25', tipo_credito: 'lixo' }).tipoCredito, 'banco');
        }
    },
    {
        name: 'normalizeTipoCredito accepts banco/extra and rejects anything else',
        run() {
            assert.equal(normalizeTipoCredito(''), 'banco');
            assert.equal(normalizeTipoCredito('EXTRA'), 'extra');
            assert.throws(() => normalizeTipoCredito('folha'), /Tipo de credito/i);
        }
    },
    {
        name: 'buildPlantaoDiaPayload accepts several shifts on the same day',
        run() {
            const payload = buildPlantaoDiaPayload({
                dataISO: '2026-04-25',
                observacao: 'Fechamento',
                lancamentos: [
                    { colaboradorId: 1, horaInicio: '08:00', horaFim: '13:00' },
                    { colaboradorId: 2, horaInicio: '13:00', horaFim: '18:00', tipoCredito: 'extra' }
                ]
            });

            assert.equal(payload.tipoPlantao, 'sabado');
            assert.equal(payload.observacao, 'Fechamento');
            assert.equal(payload.lancamentos.length, 2);
            assert.deepEqual(payload.lancamentos[0].colaboradores, [1]);
            assert.equal(payload.lancamentos[0].tipoCredito, 'banco');
            assert.equal(payload.lancamentos[1].tipoCredito, 'extra');
            assert.equal(payload.lancamentos[1].duracaoMinutos, 300);
        }
    },
    {
        // O mesmo colaborador pode fazer dois turnos no dia, desde que nao se
        // cruzem: quem cruza e recusado antes de chegar ao banco.
        name: 'buildPlantaoDiaPayload rejects overlapping shifts for the same person',
        run() {
            const encostados = buildPlantaoDiaPayload({
                dataISO: '2026-04-25',
                lancamentos: [
                    { colaboradorId: 1, horaInicio: '08:00', horaFim: '13:00' },
                    { colaboradorId: 1, horaInicio: '13:00', horaFim: '18:00' }
                ]
            });

            assert.equal(encostados.lancamentos.length, 2);

            assert.throws(
                () => buildPlantaoDiaPayload({
                    dataISO: '2026-04-25',
                    lancamentos: [
                        { colaboradorId: 1, horaInicio: '08:00', horaFim: '14:00' },
                        { colaboradorId: 1, horaInicio: '13:00', horaFim: '18:00' }
                    ]
                }),
                /horarios que se sobrepoem/i
            );
        }
    },
    {
        name: 'buildPlantaoDiaPayload still accepts the old single-shift format',
        run() {
            const payload = buildPlantaoDiaPayload({
                dataISO: '2026-04-25',
                horaInicio: '08:00',
                horaFim: '12:00',
                colaboradores: [3, 1]
            });

            assert.equal(payload.lancamentos.length, 1);
            assert.deepEqual(payload.lancamentos[0].colaboradores, [1, 3]);
            assert.equal(payload.lancamentos[0].tipoCredito, 'banco');
        }
    },
    {
        // Mesmo horario com destinos diferentes NAO pode virar uma linha so: o
        // tipo_credito e gravado por linha e a distincao se perderia.
        name: 'agruparLancamentosPorHorario merges by time and keeps banco apart from extra',
        run() {
            const grupos = agruparLancamentosPorHorario([
                { horaInicio: '08:00', horaFim: '13:00', colaboradores: [2], tipoCredito: 'banco' },
                { horaInicio: '08:00', horaFim: '13:00', colaboradores: [5], tipoCredito: 'extra' },
                { horaInicio: '08:00', horaFim: '13:00', colaboradores: [1], tipoCredito: 'banco' },
                { horaInicio: '13:00', horaFim: '18:00', colaboradores: [1], tipoCredito: 'banco' }
            ]);

            assert.equal(grupos.length, 3);
            assert.deepEqual(grupos[0].colaboradores, [1, 2]);
            assert.equal(grupos[0].tipoCredito, 'banco');
            assert.deepEqual(grupos[1].colaboradores, [5]);
            assert.equal(grupos[1].tipoCredito, 'extra');
            assert.deepEqual(grupos[2].colaboradores, [1]);
        }
    }
];
