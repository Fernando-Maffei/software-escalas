const assert = require('node:assert/strict');

const { montarRodizioDomingos } = require('../../frontend/js/lib/rodizio-domingos');

const turno = (dataISO, tipoPlantao, colaboradores, extras = {}) => ({
    dataISO,
    tipoPlantao,
    tipoLancamento: tipoPlantao,
    horaInicio: '08:00:00',
    horaFim: '13:00:00',
    tipoCredito: 'banco',
    colaboradores,
    ...extras
});

const COLABORADORES = [
    { Id: 1, Nome: 'Mike', Ativo: true, IsPlantonista: true },
    { Id: 2, Nome: 'Jean', Ativo: true, IsPlantonista: false },
    { Id: 3, Nome: 'Paulo', Ativo: true, IsPlantonista: true },
    { Id: 4, Nome: 'Queluy', Ativo: false, IsPlantonista: true }
];

module.exports = [
    {
        // A planilha: domingo sem observacao, feriado como "Feriado" e a
        // cobertura de almoco como linha propria; sabado nao entra.
        name: 'montarRodizioDomingos lista domingos e feriados com o tipo de cada dia',
        run() {
            const relatorio = montarRodizioDomingos([
                turno('2026-09-07', 'feriado', [1]),
                turno('2026-09-27', 'domingo', [1]),
                turno('2026-10-04', 'domingo', [2], { tipoLancamento: 'cobertura_almoco', horaInicio: '12:00:00' }),
                turno('2026-10-03', 'sabado', [1])
            ], COLABORADORES);

            assert.deepEqual(
                relatorio.dias.map((dia) => [dia.dataISO, dia.nome, dia.diaSemana, dia.rotulo]),
                [
                    ['2026-09-07', 'Mike', 'Segunda-feira', 'Feriado'],
                    ['2026-09-27', 'Mike', 'Domingo', 'Domingo'],
                    ['2026-10-04', 'Jean', 'Domingo', 'Cobertura de almoco']
                ]
            );
            assert.equal(relatorio.dias[2].minutos, 60);
            assert.deepEqual(relatorio.totais, { dias: 3, registros: 3, plantao: 2, cobertura: 1 });
        }
    },
    {
        // O contador e o "Gerenciador" da planilha: total, plantao, cobertura e
        // o ultimo dia; quem esta ha mais tempo sem trabalhar vem primeiro e
        // plantonista ativo sem nenhum dia entra com zero no topo.
        name: 'montarRodizioDomingos conta por pessoa e ordena pelo rodizio',
        run() {
            const relatorio = montarRodizioDomingos([
                turno('2026-09-27', 'domingo', [1]),
                turno('2026-10-12', 'feriado', [1]),
                turno('2026-10-11', 'domingo', [2], { tipoLancamento: 'cobertura_almoco' }),
                turno('2026-11-08', 'domingo', [2], { tipoLancamento: 'cobertura_almoco' })
            ], COLABORADORES);

            assert.deepEqual(
                relatorio.pessoas.map((item) => [item.nome, item.total, item.plantao, item.cobertura, item.ultimo?.dataISO ?? null]),
                [
                    ['Paulo', 0, 0, 0, null],
                    ['Mike', 2, 2, 0, '2026-10-12'],
                    ['Jean', 2, 0, 2, '2026-11-08']
                ]
            );
            assert.equal(relatorio.pessoas[1].ultimo.rotulo, 'Feriado');
        }
    },
    {
        // Duas linhas da mesma pessoa no mesmo dia contam um dia so; com
        // plantao e cobertura juntos, o dia e de plantao.
        name: 'montarRodizioDomingos conta a pessoa uma vez por dia',
        run() {
            const relatorio = montarRodizioDomingos([
                turno('2026-11-01', 'domingo', [1], { tipoLancamento: 'cobertura_almoco', horaInicio: '12:00:00' }),
                turno('2026-11-01', 'domingo', [1], { horaInicio: '14:00:00', horaFim: '18:00:00' })
            ], COLABORADORES);

            assert.equal(relatorio.dias.length, 1);
            assert.equal(relatorio.dias[0].rotulo, 'Domingo');
            assert.equal(relatorio.dias[0].minutos, 60 + 240);
            assert.equal(relatorio.pessoas.find((item) => item.nome === 'Mike').total, 1);
        }
    },
    {
        name: 'montarRodizioDomingos respeita periodo e colaborador',
        run() {
            const plantoes = [
                turno('2026-09-27', 'domingo', [1, 2]),
                turno('2026-10-25', 'domingo', [1]),
                turno('2026-11-29', 'domingo', [2])
            ];
            const periodo = montarRodizioDomingos(plantoes, COLABORADORES, { inicioISO: '2026-10-01', fimISO: '2026-10-31' });
            const soJean = montarRodizioDomingos(plantoes, COLABORADORES, { colaboradorId: '2' });

            assert.deepEqual(periodo.dias.map((dia) => dia.dataISO), ['2026-10-25']);
            assert.deepEqual(soJean.dias.map((dia) => dia.dataISO), ['2026-09-27', '2026-11-29']);
            assert.deepEqual(soJean.pessoas.map((item) => item.nome), ['Jean']);
        }
    }
];
