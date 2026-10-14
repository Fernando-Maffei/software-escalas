const assert = require('node:assert/strict');

const {
    calculateAusenciaDebitMinutes,
    calculateDailyWorkMinutes,
    isAusenciaOverlappingPlantao,
    parseBalanceInputToMinutes,
    resolveDefaultDescontaBancoHoras
} = require('../../backend/services/bancoHoras');

const colaboradorBase = {
    TrabalhoInicio: '08:00:00',
    TrabalhoFim: '17:00:00',
    AlmocoInicio: '12:00:00',
    AlmocoFim: '13:00:00'
};

module.exports = [
    {
        // A13 da auditoria: colunas TIME voltam do banco como Date (1970-01-01);
        // o calculo so aceitava texto e a ausencia por horas no passado dava 400.
        name: 'calculateAusenciaDebitMinutes aceita horarios vindos do banco como Date',
        run() {
            const minutos = calculateAusenciaDebitMinutes(
                {
                    Tipo: 'ausencia',
                    PeriodoTipo: 'horas',
                    DataInicio: '2026-08-31',
                    DataFim: '2026-08-31',
                    HoraInicio: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
                    HoraFim: new Date(Date.UTC(1970, 0, 1, 10, 30, 0)),
                    DescontaBancoHoras: true
                },
                colaboradorBase,
                { referenceDateISO: '2026-09-26' }
            );

            assert.equal(minutos, 150);
        }
    },
    {
        name: 'resolveDefaultDescontaBancoHoras skips ferias and medico',
        run() {
            assert.equal(resolveDefaultDescontaBancoHoras('ferias'), false);
            assert.equal(resolveDefaultDescontaBancoHoras('ausencia', 'medico'), false);
            assert.equal(resolveDefaultDescontaBancoHoras('folga'), true);
        }
    },
    {
        name: 'calculateDailyWorkMinutes discounts lunch break',
        run() {
            assert.equal(calculateDailyWorkMinutes(colaboradorBase), 480);
        }
    },
    {
        name: 'calculateAusenciaDebitMinutes counts only weekdays for day range',
        run() {
            const minutos = calculateAusenciaDebitMinutes({
                Tipo: 'folga',
                DataInicio: '2026-04-24',
                DataFim: '2026-04-27',
                PeriodoTipo: 'dia_inteiro',
                DescontaBancoHoras: true
            }, colaboradorBase);

            assert.equal(minutos, 960);
        }
    },
    {
        name: 'calculateAusenciaDebitMinutes ignores future absences until reference date',
        run() {
            const minutos = calculateAusenciaDebitMinutes({
                Tipo: 'folga',
                DataInicio: '2026-05-10',
                DataFim: '2026-05-12',
                PeriodoTipo: 'dia_inteiro',
                DescontaBancoHoras: true
            }, colaboradorBase, {
                referenceDateISO: '2026-05-09'
            });

            assert.equal(minutos, 0);
        }
    },
    {
        name: 'calculateAusenciaDebitMinutes counts only elapsed days from a multi-day leave',
        run() {
            const minutos = calculateAusenciaDebitMinutes({
                Tipo: 'folga',
                DataInicio: '2026-05-04',
                DataFim: '2026-05-08',
                PeriodoTipo: 'dia_inteiro',
                DescontaBancoHoras: true
            }, colaboradorBase, {
                referenceDateISO: '2026-05-06'
            });

            assert.equal(minutos, 1440);
        }
    },
    {
        name: 'isAusenciaOverlappingPlantao compares hour overlap on the same day',
        run() {
            assert.equal(isAusenciaOverlappingPlantao({
                DataInicio: '2026-04-25',
                DataFim: '2026-04-25',
                PeriodoTipo: 'horas',
                HoraInicio: '08:30:00',
                HoraFim: '10:00:00'
            }, {
                dataISO: '2026-04-25',
                horaInicio: '08:00:00',
                horaFim: '12:00:00'
            }), true);

            assert.equal(isAusenciaOverlappingPlantao({
                DataInicio: '2026-04-25',
                DataFim: '2026-04-25',
                PeriodoTipo: 'horas',
                HoraInicio: '13:00:00',
                HoraFim: '14:00:00'
            }, {
                dataISO: '2026-04-25',
                horaInicio: '08:00:00',
                horaFim: '12:00:00'
            }), false);
        }
    },
    {
        name: 'parseBalanceInputToMinutes parses positive and negative balances',
        run() {
            assert.equal(parseBalanceInputToMinutes('+08:30'), 510);
            assert.equal(parseBalanceInputToMinutes('-01:45'), -105);
            assert.equal(parseBalanceInputToMinutes('02:15'), 135);
        }
    },
    {
        name: 'parseBalanceInputToMinutes rejects invalid minute values',
        run() {
            assert.throws(
                () => parseBalanceInputToMinutes('01:60'),
                /minutos invalidos/i
            );
        }
    }
];
