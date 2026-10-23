// Regras para os dados que uma pessoa DIGITA ao criar ou alterar uma conta:
// nome de usuario novo e senha escolhida. Ficam fora de auth.js porque nao
// valem para tudo: o login segue aceitando a senha antiga de quem ja tem conta
// (normalizePassword so confere o tamanho minimo), e a senha gerada pelo
// sistema (generateRandomPassword) ja e aleatoria e longa.
const { AppError } = require('../lib/errors');

const SENHA_TAMANHO_MINIMO = 8;
// Teto para nao gastar scrypt com textos enormes; nenhuma senha real chega
// perto disso.
const SENHA_TAMANHO_MAXIMO = 128;

const USERNAME_TAMANHO_MINIMO = 3;
const USERNAME_TAMANHO_MAXIMO = 50;
// Letras (inclusive acentuadas), digitos e . _ - @, comecando por letra ou
// digito. Sem espaco nem sinais de HTML: o nome aparece em telas, logs e no
// cabecalho da sessao.
const USERNAME_PADRAO = /^[\p{L}\p{N}][\p{L}\p{N}._@-]*$/u;

// Senhas que aparecem no topo de qualquer lista de vazamentos, ja em
// minusculas. A regra de letras + numero/simbolo barra muitas outras.
const SENHAS_COMUNS = new Set([
    '12345678',
    '123456789',
    '1234567890',
    'password',
    'password1',
    'password123',
    'senha123',
    'senha1234',
    'senha@123',
    'mudar123',
    'mudar@123',
    'admin123',
    'admin@123',
    'admin1234',
    'qwerty123',
    'abc12345',
    'abcd1234',
    'escala123',
    'escalas123',
    'iloveyou1',
    'welcome1',
    'bemvindo1',
    'brasil123'
]);

const SEQUENCIAS = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

function ehTrechoTrivial(trecho) {
    if (new Set(trecho).size === 1) {
        return true;
    }

    return SEQUENCIAS.some(
        (sequencia) => sequencia.includes(trecho) || sequencia.split('').reverse().join('').includes(trecho)
    );
}

// "a1a1a1a1", "abcdef12", "qwerty123!", "zzzz9999": a senha quebrada em
// trechos de letras, de digitos e de simbolos, e todo trecho e repeticao ou
// sequencia.
function ehRepeticaoOuSequencia(senha) {
    const minuscula = senha.toLowerCase();

    if (new Set(minuscula).size <= 2) {
        return true;
    }

    const trechos = minuscula.match(/\p{L}+|\p{N}+|[^\p{L}\p{N}]+/gu) || [];

    return trechos.every(ehTrechoTrivial);
}

/**
 * Lanca AppError 400 com a regra que a senha nao cumpre. Devolve a senha
 * como veio (sem trim: espaco pode ser parte dela).
 *
 * @param {unknown} valor
 * @param {{ username?: string, campo?: string }} [opcoes]
 * @returns {string}
 */
function validarSenhaForte(valor, opcoes = {}) {
    const { username = '', campo = 'Senha' } = opcoes;
    const senha = typeof valor === 'string' ? valor : '';

    if (senha.length < SENHA_TAMANHO_MINIMO) {
        throw new AppError(400, `${campo} deve ter pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`);
    }

    if (senha.length > SENHA_TAMANHO_MAXIMO) {
        throw new AppError(400, `${campo} deve ter no maximo ${SENHA_TAMANHO_MAXIMO} caracteres.`);
    }

    if (!/\p{L}/u.test(senha) || !/[^\p{L}\s]/u.test(senha)) {
        throw new AppError(400, `${campo} deve misturar letras com numeros ou simbolos.`);
    }

    const minuscula = senha.toLowerCase();

    if (SENHAS_COMUNS.has(minuscula) || ehRepeticaoOuSequencia(senha)) {
        throw new AppError(400, `${campo} e facil demais de adivinhar. Escolha outra.`);
    }

    const nome = String(username || '').trim().toLowerCase();

    if (nome.length >= USERNAME_TAMANHO_MINIMO && minuscula.includes(nome)) {
        throw new AppError(400, `${campo} nao pode conter o nome de usuario.`);
    }

    return senha;
}

/**
 * Nome de usuario de uma conta NOVA. Contas antigas com nomes fora do padrao
 * seguem entrando normalmente (o login usa normalizeUsername).
 *
 * @param {unknown} valor
 * @returns {string}
 */
function validarNovoUsername(valor) {
    const username = typeof valor === 'string' ? valor.trim() : '';

    if (!username) {
        throw new AppError(400, 'Usuario e obrigatorio.');
    }

    if (username.length < USERNAME_TAMANHO_MINIMO || username.length > USERNAME_TAMANHO_MAXIMO) {
        throw new AppError(
            400,
            `Usuario deve ter entre ${USERNAME_TAMANHO_MINIMO} e ${USERNAME_TAMANHO_MAXIMO} caracteres.`
        );
    }

    if (!USERNAME_PADRAO.test(username)) {
        throw new AppError(400, 'Usuario aceita apenas letras, numeros e . _ - @ (sem espacos).');
    }

    return username;
}

module.exports = {
    SENHA_TAMANHO_MAXIMO,
    SENHA_TAMANHO_MINIMO,
    validarNovoUsername,
    validarSenhaForte
};
