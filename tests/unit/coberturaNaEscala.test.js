const assert = require('node:assert/strict');

const { anexarCoberturasNaEscala } = require('../../backend/services/cobertura-na-escala');
const { descreverTrecho, trechoComoLancamento } = require('../../backend/services/cobertura-dia-util');
const { calcularCreditoPlantaoNaJanela } = require('../../backend/services/horas-em-carteira');
const { montarRelatorioHorasExtras } = require('../../backend/services/plantoes');

function trecho(extra = {}) {
    return {
        id: 7,
        coberturaId: 3,
        dataISO: '2027-01-04',
        horaInicio: '19:00:00',
        horaFim: '22:00:00',
        minutos: 180,
        substitutoId: 20,
        tipoCredito: 'extra',
        titularId: 10,
        titularNome: 'Ana',
        observacao: null,
        ...extra
    };
}

const bruno = { Id: 20, Nome: 'Bruno', SetorId: 1, SetorNome: 'Loja' };
const carla = { Id: 30, Nome: 'Carla', SetorId: 2, SetorNome: 'Deposito' };
const colaboradores = new Map([[20, bruno], [30, carla]]);

const linhaBruno = {
    id: 99,
    colaboradorId: 20,
    colaboradorNome: 'Bruno',
    dataISO: '2027-01-04',
    horaInicio: '08:00:00',
    horaFim: '17:00:00',
    tipo: 'normal'
};

module.exports = [
    {
        // O segundo turno: Bruno faz 08h-17h e cobre a Ana 19h-22h.
        name: 'substituto com linha no dia recebe o trecho como segundo turno',
        run() {
            const [linha, ...resto] = anexarCoberturasNaEscala([linhaBruno], [trecho()], { colaboradores });

            assert.equal(resto.length, 0);
            assert.equal(linha.horaInicio, '08:00:00');
            assert.deepEqual(linha.coberturas, [{
                trechoId: 7,
                coberturaId: 3,
                titularId: 10,
                titularNome: 'Ana',
                horaInicio: '19:00:00',
                horaFim: '22:00:00',
                minutos: 180,
                tipoCredito: 'extra'
            }]);
        }
    },
    {
        name: 'substituto sem linha no dia ganha linha de cobertura com o primeiro trecho',
        run() {
            const trechos = [
                trecho({ id: 8, substitutoId: 30, horaInicio: '11:00:00', horaFim: '16:00:00', minutos: 300 }),
                trecho({ id: 9, substitutoId: 30, horaInicio: '19:00:00', horaFim: '22:00:00' })
            ];
            const itens = anexarCoberturasNaEscala([linhaBruno], trechos, { colaboradores });
            const linhaCarla = itens.find((item) => item.colaboradorId === 30);

            assert.equal(itens.length, 2);
            assert.equal(linhaCarla.id, null);
            assert.equal(linhaCarla.tipo, 'cobertura');
            assert.equal(linhaCarla.origemTipo, 'cobertura');
            assert.equal(linhaCarla.origemId, 8);
            assert.equal(linhaCarla.horaInicio, '11:00:00');
            assert.equal(linhaCarla.observacao, 'Cobrindo Ana');
            assert.equal(linhaCarla.setorNome, 'Deposito');
            assert.deepEqual(linhaCarla.coberturas.map((item) => item.trechoId), [9]);
            assert.deepEqual(itens.find((item) => item.colaboradorId === 20).coberturas, []);
        }
    },
    {
        name: 'linha criada respeita o filtro de setor e de colaborador e ignora quem nao esta ativo',
        run() {
            const deCarla = [trecho({ substitutoId: 30 })];

            assert.equal(anexarCoberturasNaEscala([], deCarla, { colaboradores, setorId: 1 }).length, 0);
            assert.equal(anexarCoberturasNaEscala([], deCarla, { colaboradores, colaboradorId: 20 }).length, 0);
            assert.equal(anexarCoberturasNaEscala([], deCarla, { colaboradores, setorId: 2 }).length, 1);
            assert.equal(anexarCoberturasNaEscala([], [trecho({ substitutoId: 40 })], { colaboradores }).length, 0);
        }
    },
    {
        name: 'linhas novas entram na ordem de data e nome',
        run() {
            const itens = anexarCoberturasNaEscala(
                [linhaBruno, { ...linhaBruno, id: 100, dataISO: '2027-01-05' }],
                [trecho({ substitutoId: 30 })],
                { colaboradores }
            );

            assert.deepEqual(itens.map((item) => `${item.dataISO} ${item.colaboradorNome}`), [
                '2027-01-04 Bruno',
                '2027-01-04 Carla',
                '2027-01-05 Bruno'
            ]);
        }
    },
    {
        name: 'trecho vira lancamento no formato de plantao com descricao propria',
        run() {
            const lancamento = trechoComoLancamento(trecho({ observacao: 'Troca combinada' }));

            assert.equal(descreverTrecho(trecho()), 'Cobertura de Ana 19:00-22:00');
            assert.equal(lancamento.origem, 'cobertura');
            assert.deepEqual(lancamento.colaboradores, [20]);
            assert.equal(lancamento.tipoPlantao, 'cobertura');
            assert.equal(lancamento.observacao, 'Cobrindo Ana | Troca combinada');
        }
    },
    {
        // Mesma regra do plantao: banco credita o saldo semanal, extra nao.
        name: 'banco semanal credita o trecho em banco e ignora o de hora extra',
        run() {
            const lancamentos = [
                trechoComoLancamento(trecho({ id: 1, tipoCredito: 'banco' })),
                trechoComoLancamento(trecho({ id: 2, tipoCredito: 'extra', dataISO: '2027-01-05' }))
            ];
            const credito = calcularCreditoPlantaoNaJanela(lancamentos, 20, '2027-01-04', '2027-01-10');

            assert.equal(credito.minutos, 180);
            assert.deepEqual(credito.itens.map((item) => item.descricao), ['Cobertura de Ana 19:00-22:00']);
        }
    },
    {
        name: 'relatorio de horas extras soma o trecho de cobertura e marca a origem',
        run() {
            const relatorio = montarRelatorioHorasExtras(
                [trechoComoLancamento(trecho())],
                [bruno],
                { inicioISO: '2027-01-01', fimISO: '2027-01-31' }
            );

            assert.equal(relatorio.totalMinutos, 180);
            assert.equal(relatorio.itens[0].plantoes[0].origem, 'cobertura');
            assert.equal(relatorio.itens[0].plantoes[0].tipoPlantao, 'cobertura');
        }
    }
];
