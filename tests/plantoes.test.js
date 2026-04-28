const assert = require('node:assert/strict');

const {
    formatDateToISO,
    generateUpcomingSaturdays,
    normalizeColaboradores,
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
                colaboradores_ids: '[5,2,5]'
            });

            assert.equal(serialized.id, 10);
            assert.equal(serialized.dataISO, '2026-04-25');
            assert.deepEqual(serialized.colaboradores, [2, 5]);
        }
    },
    {
        name: 'formatDateToISO keeps local calendar date stable',
        run() {
            assert.equal(formatDateToISO(new Date('2026-04-25T09:30:00')), '2026-04-25');
        }
    }
];
