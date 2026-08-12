const express = require('express');

const { conectar } = require('../db');
const { AppError } = require('../utils/errors');
const {
    clearSessionCookie,
    createSession,
    destroySession,
    findUserById,
    findUserByUsername,
    getSessionTokenFromRequest,
    normalizePassword,
    normalizeUsername,
    requireAuth,
    setSessionCookie,
    touchLastLogin,
    updateUserPassword,
    updateUserSetoresVisiveis,
    verifyPassword
} = require('../utils/auth');

const { createRateLimiter } = require('../utils/rate-limit');

const router = express.Router();

// Limitador de forca bruta no login: por IP + usuario, para uma senha errada
// repetida nao vazar para outras contas nem para a tentativa de outra pessoa
// na mesma rede.
const loginRateLimiter = createRateLimiter();

function getClientIpFromRequest(req) {
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const rawIp = forwardedFor || req.socket?.remoteAddress || req.ip || '';
    return String(rawIp).replace(/^::ffff:/, '');
}

function toPublicUser(user) {
    return {
        id: user.id,
        username: user.username,
        deveTrocarSenha: user.deveTrocarSenha,
        isAdmin: Boolean(user.isAdmin),
        setoresVisiveis: Array.isArray(user.setoresVisiveis) ? user.setoresVisiveis : [],
        setoresPermitidos: Array.isArray(user.setoresPermitidos) ? user.setoresPermitidos : []
    };
}

router.post('/login', async (req, res, next) => {
    try {
        const username = normalizeUsername(req.body?.username);
        const password = normalizePassword(req.body?.password, 'Senha');

        const rateKey = `${getClientIpFromRequest(req)}|${username.toLowerCase()}`;
        const limite = loginRateLimiter.check(rateKey);

        if (limite.blocked) {
            const minutos = Math.ceil(limite.retryAfterMs / 60000);
            throw new AppError(429, `Muitas tentativas de login. Tente novamente em ${minutos} minuto(s).`);
        }

        const pool = await conectar();
        const user = await findUserByUsername(pool, username);

        if (!user || !user.ativo || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
            loginRateLimiter.registerFailure(rateKey);
            throw new AppError(401, 'Usuario ou senha invalidos.');
        }

        // Login valido zera o historico de falhas desta chave.
        loginRateLimiter.reset(rateKey);

        const token = createSession(user);
        setSessionCookie(res, token);
        await touchLastLogin(pool, user.id);

        res.json({ success: true, user: toPublicUser(user) });
    } catch (error) {
        next(error);
    }
});

router.post('/logout', (req, res) => {
    const token = getSessionTokenFromRequest(req);
    destroySession(token);
    clearSessionCookie(res);
    res.json({ success: true });
});

router.get('/me', requireAuth, async (req, res, next) => {
    try {
        const pool = await conectar();
        const user = await findUserById(pool, req.user.id);

        if (!user) {
            throw new AppError(401, 'Sessao invalida ou expirada. Faca login novamente.');
        }

        res.json({ user: toPublicUser(user) });
    } catch (error) {
        next(error);
    }
});

router.post('/trocar-senha', requireAuth, async (req, res, next) => {
    try {
        // A conta de visualizacao e compartilhada pela equipe: se uma pessoa
        // trocar a senha, tranca todas as outras. Só o administrador altera
        // essa senha, pela tela de Usuarios.
        if (!req.user.isAdmin) {
            throw new AppError(403, 'A senha da conta de visualizacao e alterada apenas pelo administrador.');
        }

        const novaSenha = normalizePassword(req.body?.novaSenha, 'Nova senha');
        const pool = await conectar();

        await updateUserPassword(pool, req.user.id, novaSenha, { deveTrocarSenha: false });

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// Confirma a senha do PROPRIO usuario logado. Serve de "portao" para acoes
// sensiveis (ex.: excluir um colaborador) sem alterar o contrato dessas rotas:
// o front chama isto ANTES de agir e so prossegue se der 200. Usa o mesmo
// limitador de forca bruta do login, com chave propria.
// Salva a preferencia "Meus setores" do PROPRIO usuario logado (nao e area
// administrativa: cada um ajusta a propria visao). Corpo: { setores: [ids] }.
// Lista vazia = ver todos (sem filtro). Retorna a lista ja normalizada.
router.put('/me/setores', requireAuth, async (req, res, next) => {
    try {
        const setores = Array.isArray(req.body?.setores) ? req.body.setores : [];
        const pool = await conectar();
        const setoresVisiveis = await updateUserSetoresVisiveis(pool, req.user.id, setores);

        res.json({ success: true, setoresVisiveis });
    } catch (error) {
        next(error);
    }
});

router.post('/verify-password', requireAuth, async (req, res, next) => {
    try {
        const password = String(req.body?.password || '');

        if (!password) {
            throw new AppError(400, 'Informe a senha.');
        }

        const rateKey = `verify|${getClientIpFromRequest(req)}|${req.user.id}`;
        const limite = loginRateLimiter.check(rateKey);

        if (limite.blocked) {
            const minutos = Math.ceil(limite.retryAfterMs / 60000);
            throw new AppError(429, `Muitas tentativas. Tente novamente em ${minutos} minuto(s).`);
        }

        const pool = await conectar();
        const user = await findUserById(pool, req.user.id);

        if (!user || !user.ativo || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
            loginRateLimiter.registerFailure(rateKey);
            throw new AppError(403, 'Senha incorreta.');
        }

        loginRateLimiter.reset(rateKey);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
