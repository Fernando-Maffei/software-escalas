const assert = require('node:assert/strict');

const {
    calcularDomingoDePascoa,
    feriadosNacionaisDoAno,
    feriadosNacionaisNoPeriodo,
    isFeriadoNacional,
    nomeFeriadoNacional
} = require('../../backend/services/feriados-nacionais');

function datas(ano) {
    return feriadosNacionaisDoAno(ano).map((item) => item.data);
}

module.exports = [
    {
        name: 'calcularDomingoDePascoa matches known easter dates',
        run() {
            assert.deepEqual(calcularDomingoDePascoa(2024), { ano: 2024, mes: 3, dia: 31 });
            assert.deepEqual(calcularDomingoDePascoa(2025), { ano: 2025, mes: 4, dia: 20 });
            assert.deepEqual(calcularDomingoDePascoa(2026), { ano: 2026, mes: 4, dia: 5 });
            assert.deepEqual(calcularDomingoDePascoa(2027), { ano: 2027, mes: 3, dia: 28 });
        }
    },
    {
        // As datas abaixo sao as que o seed de dados de exemplo gravava no
        // banco: o calculo tem de dar exatamente a mesma lista, senao um dia
        // que era feriado deixaria de ser.
        name: 'feriadosNacionaisDoAno reproduces the list that used to be seeded',
        run() {
            assert.deepEqual(datas(2026), [
                '2026-01-01',
                '2026-02-17',
                '2026-04-03',
                '2026-04-21',
                '2026-05-01',
                '2026-06-04',
                '2026-09-07',
                '2026-10-12',
                '2026-11-02',
                '2026-11-15',
                '2026-11-20',
                '2026-12-25'
            ]);
            assert.deepEqual(datas(2027), [
                '2027-01-01',
                '2027-02-09',
                '2027-03-26',
                '2027-04-21',
                '2027-05-01',
                '2027-05-27',
                '2027-09-07',
                '2027-10-12',
                '2027-11-02',
                '2027-11-15',
                '2027-11-20',
                '2027-12-25'
            ]);
        }
    },
    {
        name: 'feriadosNacionaisDoAno derives carnaval, good friday and corpus christi from easter',
        run() {
            const nomesPorData = new Map(feriadosNacionaisDoAno(2027).map((item) => [item.data, item.nome]));

            assert.equal(nomesPorData.get('2027-02-09'), 'Carnaval');
            assert.equal(nomesPorData.get('2027-03-26'), 'Sexta-feira Santa');
            assert.equal(nomesPorData.get('2027-05-27'), 'Corpus Christi');
        }
    },
    {
        // Lei 14.759/2023: 20 de novembro so e feriado nacional a partir de 2024.
        name: 'consciencia negra only counts from 2024 on',
        run() {
            assert.equal(isFeriadoNacional('2023-11-20'), false);
            assert.equal(isFeriadoNacional('2024-11-20'), true);
        }
    },
    {
        name: 'isFeriadoNacional and nomeFeriadoNacional answer by date',
        run() {
            assert.equal(nomeFeriadoNacional('2026-09-07'), 'Independência do Brasil');
            assert.equal(nomeFeriadoNacional('2026-09-08'), null);
            assert.equal(isFeriadoNacional('2026-09-08'), false);
            assert.equal(isFeriadoNacional(''), false);
            assert.equal(isFeriadoNacional('07/09/2026'), false);
            assert.equal(nomeFeriadoNacional('2026-12-25T00:00:00.000Z'), 'Natal');
        }
    },
    {
        name: 'feriadosNacionaisNoPeriodo crosses the turn of the year',
        run() {
            const datasNoPeriodo = feriadosNacionaisNoPeriodo('2026-12-01', '2027-01-31');

            assert.deepEqual([...datasNoPeriodo].sort(), ['2026-12-25', '2027-01-01']);
            assert.equal(feriadosNacionaisNoPeriodo('2026-03-01', '2026-03-31').size, 0);
            assert.equal(feriadosNacionaisNoPeriodo('2026-05-01', '2026-04-01').size, 0);
        }
    }
];
