const assert = require('node:assert/strict');

const { AppError } = require('../../backend/lib/errors');
const { validarNovoUsername, validarSenhaForte } = require('../../backend/auth/regras-conta');

function recusa(fn, trecho) {
    assert.throws(fn, (error) => {
        assert.ok(error instanceof AppError, `esperava AppError, veio ${error}`);
        assert.equal(error.statusCode, 400);
        assert.match(error.message, trecho);
        return true;
    });
}

module.exports = [
    {
        name: 'senha forte aceita senhas boas e devolve o texto como veio',
        run() {
            assert.equal(validarSenhaForte('Nova!Senha2026'), 'Nova!Senha2026');
            assert.equal(validarSenhaForte('cafe com leite 7'), 'cafe com leite 7');
            assert.equal(validarSenhaForte('ação-Plantão9'), 'ação-Plantão9');
        }
    },
    {
        name: 'senha forte recusa curta, longa demais ou sem mistura',
        run() {
            recusa(() => validarSenhaForte('Ab1!'), /pelo menos 8/);
            recusa(() => validarSenhaForte(`A1${'x'.repeat(200)}`), /no maximo 128/);
            recusa(() => validarSenhaForte('somenteletras'), /misturar letras/);
            recusa(() => validarSenhaForte('1234567890123'), /misturar letras/);
            recusa(() => validarSenhaForte('letras com espaco'), /misturar letras/);
            recusa(() => validarSenhaForte(undefined), /pelo menos 8/);
            recusa(() => validarSenhaForte({ length: 20 }), /pelo menos 8/);
        }
    },
    {
        name: 'senha forte recusa as comuns, repetidas e sequencias',
        run() {
            recusa(() => validarSenhaForte('Senha123'), /facil demais/);
            recusa(() => validarSenhaForte('ADMIN@123'), /facil demais/);
            recusa(() => validarSenhaForte('a1a1a1a1a1'), /facil demais/);
            recusa(() => validarSenhaForte('abcdef12'), /facil demais/);
            recusa(() => validarSenhaForte('Qwerty123!'), /facil demais/);
            recusa(() => validarSenhaForte('zzzz9999'), /facil demais/);
        }
    },
    {
        name: 'senha forte recusa conter o nome de usuario e usa o rotulo do campo',
        run() {
            recusa(() => validarSenhaForte('Fernando!2026', { username: 'fernando' }), /nome de usuario/);
            recusa(() => validarSenhaForte('x', { campo: 'Nova senha' }), /^Nova senha deve/);
            // Nome curto demais nao conta: "ab" aparece em muita senha boa.
            assert.equal(validarSenhaForte('Abacate!77', { username: 'ab' }), 'Abacate!77');
        }
    },
    {
        name: 'nome de usuario novo: letras, numeros e . _ - @, 3 a 50, sem espaco nem HTML',
        run() {
            assert.equal(validarNovoUsername('  equipe.uti '), 'equipe.uti');
            assert.equal(validarNovoUsername('joão_silva-2'), 'joão_silva-2');
            assert.equal(validarNovoUsername('ana@hospital'), 'ana@hospital');

            recusa(() => validarNovoUsername(''), /obrigatorio/);
            recusa(() => validarNovoUsername(null), /obrigatorio/);
            recusa(() => validarNovoUsername('ab'), /entre 3 e 50/);
            recusa(() => validarNovoUsername('x'.repeat(51)), /entre 3 e 50/);
            recusa(() => validarNovoUsername('com espaco'), /sem espacos/);
            recusa(() => validarNovoUsername('<b>chefe</b>'), /sem espacos/);
            recusa(() => validarNovoUsername('.oculto'), /sem espacos/);
        }
    }
];
