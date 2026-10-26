const assert = require('node:assert/strict');

const {
    dataPorExtenso,
    montarFolhasAssinatura,
    periodoDoMes,
    TIPOS_FOLHA_ASSINATURA
} = require('../../frontend/js/lib/lancamentos-assinatura');

const NOMES = {
    1: { apelido: 'Fernando', nomeCompleto: 'Fernando da Silva Santos' },
    2: { apelido: 'Jean', nomeCompleto: '' },
    3: { apelido: 'Débora', nomeCompleto: 'Débora Souza Lima' },
    4: { apelido: 'Luis', nomeCompleto: 'Luís Henrique Gomes' }
};
const NOVEMBRO = {
    inicioISO: '2026-11-01',
    fimISO: '2026-11-30',
    rotuloMes: 'Novembro de 2026',
    nomeDe: (id) => NOMES[id]
};

const resumoDe = (folha) => ({
    titulo: folha.titulo,
    datas: folha.datas.map((linha) => `${linha.data} -> ${linha.nomes.join(', ')}`),
    assinaturas: folha.assinaturas
});

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
        name: 'dataPorExtenso escreve a data do fecho da folha',
        run() {
            assert.equal(dataPorExtenso(new Date(2026, 9, 26)), '26 de Outubro de 2026');
            assert.equal(dataPorExtenso(new Date(2027, 0, 5)), '5 de Janeiro de 2027');
        }
    },
    {
        // O formato da folha feita a mao: horarios dos turnos no titulo, uma
        // linha por data com os apelidos, nomes completos em maiusculas para
        // assinar (o Nome entra quando o nome completo esta vazio).
        name: 'montarFolhasAssinatura: folha de sabados no formato da folha impressa',
        run() {
            const { folhas } = montarFolhasAssinatura({
                ...NOVEMBRO,
                plantoes: [
                    { dataISO: '2026-11-14', tipoLancamento: 'sabado', colaboradores: [2], horario: '09:00-13:00' },
                    { dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [4, 1], horario: '08:00-12:00' },
                    { dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [3], horario: '09:00-13:00' }
                ]
            });

            assert.equal(folhas.length, 1);
            assert.deepEqual(resumoDe(folhas[0]), {
                titulo: 'Escala de Sábados das 8h às 12h e 9h às 13h de Novembro de 2026',
                datas: ['07/11/2026 -> Fernando, Luis, Débora', '14/11/2026 -> Jean'],
                assinaturas: ['DÉBORA SOUZA LIMA', 'FERNANDO DA SILVA SANTOS', 'JEAN', 'LUÍS HENRIQUE GOMES']
            });
        }
    },
    {
        // Domingo e feriado dividem uma folha so, em ordem de data; cobertura
        // de almoco nao e plantao de fim de semana e fica fora.
        name: 'montarFolhasAssinatura: domingos e feriados juntos numa folha, cobertura de almoco fora',
        run() {
            const relatorio = montarFolhasAssinatura({
                ...NOVEMBRO,
                plantoes: [
                    { dataISO: '2026-11-20', tipoLancamento: 'feriado', colaboradores: [3], horario: '08:00-12:00' },
                    { dataISO: '2026-11-08', tipoLancamento: 'domingo', colaboradores: [1, 4], horario: '08:00-12:00' },
                    { dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [2], horario: '08:00-12:00' },
                    { dataISO: '2026-11-09', tipoLancamento: 'cobertura_almoco', colaboradores: [2], horario: '12:00-13:00' }
                ]
            });

            assert.deepEqual(relatorio.folhas.map((folha) => folha.folha), ['sabados', 'domingos_feriados']);
            assert.deepEqual(resumoDe(relatorio.folhas[1]), {
                titulo: 'Escala de Domingos e Feriados das 8h às 12h de Novembro de 2026',
                datas: ['08/11/2026 -> Fernando, Luis', '20/11/2026 -> Débora'],
                assinaturas: ['DÉBORA SOUZA LIMA', 'FERNANDO DA SILVA SANTOS', 'LUÍS HENRIQUE GOMES']
            });
            assert.deepEqual(relatorio.totais, { folhas: 2, escalas: 4, colaboradores: 4 });
        }
    },
    {
        // Dois turnos no mesmo dia nao repetem o nome; plantao fora do mes
        // nao entra.
        name: 'montarFolhasAssinatura: sem nome repetido na mesma data e so o mes pedido',
        run() {
            const { folhas } = montarFolhasAssinatura({
                ...NOVEMBRO,
                plantoes: [
                    { dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [1], horario: '08:00-12:00' },
                    { dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [1], horario: '13:00-17:00' },
                    { dataISO: '2026-10-31', tipoLancamento: 'sabado', colaboradores: [2], horario: '08:00-12:00' },
                    { dataISO: '2026-12-05', tipoLancamento: 'sabado', colaboradores: [3], horario: '08:00-12:00' }
                ]
            });

            assert.deepEqual(resumoDe(folhas[0]), {
                titulo: 'Escala de Sábados das 8h às 12h e 13h às 17h de Novembro de 2026',
                datas: ['07/11/2026 -> Fernando'],
                assinaturas: ['FERNANDO DA SILVA SANTOS']
            });
        }
    },
    {
        name: 'montarFolhasAssinatura: filtro de folha, colaborador sem cadastro e mes vazio',
        run() {
            const dados = {
                ...NOVEMBRO,
                plantoes: [
                    { dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [99], horario: '08:30-12:00' },
                    { dataISO: '2026-11-08', tipoLancamento: 'domingo', colaboradores: [2], horario: '08:00-12:00' }
                ]
            };

            const soSabados = montarFolhasAssinatura({ ...dados, folha: 'sabados' });
            assert.deepEqual(soSabados.folhas.map(resumoDe), [{
                titulo: 'Escala de Sábados das 8h30 às 12h de Novembro de 2026',
                datas: ['07/11/2026 -> Colaborador #99'],
                assinaturas: ['COLABORADOR #99']
            }]);

            const vazio = montarFolhasAssinatura({ ...NOVEMBRO });
            assert.deepEqual(vazio, { folhas: [], totais: { folhas: 0, escalas: 0, colaboradores: 0 } });
        }
    },
    {
        name: 'TIPOS_FOLHA_ASSINATURA lista as duas folhas na ordem',
        run() {
            assert.deepEqual(TIPOS_FOLHA_ASSINATURA.map((item) => [...item]), [
                ['sabados', 'Sábados'],
                ['domingos_feriados', 'Domingos e feriados']
            ]);
        }
    }
];
