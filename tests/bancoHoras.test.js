const assert = require('node:assert/strict');

const {
    calculateAusenciaDebitMinutes,
    calculateDailyWorkMinutes,
    isAusenciaOverlappingPlantao,
    parseBalanceInputToMinutes,
    resolveDefaultDescontaBancoHoras
} = require('../backend/utils/bancoHoras');

const colaboradorBase = {
    TrabalhoInicio: '08:00:00',
    TrabalhoFim: '17:00:00',
    AlmocoInicio: '12:00:00',
    AlmocoFim: '13:00:00'
};

module.exports = [
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
