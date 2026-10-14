const assert = require('node:assert/strict');

const {
    calcularCreditoPlantaoNaJanela,
    calcularDescontoNaJanela,
    minutosParaRelogio
} = require('../../backend/services/horas-em-carteira');

const colaborador = { Id: 1, Nome: 'Ana', TrabalhoInicio: '08:00:00', TrabalhoFim: '17:00:00', AlmocoInicio: '12:00:00', AlmocoFim: '13:00:00' };

module.exports = [
    {
        name: 'minutosParaRelogio mostra sinal so no negativo e aceita totais grandes',
        run() {
            assert.equal(minutosParaRelogio(0), '0:00');
            assert.equal(minutosParaRelogio(-75), '-1:15');
            assert.equal(minutosParaRelogio(9817), '163:37');
        }
    },
    {
        name: 'calcularDescontoNaJanela conta so os dias dentro da janela, inclusive fim de semana',
        run() {
            const ausencia = { Id: 1, Tipo: 'folga', PeriodoTipo: 'dia_inteiro', DataInicio: '2026-09-04', DataFim: '2026-09-08', DescontaBancoHoras: true };

            // Janela 06 a 10: pega 06, 07 e 08 (sabado e domingo contam) = 3 x 8h.
            assert.deepEqual(calcularDescontoNaJanela(ausencia, colaborador, '2026-09-06', '2026-09-10'), { minutos: 1440, aviso: null });
        }
    },
    {
        name: 'calcularDescontoNaJanela ignora ferias e ausencia sem desconto',
        run() {
            const base = { Id: 2, PeriodoTipo: 'dia_inteiro', DataInicio: '2026-09-07', DataFim: '2026-09-07' };

            assert.equal(calcularDescontoNaJanela({ ...base, Tipo: 'ferias' }, colaborador, '2026-09-01', '2026-09-30').minutos, 0);
            assert.equal(calcularDescontoNaJanela({ ...base, Tipo: 'ausencia', DescontaBancoHoras: false }, colaborador, '2026-09-01', '2026-09-30').minutos, 0);
        }
    },
    {
        name: 'calcularCreditoPlantaoNaJanela soma banco, ignora hora extra e avisa plantao sem horario',
        run() {
            const plantoes = [
                { id: 1, dataISO: '2026-09-05', colaboradores: [1], tipoCredito: 'banco', horaInicio: '08:00:00', horaFim: '12:00:00' },
                { id: 2, dataISO: '2026-09-06', colaboradores: [1], tipoCredito: 'extra', horaInicio: '08:00:00', horaFim: '12:00:00' },
                { id: 3, dataISO: '2026-09-12', colaboradores: [1], tipoCredito: 'banco', horaInicio: null, horaFim: null },
                { id: 4, dataISO: '2026-09-05', colaboradores: [2], tipoCredito: 'banco', horaInicio: '08:00:00', horaFim: '12:00:00' },
                { id: 5, dataISO: '2026-10-03', colaboradores: [1], tipoCredito: 'banco', horaInicio: '08:00:00', horaFim: '12:00:00' }
            ];

            const credito = calcularCreditoPlantaoNaJanela(plantoes, 1, '2026-09-01', '2026-09-30');
            assert.equal(credito.minutos, 240);
            assert.deepEqual(credito.avisos, ['Plantao 3: sem horario, credito ignorado.']);
        }
    }
];
