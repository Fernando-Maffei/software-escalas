const assert = require('node:assert/strict');

const {
    calcularCreditoPlantaoNaJanela,
    calcularDescontoNaJanela,
    calcularSaldo,
    fimDaJanelaSemanal,
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
            assert.deepEqual(calcularDescontoNaJanela(ausencia, colaborador, '2026-09-06', '2026-09-10'), {
                minutos: 1440,
                aviso: null,
                item: { dataInicio: '2026-09-06', dataFim: '2026-09-08', descricao: 'Folga - 3 dias x 8:00', minutos: 1440, formatado: '24:00' }
            });
        }
    },
    {
        name: 'calcularDescontoNaJanela descreve ausencia parcial com subtipo e horario',
        run() {
            const ausencia = { Id: 3, Tipo: 'ausencia', Subtipo: 'medico', PeriodoTipo: 'horas', DataInicio: '2026-09-09', DataFim: '2026-09-09', HoraInicio: '08:00:00', HoraFim: '10:30:00', DescontaBancoHoras: true };

            assert.deepEqual(calcularDescontoNaJanela(ausencia, colaborador, '2026-09-07', '2026-09-13').item, {
                dataInicio: '2026-09-09', dataFim: '2026-09-09', descricao: 'Ausencia (Atestado) 08:00-10:30', minutos: 150, formatado: '2:30'
            });
        }
    },
    {
        name: 'a semana gerada vai de segunda a domingo: folga na segunda alvo fica para a semana seguinte',
        run() {
            // Gerar a semana de 26/10 a partir da linha de 19/10: soma 19/10 a 25/10.
            assert.equal(fimDaJanelaSemanal('2026-10-26'), '2026-10-25');

            const folgaSegunda = { Id: 9, ColaboradorId: 1, Tipo: 'folga', PeriodoTipo: 'dia_inteiro', DataInicio: '2026-10-26', DataFim: '2026-10-26', DescontaBancoHoras: true };
            const folgaSemana = { ...folgaSegunda, Id: 10, DataInicio: '2026-10-19', DataFim: '2026-10-19' };
            const movimentacao = {
                ausenciasPorColaborador: new Map([[1, [folgaSegunda, folgaSemana]]]),
                plantoes: [{ id: 7, dataISO: '2026-10-25', colaboradores: [1], tipoCredito: 'banco', horaInicio: '08:00:00', horaFim: '12:00:00' }]
            };

            const semana26 = calcularSaldo(colaborador, { semanaSegunda: '2026-10-19', minutos: 600 }, movimentacao, fimDaJanelaSemanal('2026-10-26'), []);
            assert.equal(semana26.descontoMinutos, 480); // so a folga de 19/10
            assert.equal(semana26.plantaoMinutos, 240); // domingo 25/10 ainda conta
            assert.equal(semana26.resultadoMinutos, 600 + 240 - 480);
            assert.deepEqual(semana26.detalhes.descontos.map((item) => item.dataInicio), ['2026-10-19']);
            assert.deepEqual(semana26.detalhes.creditos.map((item) => item.dataInicio), ['2026-10-25']);
            assert.equal(semana26.detalhes.janelaFim, '2026-10-25');

            // A folga de 26/10 entra na semana de 02/11.
            const semana02 = calcularSaldo(colaborador, { semanaSegunda: '2026-10-26', minutos: 0 }, movimentacao, fimDaJanelaSemanal('2026-11-02'), []);
            assert.equal(semana02.descontoMinutos, 480);
            assert.deepEqual(semana02.detalhes.descontos.map((item) => item.dataInicio), ['2026-10-26']);
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
