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
        // Dois turnos do mesmo tipo no mesmo dia nao repetem o nome; tipos
        // diferentes saem cada um na sua folha, na ordem fixa dos tipos.
        name: 'montarFolhasAssinatura: uma folha por tipo, sem nome repetido na mesma data',
        run() {
            const relatorio = montarFolhasAssinatura({
                ...NOVEMBRO,
                ausencias: [
                    { colaboradorId: 2, tipo: 'folga', inicioISO: '2026-11-09', fimISO: '2026-11-09' }
                ],
                plantoes: [
                    { dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [1], horario: '08:00-12:00' },
                    { dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [1], horario: '13:00-17:00' },
                    { dataISO: '2026-11-07', tipoLancamento: 'cobertura_almoco', colaboradores: [1], horario: '12:00-13:00' }
                ]
            });

            assert.deepEqual(relatorio.folhas.map((folha) => folha.tipo), ['plantao_sabado', 'plantao_cobertura_almoco', 'folga']);
            assert.deepEqual(relatorio.folhas[0].datas.map((linha) => linha.nomes), [['Fernando']]);
            assert.equal(relatorio.folhas[0].titulo, 'Escala de Sábados das 8h às 12h e 13h às 17h de Novembro de 2026');
            assert.equal(relatorio.folhas[2].titulo, 'Folgas de Novembro de 2026');
            assert.deepEqual(relatorio.totais, { folhas: 3, lancamentos: 3, colaboradores: 2 });
        }
    },
    {
        // Ferias de varios dias sao uma linha so, com o periodo recortado ao
        // mes; o detalhe vai entre parenteses; o que nao toca o mes fica fora.
        name: 'montarFolhasAssinatura: ausencias com periodo recortado ao mes e detalhe',
        run() {
            const { folhas } = montarFolhasAssinatura({
                ...NOVEMBRO,
                ausencias: [
                    { colaboradorId: 1, tipo: 'ferias', inicioISO: '2026-10-20', fimISO: '2026-11-04' },
                    { colaboradorId: 3, tipo: 'ausencia', inicioISO: '2026-11-10', fimISO: '2026-11-10', detalhe: 'Atestado - Parcial 08:00-12:00' },
                    { colaboradorId: 2, tipo: 'folga', inicioISO: '2026-12-01', fimISO: '2026-12-01' }
                ]
            });

            assert.deepEqual(folhas.map(resumoDe), [
                {
                    titulo: 'Férias de Novembro de 2026',
                    datas: ['01/11/2026 a 04/11/2026 -> Fernando'],
                    assinaturas: ['FERNANDO DA SILVA SANTOS']
                },
                {
                    titulo: 'Ausências de Novembro de 2026',
                    datas: ['10/11/2026 -> Débora (Atestado - Parcial 08:00-12:00)'],
                    assinaturas: ['DÉBORA SOUZA LIMA']
                }
            ]);
        }
    },
    {
        name: 'montarFolhasAssinatura: folga de domingo e a reposicao em folhas proprias',
        run() {
            const { folhas } = montarFolhasAssinatura({
                ...NOVEMBRO,
                folgasDomingo: [
                    { colaboradorId: 4, dataDomingo: '2026-11-08', dataReposicao: '2026-11-21', horarioReposicao: '08:00-12:00' },
                    { colaboradorId: 2, dataDomingo: '2026-11-15' }
                ]
            });

            assert.deepEqual(folhas.map(resumoDe), [
                {
                    titulo: 'Folgas de Domingo de Novembro de 2026',
                    datas: ['08/11/2026 -> Luis (reposição em 21/11/2026)', '15/11/2026 -> Jean (reposição a definir)'],
                    assinaturas: ['JEAN', 'LUÍS HENRIQUE GOMES']
                },
                {
                    titulo: 'Reposições de Folga de Domingo das 8h às 12h de Novembro de 2026',
                    datas: ['21/11/2026 -> Luis (domingo 08/11/2026)'],
                    assinaturas: ['LUÍS HENRIQUE GOMES']
                }
            ]);
        }
    },
    {
        name: 'montarFolhasAssinatura: filtro de tipo, colaborador sem cadastro e mes vazio',
        run() {
            const dados = {
                ...NOVEMBRO,
                ausencias: [{ colaboradorId: 2, tipo: 'folga', inicioISO: '2026-11-09', fimISO: '2026-11-09' }],
                plantoes: [{ dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [99], horario: '08:30-12:00' }]
            };

            const soSabados = montarFolhasAssinatura({ ...dados, tipo: 'plantao_sabado' });
            assert.deepEqual(soSabados.folhas.map(resumoDe), [{
                titulo: 'Escala de Sábados das 8h30 às 12h de Novembro de 2026',
                datas: ['07/11/2026 -> Colaborador #99'],
                assinaturas: ['COLABORADOR #99']
            }]);

            const vazio = montarFolhasAssinatura({ ...NOVEMBRO });
            assert.deepEqual(vazio, { folhas: [], totais: { folhas: 0, lancamentos: 0, colaboradores: 0 } });
        }
    },
    {
        name: 'TIPOS_FOLHA_ASSINATURA lista os tipos na ordem das folhas',
        run() {
            assert.deepEqual(TIPOS_FOLHA_ASSINATURA.map(([chave]) => chave), [
                'plantao_sabado',
                'plantao_domingo',
                'plantao_feriado',
                'plantao_cobertura_almoco',
                'folga',
                'ferias',
                'ausencia',
                'folga_domingo',
                'reposicao_domingo'
            ]);
        }
    }
];
