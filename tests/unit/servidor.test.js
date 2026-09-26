const assert = require('node:assert/strict');

const { AppError } = require('../../backend/lib/errors');
const { getClientIp, parseTrustProxy } = require('../../backend/lib/ip-cliente');
const { MENSAGEM_ERRO_INTERNO, montarRespostaDeErro } = require('../../backend/lib/tratador-erros');
const { createRateLimiter } = require('../../backend/auth/rate-limit');

module.exports = [
    {
        name: 'parseTrustProxy nao confia em proxy por padrao',
        run() {
            assert.equal(parseTrustProxy(undefined), false);
            assert.equal(parseTrustProxy(''), false);
            assert.equal(parseTrustProxy('false'), false);
            assert.equal(parseTrustProxy('0'), false);
        }
    },
    {
        name: 'parseTrustProxy aceita saltos, lista de enderecos e true explicito',
        run() {
            assert.equal(parseTrustProxy('1'), 1);
            assert.deepEqual(parseTrustProxy('loopback, 10.0.0.0/8'), ['loopback', '10.0.0.0/8']);
            assert.equal(parseTrustProxy('true'), true);
        }
    },
    {
        // A1 da auditoria: o IP vinha do X-Forwarded-For escrito pelo cliente.
        name: 'getClientIp usa o req.ip do Express e ignora o cabecalho cru',
        run() {
            const req = {
                ip: '::ffff:192.168.0.20',
                headers: { 'x-forwarded-for': '1.2.3.4' },
                socket: { remoteAddress: '::ffff:192.168.0.20' }
            };

            assert.equal(getClientIp(req), '192.168.0.20');
        }
    },
    {
        name: 'tratador de erros repassa a mensagem de AppError',
        run() {
            const resposta = montarRespostaDeErro(new AppError(409, 'Ja existe.', { campo: 'nome' }));

            assert.equal(resposta.status, 409);
            assert.deepEqual(resposta.corpo, { error: 'Ja existe.', details: { campo: 'nome' } });
        }
    },
    {
        // M2 da auditoria: erro inesperado devolvia a mensagem crua do driver.
        name: 'tratador de erros esconde a mensagem de erro inesperado',
        run() {
            const erroDoDriver = new Error("Invalid object name 'Sessoes'.");
            const resposta = montarRespostaDeErro(erroDoDriver);

            assert.equal(resposta.status, 500);
            assert.equal(resposta.corpo.error, MENSAGEM_ERRO_INTERNO);
        }
    },
    {
        name: 'tratador de erros mantem erro 4xx exposto do Express (JSON malformado)',
        run() {
            const erro = Object.assign(new SyntaxError('Unexpected token } in JSON'), { status: 400, expose: true });
            const resposta = montarRespostaDeErro(erro);

            assert.equal(resposta.status, 400);
            assert.equal(resposta.corpo.error, 'Unexpected token } in JSON');
        }
    },
    {
        name: 'rate-limit varre chaves expiradas quando o mapa cresce',
        run() {
            let agora = 0;
            const limiter = createRateLimiter({ windowMs: 1000, blockMs: 1000, sweepThreshold: 3, now: () => agora });

            ['a', 'b', 'c'].forEach((chave) => limiter.registerFailure(chave));
            assert.equal(limiter.size(), 3);

            agora = 5000;
            limiter.registerFailure('d');

            assert.equal(limiter.size(), 1);
        }
    }
];
