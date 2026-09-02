const assert = require('node:assert/strict');

const {
    TIPOS_FERIADO,
    classificarDia,
    criarIndiceFeriados,
    normalizarTipoFeriado
} = require('../backend/utils/dias');

const FERIADOS = [
    { Data: '2026-09-07', Nome: 'Independencia', Tipo: 'Nacional' },
    { Data: '2026-11-20', Nome: 'Consciencia Negra', Tipo: 'Estadual' },
    { Data: '2026-06-24', Nome: 'Sao Joao', Tipo: 'municipal' },
    { Data: '2026-05-02', Nome: 'Aniversario da cidade', Tipo: 'municipal' }
];

module.exports = [
    {
        name: 'classificarDia distingue util, sabado e domingo',
        run() {
            assert.equal(classificarDia('2026-09-08').tipo, 'util');
            assert.equal(classificarDia('2026-09-05').tipo, 'sabado');
            assert.equal(classificarDia('2026-09-06').tipo, 'domingo');
        }
    },
    {
        name: 'feriado nacional, estadual e municipal valem igual',
        run() {
            const indice = criarIndiceFeriados(FERIADOS);

            for (const dataISO of ['2026-09-07', '2026-11-20', '2026-06-24']) {
                const dia = classificarDia(dataISO, indice);

                assert.equal(dia.tipo, 'feriado', `${dataISO} deveria ser feriado`);
                assert.equal(dia.permitePlantao, true);
                assert.equal(dia.geraJornadaPadrao, false);
                assert.equal(dia.ehDiaUtil, false);
            }
        }
    },
    {
        name: 'a abrangencia do feriado vem junto da classificacao',
        run() {
            const indice = criarIndiceFeriados(FERIADOS);

            assert.equal(classificarDia('2026-09-07', indice).tipoFeriado, 'nacional');
            assert.equal(classificarDia('2026-11-20', indice).tipoFeriado, 'estadual');
            assert.equal(classificarDia('2026-06-24', indice).tipoFeriado, 'municipal');
            assert.equal(classificarDia('2026-09-08', indice).tipoFeriado, null);
        }
    },
    {
        name: 'feriado tem precedencia sobre o dia da semana',
        run() {
            // 02/05/2026 cai num sabado
            const indice = criarIndiceFeriados(FERIADOS);
            const dia = classificarDia('2026-05-02', indice);

            assert.equal(dia.weekday, 6);
            assert.equal(dia.ehSabado, true);
            assert.equal(dia.tipo, 'feriado');
            assert.equal(dia.nomeFeriado, 'Aniversario da cidade');
        }
    },
    {
        name: 'feriado nao gera jornada padrao, como o fim de semana',
        run() {
            const indice = criarIndiceFeriados(FERIADOS);

            assert.equal(classificarDia('2026-09-08', indice).geraJornadaPadrao, true, 'terca comum');
            assert.equal(classificarDia('2026-09-07', indice).geraJornadaPadrao, false, 'feriado');
            assert.equal(classificarDia('2026-09-05', indice).geraJornadaPadrao, false, 'sabado');
        }
    },
    {
        name: 'plantao so em fim de semana ou feriado',
        run() {
            const indice = criarIndiceFeriados(FERIADOS);

            assert.equal(classificarDia('2026-09-08', indice).permitePlantao, false);
            assert.equal(classificarDia('2026-09-05', indice).permitePlantao, true);
            assert.equal(classificarDia('2026-09-06', indice).permitePlantao, true);
            assert.equal(classificarDia('2026-09-07', indice).permitePlantao, true);
        }
    },
    {
        name: 'criarIndiceFeriados aceita os formatos da tabela e da API',
        run() {
            const indice = criarIndiceFeriados([
                { Data: new Date('2026-09-07T00:00:00Z'), Nome: 'Da tabela', Tipo: 'Nacional' },
                { date: '2026-10-12', name: 'Da BrasilAPI' },
                { data: '2026-11-20', nome: 'Minusculo', tipo: 'ESTADUAL' },
                null,
                { Nome: 'Sem data' }
            ]);

            assert.equal(indice.size, 3);
            assert.equal(indice.get('2026-09-07').nome, 'Da tabela');
            assert.equal(indice.get('2026-10-12').tipo, 'municipal', 'sem tipo cai no padrao');
            assert.equal(indice.get('2026-11-20').tipo, 'estadual');
        }
    },
    {
        name: 'normalizarTipoFeriado aceita acento, caixa e lixo',
        run() {
            assert.equal(normalizarTipoFeriado('Nacional'), 'nacional');
            assert.equal(normalizarTipoFeriado('ESTADUAL'), 'estadual');
            assert.equal(normalizarTipoFeriado('  Municipal  '), 'municipal');
            assert.equal(normalizarTipoFeriado('federal'), 'municipal', 'valor desconhecido cai no padrao');
            assert.equal(normalizarTipoFeriado(null), 'municipal');
            assert.deepEqual(TIPOS_FERIADO, ['nacional', 'estadual', 'municipal']);
        }
    },
    {
        name: 'a data nao anda por causa de fuso',
        run() {
            // 01/01 e o caso classico: em fuso negativo vira 31/12 do ano anterior
            assert.equal(classificarDia('2026-01-01').dataISO, '2026-01-01');
            assert.equal(classificarDia('2026-01-01').weekday, 4);
            assert.equal(classificarDia('2026-03-01').weekday, 0);
        }
    }
];
