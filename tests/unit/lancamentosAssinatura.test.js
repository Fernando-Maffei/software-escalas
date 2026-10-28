const assert = require('node:assert/strict');

const {
    dataPorExtenso,
    jornadasHabituais,
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
            assert.deepEqual(relatorio.totais, { folhas: 2, escalas: 4, colaboradores: 4, jornadas: 0 });
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
            assert.deepEqual(vazio, { folhas: [], totais: { folhas: 0, escalas: 0, colaboradores: 0, jornadas: 0 } });
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
    },
    {
        // Novembro de 2026: sabados 7/14/21/28, domingos 1/8/15/22/29, feriados
        // nacionais 02/11 (segunda) e 20/11 (sexta, Consciencia Negra).
        name: 'jornadasHabituais: plantonista com jornada no sabado, domingo e feriado; fora quem nao trabalhou',
        run() {
            const jornadas = jornadasHabituais({
                inicioISO: '2026-11-01',
                fimISO: '2026-11-30',
                feriados: ['2026-11-02', '2026-11-15', '2026-11-20'],
                colaboradores: [
                    // Final de semana: sabado 08-12 e domingo 08-14 na jornada semanal.
                    { Id: 1, IsPlantonista: true, Ativo: true },
                    // Semana sem jornada semanal: ficha 11-22 de segunda a sexta.
                    { Id: 2, IsPlantonista: true, Ativo: true, TrabalhoInicio: '1970-01-01T11:00:00.000Z', TrabalhoFim: '1970-01-01T22:00:00.000Z' },
                    // Nao e plantonista: fica de fora mesmo com jornada no sabado.
                    { Id: 3, IsPlantonista: false, Ativo: true },
                    // Desligado em 15/11: so entra antes disso.
                    { Id: 4, IsPlantonista: true, Ativo: false, DataDesligamento: '2026-11-15' }
                ],
                jornadaSemanal: [
                    { colaboradorId: 1, diaSemana: 6, trabalhoInicio: '08:00:00', trabalhoFim: '12:00:00' },
                    { colaboradorId: 1, diaSemana: 0, trabalhoInicio: '08:00:00', trabalhoFim: '14:00:00' },
                    { colaboradorId: 3, diaSemana: 6, trabalhoInicio: '08:00:00', trabalhoFim: '12:00:00' },
                    { colaboradorId: 4, diaSemana: 6, trabalhoInicio: '08:00:00', trabalhoFim: '12:00:00' }
                ],
                ausencias: [
                    { ColaboradorId: 1, PeriodoTipo: 'dia_inteiro', DataInicio: '2026-11-21T00:00:00.000Z', DataFim: '2026-11-22T00:00:00.000Z' },
                    { ColaboradorId: 1, PeriodoTipo: 'horas', DataInicio: '2026-11-28', DataFim: '2026-11-28' }
                ],
                folgasDomingo: [{ colaboradorId: 1, dataDomingo: '2026-11-08' }]
            });
            const de = (id) => jornadas.filter((item) => item.colaboradores[0] === id).map((item) => `${item.dataISO} ${item.tipoLancamento} ${item.horario}`);

            assert.deepEqual(de(1), [
                '2026-11-01 domingo 08:00-14:00',
                '2026-11-07 sabado 08:00-12:00',
                '2026-11-14 sabado 08:00-12:00',
                '2026-11-15 feriado 08:00-14:00',
                '2026-11-28 sabado 08:00-12:00',
                '2026-11-29 domingo 08:00-14:00'
            ]);
            assert.deepEqual(de(2), ['2026-11-02 feriado 11:00-22:00', '2026-11-20 feriado 11:00-22:00']);
            assert.deepEqual(de(3), []);
            assert.deepEqual(de(4), ['2026-11-07 sabado 08:00-12:00', '2026-11-14 sabado 08:00-12:00']);
        }
    },
    {
        name: 'montarFolhasAssinatura: plantonista em jornada aparece sem assinar; lancado assina; lancamento ganha da jornada',
        run() {
            const relatorio = montarFolhasAssinatura({
                ...NOVEMBRO,
                folha: 'sabados',
                plantoes: [
                    { dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [2], horario: '08:00-12:00' },
                    { dataISO: '2026-11-14', tipoLancamento: 'sabado', colaboradores: [3], horario: '08:00-12:00' }
                ],
                jornadas: [
                    { dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [3], horario: '08:00-12:00' },
                    { dataISO: '2026-11-14', tipoLancamento: 'sabado', colaboradores: [3], horario: '08:00-12:00' }
                ]
            });
            const [sabados] = relatorio.folhas;

            assert.deepEqual(resumoDe(sabados).datas, ['07/11/2026 -> Débora (jornada), Jean', '14/11/2026 -> Débora']);
            // Debora assina pelo dia 14 (lancada); Jean, pelo dia 7.
            assert.deepEqual(sabados.assinaturas, ['DÉBORA SOUZA LIMA', 'JEAN']);
            assert.deepEqual(sabados.emJornada, []);
            assert.equal(relatorio.totais.jornadas, 1);

            const soJornada = montarFolhasAssinatura({
                ...NOVEMBRO,
                jornadas: [{ dataISO: '2026-11-07', tipoLancamento: 'sabado', colaboradores: [3], horario: '08:00-12:00' }]
            }).folhas[0];

            assert.deepEqual(soJornada.assinaturas, []);
            assert.deepEqual(soJornada.emJornada, ['DÉBORA SOUZA LIMA']);
        }
    }
];
