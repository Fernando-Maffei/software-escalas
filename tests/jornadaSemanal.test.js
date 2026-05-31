const assert = require('node:assert/strict');

const {
    normalizeJornadaSemanalPayload,
    normalizeDiaSemana
} = require('../backend/utils/jornada-semanal');

module.exports = [
    {
        name: 'normalizeDiaSemana accepts values from Sunday to Saturday',
        run() {
            assert.equal(normalizeDiaSemana(0), 0);
            assert.equal(normalizeDiaSemana('6'), 6);
        }
    },
    {
        name: 'normalizeDiaSemana rejects days outside 0-6',
        run() {
            assert.throws(
                () => normalizeDiaSemana(7),
                /0 \(domingo\) a 6 \(sabado\)/i
            );
        }
    },
    {
        name: 'normalizeJornadaSemanalPayload keeps active rows and normalizes times',
        run() {
            const payload = normalizeJornadaSemanalPayload([
                {
                    diaSemana: 1,
                    trabalhoInicio: '13:00',
                    trabalhoFim: '22:00',
                    almocoInicio: '17:30',
                    almocoFim: '18:00'
                },
                {
                    diaSemana: 6,
                    trabalhoInicio: '13:00:00',
                    trabalhoFim: '22:00:00'
                }
            ]);

            assert.equal(payload.length, 2);
            assert.equal(payload[0].diaSemana, 1);
            assert.equal(payload[0].trabalhoInicio, '13:00:00');
            assert.equal(payload[0].trabalhoFim, '22:00:00');
            assert.equal(payload[1].diaSemana, 6);
            assert.equal(payload[1].almocoInicio, null);
            assert.equal(payload[1].almocoFim, null);
        }
    },
    {
        name: 'normalizeJornadaSemanalPayload rejects duplicate active days',
        run() {
            assert.throws(
                () => normalizeJornadaSemanalPayload([
                    { diaSemana: 1, trabalhoInicio: '09:00', trabalhoFim: '18:00' },
                    { diaSemana: 1, trabalhoInicio: '10:00', trabalhoFim: '19:00' }
                ]),
                /nao repita o dia da semana 1/i
            );
        }
    },
    {
        name: 'normalizeJornadaSemanalPayload requires work times for selected day',
        run() {
            assert.throws(
                () => normalizeJornadaSemanalPayload([
                    { diaSemana: 3, trabalhoInicio: null, trabalhoFim: null }
                ]),
                /inicio e fim do trabalho para o dia 3/i
            );
        }
    },
    {
        name: 'normalizeJornadaSemanalPayload supports null to clear schedule',
        run() {
            const payload = normalizeJornadaSemanalPayload(null);
            assert.deepEqual(payload, []);
        }
    }
];
