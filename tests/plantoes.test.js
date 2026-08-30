const assert = require('node:assert/strict');

const {
    formatDateToISO,
    generateUpcomingSaturdays,
    normalizeColaboradores,
    normalizePlantaoType,
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
    }
];
