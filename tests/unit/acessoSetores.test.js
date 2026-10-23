const assert = require('assert');

const { escopoLancamentos, idsPermitidosNumericos } = require('../../backend/auth/acesso-setores');

module.exports = [
    {
        name: 'escopoLancamentos so aceita o escopo exato da tela de lancamentos',
        run() {
            assert.strictEqual(escopoLancamentos({ query: { escopo: 'lancamentos' } }), true);
            assert.strictEqual(escopoLancamentos({ query: {} }), false);
            assert.strictEqual(escopoLancamentos({ query: { escopo: 'Lancamentos' } }), false);
            assert.strictEqual(escopoLancamentos({ query: { escopo: 'geral' } }), false);
            assert.strictEqual(escopoLancamentos({ query: { escopo: ['lancamentos', 'x'] } }), false);
            assert.strictEqual(escopoLancamentos({}), false);
        }
    },
    {
        name: 'idsPermitidosNumericos descarta o que nao e id de setor',
        run() {
            assert.deepStrictEqual(idsPermitidosNumericos(['3', 7, 'abc', 0, -2, 1.5, 2147483648]), [3, 7]);
            assert.deepStrictEqual(idsPermitidosNumericos(null), []);
        }
    }
];
