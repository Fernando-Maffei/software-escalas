const assert = require('node:assert/strict');

const {
    buildColaboradorDefaultSyncRecord,
    canAutoRefreshDefaultEscala,
    createAusenciaEscalaRecord,
    createPlantaoEscalaRecord,
    iterateIsoDates
} = require('../backend/utils/escala');
const {
    buildEscalaQuadroCalendarSlots,
    buildEscalaQuadroMensal
} = require('../frontend/Js/escala-report-utils');

module.exports = [
    {
        name: 'iterateIsoDates includes both ends of the selected period',
        run() {
            assert.deepEqual(
                iterateIsoDates('2026-04-29', '2026-05-02'),
                ['2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02']
            );
        }
    },
    {
        name: 'createAusenciaEscalaRecord clears work hours for full-day leave',
        run() {
            const colaborador = {
                Id: 1,
                Nome: 'Joao',
                TrabalhoInicio: '08:00:00',
                TrabalhoFim: '18:00:00',
                AlmocoInicio: '12:00:00',
                AlmocoFim: '13:00:00'
            };
            const ausencia = {
                Id: 99,
                Tipo: 'folga',
                PeriodoTipo: 'dia_inteiro'
            };
            const record = createAusenciaEscalaRecord(colaborador, ausencia, '2026-04-25');

            assert.equal(record.tipo, 'folga');
            assert.equal(record.horaInicio, null);
            assert.equal(record.horaFim, null);
            assert.equal(record.almocoInicio, null);
            assert.equal(record.almocoFim, null);
            assert.equal(record.origemTipo, 'ausencia');
            assert.equal(record.origemId, 99);
        }
    },
    {
        name: 'createPlantaoEscalaRecord preserves shift hours and source metadata',
        run() {
            const colaborador = {
                Id: 7,
                Nome: 'Maria'
            };
            const plantao = {
                id: 15,
                dataISO: '2026-04-25',
                horaInicio: '08:00:00',
                horaFim: '18:00:00',
                observacao: 'Cobertura de sabado'
            };
            const record = createPlantaoEscalaRecord(colaborador, plantao);

            assert.equal(record.tipo, 'plantao');
            assert.equal(record.horaInicio, '08:00:00');
            assert.equal(record.horaFim, '18:00:00');
            assert.equal(record.dataISO, '2026-04-25');
            assert.equal(record.origemTipo, 'plantao');
            assert.equal(record.origemId, 15);
        }
    },
    {
        name: 'canAutoRefreshDefaultEscala allows only automatic base rows to refresh from cadastro',
        run() {
            assert.equal(canAutoRefreshDefaultEscala({
                ajusteManual: false,
                origemTipo: null,
                origemId: null
            }), true);

            assert.equal(canAutoRefreshDefaultEscala({
                ajusteManual: true,
                origemTipo: null,
                origemId: null
            }), false);

            assert.equal(canAutoRefreshDefaultEscala({
                ajusteManual: false,
                origemTipo: 'plantao',
                origemId: 10
            }), false);
        }
    },
    {
        name: 'buildColaboradorDefaultSyncRecord reapplies cadastro hours and keeps escala metadata',
        run() {
            const record = buildColaboradorDefaultSyncRecord({
                Id: 4,
                Nome: 'Paula',
                TrabalhoInicio: '08:00:00',
                TrabalhoFim: '17:00:00',
                AlmocoInicio: '12:00:00',
                AlmocoFim: '13:00:00'
            }, {
                dataISO: '2026-05-05',
                tipo: 'ajuste',
                observacao: 'Escala base'
            });

            assert.equal(record.dataISO, '2026-05-05');
            assert.equal(record.colaboradorId, 4);
            assert.equal(record.colaboradorNome, 'Paula');
            assert.equal(record.horaInicio, '08:00:00');
            assert.equal(record.horaFim, '17:00:00');
            assert.equal(record.almocoInicio, '12:00:00');
            assert.equal(record.almocoFim, '13:00:00');
            assert.equal(record.tipo, 'ajuste');
            assert.equal(record.observacao, 'Escala base');
        }
    },
    {
        name: 'buildEscalaQuadroMensal hides Sundays and keeps empty Saturdays visible',
        run() {
            const days = buildEscalaQuadroMensal([], {
                year: 2026,
                month: 5
            });

            assert.ok(days.length > 0);
            assert.ok(days.every((day) => day.dayLabel !== 'Domingo'));

            const saturday = days.find((day) => day.dataISO === '2026-05-02');
            assert.ok(saturday);
            assert.equal(saturday.hasScale, false);
            assert.deepEqual(saturday.rows, []);
        }
    },
    {
        name: 'buildEscalaQuadroMensal groups consecutive lunch and jornada cells with rowspan',
        run() {
            const days = buildEscalaQuadroMensal([
                {
                    dataISO: '2026-05-04',
                    colaboradorNome: 'Ana',
                    tipo: 'normal',
                    horaInicio: '07:00',
                    horaFim: '16:00',
                    almocoInicio: '12:00',
                    almocoFim: '13:00'
                },
                {
                    dataISO: '2026-05-04',
                    colaboradorNome: 'Bruno',
                    tipo: 'normal',
                    horaInicio: '07:00',
                    horaFim: '16:00',
                    almocoInicio: '12:00',
                    almocoFim: '13:00'
                },
                {
                    dataISO: '2026-05-04',
                    colaboradorNome: 'Carla',
                    tipo: 'normal',
                    horaInicio: '08:00',
                    horaFim: '17:00',
                    almocoInicio: '12:00',
                    almocoFim: '13:00'
                },
                {
                    dataISO: '2026-05-04',
                    colaboradorNome: 'Diego',
                    tipo: 'normal',
                    horaInicio: '08:00',
                    horaFim: '17:00',
                    almocoInicio: '13:00',
                    almocoFim: '14:00'
                }
            ], {
                year: 2026,
                month: 5
            });

            const day = days.find((item) => item.dataISO === '2026-05-04');

            assert.ok(day);
            assert.equal(day.rows.length, 4);
            assert.equal(day.rows[0].showAlmoco, true);
            assert.equal(day.rows[0].almocoRowspan, 3);
            assert.equal(day.rows[0].showJornada, true);
            assert.equal(day.rows[0].jornadaRowspan, 2);
            assert.equal(day.rows[1].showAlmoco, false);
            assert.equal(day.rows[1].showJornada, false);
            assert.equal(day.rows[2].showAlmoco, false);
            assert.equal(day.rows[2].showJornada, true);
            assert.equal(day.rows[2].jornadaRowspan, 2);
            assert.equal(day.rows[3].showAlmoco, true);
            assert.equal(day.rows[3].almocoRowspan, 1);
            assert.equal(day.rows[3].showJornada, false);
        }
    },
    {
        name: 'buildEscalaQuadroMensal excludes full-day leave and keeps partial absences with schedule',
        run() {
            const days = buildEscalaQuadroMensal([
                {
                    dataISO: '2026-02-02',
                    colaboradorNome: 'Folga integral',
                    tipo: 'folga',
                    horaInicio: null,
                    horaFim: null,
                    almocoInicio: null,
                    almocoFim: null
                },
                {
                    dataISO: '2026-02-02',
                    colaboradorNome: 'Ausencia parcial',
                    tipo: 'ausencia',
                    horaInicio: '09:00',
                    horaFim: '18:00',
                    almocoInicio: '13:00',
                    almocoFim: '14:00'
                }
            ], {
                year: 2026,
                month: 2
            });

            const day = days.find((item) => item.dataISO === '2026-02-02');

            assert.ok(day);
            assert.equal(day.rows.length, 1);
            assert.equal(day.rows[0].colaboradorNome, 'Ausencia parcial');
        }
    },
    {
        name: 'buildEscalaQuadroCalendarSlots aligns month days in monday-to-saturday calendar weeks',
        run() {
            const days = buildEscalaQuadroMensal([], {
                year: 2026,
                month: 5
            });
            const slots = buildEscalaQuadroCalendarSlots(days);

            assert.equal(slots.length, 30);
            assert.equal(slots[0], null);
            assert.equal(slots[1], null);
            assert.equal(slots[2], null);
            assert.equal(slots[3], null);
            assert.equal(slots[4]?.dataISO, '2026-05-01');
            assert.equal(slots[5]?.dataISO, '2026-05-02');
            assert.equal(slots[6]?.dataISO, '2026-05-04');
            assert.equal(slots[7]?.dataISO, '2026-05-05');
        }
    }
];
