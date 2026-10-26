const assert = require('node:assert/strict');

const { montarLancamentosAssinatura, periodoDoMes } = require('../../frontend/js/lib/lancamentos-assinatura');

const NOMES = { 1: 'Fernando da Silva Santos', 2: 'Jean', 3: 'Debora Souza' };
const NOVEMBRO = { inicioISO: '2026-11-01', fimISO: '2026-11-30', nomeDe: (id) => NOMES[id] || `#${id}` };

const linhasDe = (relatorio) => relatorio.linhas.map((linha) => [linha.data, linha.nome, linha.rotulo, linha.detalhe]);

module.exports = [
    {
        name: 'periodoDoMes devolve o primeiro e o ultimo dia do mes (fevereiro bissexto)',
        run() {
            assert.deepEqual(periodoDoMes(10, 2026), { inicioISO: '2026-11-01', fimISO: '2026-11-30', rotulo: 'Novembro de 2026' });
            assert.equal(periodoDoMes(1, 2028).fimISO, '2028-02-29');
            assert.equal(periodoDoMes(11, 2026).fimISO, '2026-12-31');
        }
    },
    {
        // Ferias de varios dias sao uma assinatura so, com o periodo recortado
        // ao mes; o que nao toca o mes fica de fora.
        name: 'montarLancamentosAssinatura: uma linha por ausencia, periodo recortado ao mes',
        run() {
            const relatorio = montarLancamentosAssinatura({
                ...NOVEMBRO,
                ausencias: [
                    { colaboradorId: 1, tipo: 'ferias', inicioISO: '2026-10-20', fimISO: '2026-11-04' },
                    { colaboradorId: 2, tipo: 'folga', inicioISO: '2026-11-10', fimISO: '2026-11-10' },
                    { colaboradorId: 3, tipo: 'ausencia', inicioISO: '2026-11-10', fimISO: '2026-11-10', detalhe: 'Atestado - Parcial 08:00-12:00' },
                    { colaboradorId: 2, tipo: 'folga', inicioISO: '2026-12-01', fimISO: '2026-12-01' }
                ]
            });

            assert.deepEqual(linhasDe(relatorio), [
                ['01/11/2026 a 04/11/2026', 'Fernando da Silva Santos', 'Férias', ''],
                ['10/11/2026', 'Debora Souza', 'Ausência', 'Atestado - Parcial 08:00-12:00'],
                ['10/11/2026', 'Jean', 'Folga', '']
            ]);
            assert.deepEqual(relatorio.totais, { lancamentos: 3, colaboradores: 3 });
        }
    },
    {
        // Equipe do plantao: uma linha por pessoa. Dois turnos do mesmo tipo no
        // mesmo dia sao uma assinatura com os dois horarios; turno repetido nao
        // duplica; cobertura de almoco no mesmo dia e outra linha.
        name: 'montarLancamentosAssinatura: plantao por colaborador, sem duplicar turnos do mesmo tipo',
        run() {
            const relatorio = montarLancamentosAssinatura({
                ...NOVEMBRO,
                plantoes: [
                    { dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [1, 2], horario: '08:00-12:00' },
                    { dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [2], horario: '09:00-13:00' },
                    { dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [1], horario: '08:00-12:00' },
                    { dataISO: '2026-11-15', tipoLancamento: 'feriado', colaboradores: [3], horario: '08:00-14:00' },
                    { dataISO: '2026-11-15', tipoLancamento: 'cobertura_almoco', colaboradores: [3], horario: '12:00-13:00' },
                    { dataISO: '2026-11-22', tipoLancamento: 'domingo', colaboradores: [], horario: '08:00-12:00' }
                ]
            });

            assert.deepEqual(linhasDe(relatorio), [
                ['07/11/2026', 'Fernando da Silva Santos', 'Plantão de sábado', '08:00-12:00'],
                ['07/11/2026', 'Jean', 'Plantão de sábado', '08:00-12:00, 09:00-13:00'],
                ['15/11/2026', 'Debora Souza', 'Plantão de feriado', '08:00-14:00'],
                ['15/11/2026', 'Debora Souza', 'Cobertura de almoço', '12:00-13:00']
            ]);
        }
    },
    {
        // Folga e plantao do mesmo colaborador no mesmo dia aparecem os dois;
        // a folga de domingo traz a reposicao, que tambem vira linha no dia
        // em que acontece (se cair no mes).
        name: 'montarLancamentosAssinatura: tipos diferentes no mesmo dia e folga de domingo com reposicao',
        run() {
            const relatorio = montarLancamentosAssinatura({
                ...NOVEMBRO,
                ausencias: [{ colaboradorId: 2, tipo: 'folga', inicioISO: '2026-11-08', fimISO: '2026-11-08' }],
                plantoes: [{ dataISO: '2026-11-08', tipoLancamento: 'domingo', colaboradores: [2], horario: '08:00-12:00' }],
                folgasDomingo: [
                    { colaboradorId: 1, dataDomingo: '2026-11-08', dataReposicao: '2026-11-12', horarioReposicao: '11:00-22:00' },
                    { colaboradorId: 3, dataDomingo: '2026-11-29', dataReposicao: null },
                    { colaboradorId: 3, dataDomingo: '2026-10-25', dataReposicao: '2026-11-03', horarioReposicao: '' }
                ]
            });

            assert.deepEqual(linhasDe(relatorio), [
                ['03/11/2026', 'Debora Souza', 'Reposição de folga de domingo', 'Domingo 25/10/2026'],
                ['08/11/2026', 'Fernando da Silva Santos', 'Folga de domingo', 'Reposição em 12/11/2026'],
                ['08/11/2026', 'Jean', 'Folga', ''],
                ['08/11/2026', 'Jean', 'Plantão de domingo', '08:00-12:00'],
                ['12/11/2026', 'Fernando da Silva Santos', 'Reposição de folga de domingo', 'Domingo 08/11/2026, 11:00-22:00'],
                ['29/11/2026', 'Debora Souza', 'Folga de domingo', 'Reposição a definir']
            ]);
        }
    },
    {
        name: 'montarLancamentosAssinatura: mes sem lancamento devolve lista vazia',
        run() {
            const relatorio = montarLancamentosAssinatura({ ...NOVEMBRO, ausencias: [], plantoes: [], folgasDomingo: [] });

            assert.deepEqual(relatorio.linhas, []);
            assert.deepEqual(relatorio.totais, { lancamentos: 0, colaboradores: 0 });
        }
    }
];
