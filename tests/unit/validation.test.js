const assert = require('node:assert/strict');

const {
    buildDateRange,
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    hojeISO,
    normalizeEnum,
    normalizeIsoDate,
    normalizeTime,
    validateWorkSchedule
} = require('../../backend/lib/validation');

module.exports = [
    {
        // Acima do INT do SQL Server o driver recusava o parametro e virava 500.
        name: 'ensurePositiveInt recusa zero, negativo, texto e valor acima do INT do banco',
        run() {
            assert.equal(ensurePositiveInt('42', 'Id'), 42);
            assert.equal(ensurePositiveInt(2147483647, 'Id'), 2147483647);
            ['0', '-1', 'abc', '2147483648', '99999999999'].forEach((valor) => {
                assert.throws(() => ensurePositiveInt(valor, 'Id'), /Id invalido/);
            });
        }
    },
    {
        name: 'normalizeIsoDate accepts valid ISO dates',
        run() {
            assert.equal(normalizeIsoDate('2026-04-23'), '2026-04-23');
        }
    },
    {
        name: 'normalizeIsoDate rejects impossible calendar dates',
        run() {
            assert.throws(() => normalizeIsoDate('2026-02-30'), /invalida/);
        }
    },
    {
        name: 'normalizeEnum accepts accented labels and normalizes separators',
        run() {
            assert.equal(normalizeEnum('Aus\u00EAncia', 'Tipo', ['folga', 'ausencia', 'ferias']), 'ausencia');
            assert.equal(normalizeEnum('F\u00E9rias', 'Tipo', ['folga', 'ausencia', 'ferias']), 'ferias');
            assert.equal(normalizeEnum('dia inteiro', 'Periodo', ['dia_inteiro', 'horas']), 'dia_inteiro');
        }
    },
    {
        name: 'normalizeTime normalizes HH:mm to HH:mm:ss',
        run() {
            assert.equal(normalizeTime('08:30'), '08:30:00');
            assert.equal(normalizeTime('18:15:45'), '18:15:45');
        }
    },
    {
        name: 'buildDateRange rejects inverted periods',
        run() {
            assert.throws(() => buildDateRange('2026-05-10', '2026-05-01'), /maior ou igual/);
        }
    },
    {
        name: 'buildDateRange com maxDias conta as duas pontas e recusa o periodo maior',
        run() {
            assert.deepEqual(buildDateRange('2026-01-01', '2026-01-01', { maxDias: 1 }), {
                dataInicio: '2026-01-01',
                dataFim: '2026-01-01'
            });
            // 2028 e bissexto: 01/01 a 31/12 sao 366 dias.
            assert.doesNotThrow(() => buildDateRange('2028-01-01', '2028-12-31', { maxDias: 366 }));
            assert.throws(() => buildDateRange('2028-01-01', '2029-01-01', { maxDias: 366 }), /no maximo 366 dias/);
            assert.throws(() => buildDateRange('2020-01-01', '2030-12-31', { maxDias: 366 }), /no maximo 366 dias/);
            // Sem maxDias, sem teto (as demais rotas nao mudam).
            assert.doesNotThrow(() => buildDateRange('2020-01-01', '2030-12-31'));
        }
    },
    {
        // toISOString() da a data em UTC: no Brasil, das 21h a meia-noite ja era
        // o dia seguinte no banco de horas semanal.
        name: 'hojeISO usa a data local, nao a UTC',
        run() {
            assert.equal(hojeISO(new Date(2026, 9, 13, 23, 30)), '2026-10-13');
            assert.equal(hojeISO(new Date(2026, 9, 13, 0, 0)), '2026-10-13');
            assert.equal(hojeISO(new Date(2026, 0, 5, 12, 0)), '2026-01-05');
        }
    },
    {
        name: 'validateWorkSchedule rejects lunch outside work period',
        run() {
            assert.throws(() => validateWorkSchedule({
                trabalhoInicio: '08:00:00',
                trabalhoFim: '17:00:00',
                almocoInicio: '07:30:00',
                almocoFim: '08:30:00'
            }), /almoco deve estar dentro/);
        }
    },
    {
        name: 'validateWorkSchedule accepts a consistent schedule',
        run() {
            assert.doesNotThrow(() => validateWorkSchedule({
                trabalhoInicio: '08:00:00',
                trabalhoFim: '17:00:00',
                almocoInicio: '12:00:00',
                almocoFim: '13:00:00'
            }));
        }
    },
    {
        name: 'extractDateString keeps SQL date values on the same calendar day',
        run() {
            assert.equal(extractDateString(new Date('2026-04-25T00:00:00.000Z')), '2026-04-25');
        }
    },
    {
        name: 'extractTimeString keeps SQL time values on the same clock time',
        run() {
            assert.equal(
                extractTimeString(new Date(Date.UTC(1970, 0, 1, 8, 0, 0))),
                '08:00:00'
            );
        }
    }
];
