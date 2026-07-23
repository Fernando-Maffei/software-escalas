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
    verifyPassword
} = require('../utils/auth');

const router = express.Router();

function toPublicUser(user) {
    return {
        id: user.id,
        username: user.username,
        deveTrocarSenha: user.deveTrocarSenha,
        isAdmin: Boolean(user.isAdmin)
    };
}

router.post('/login', async (req, res, next) => {
    try {
        const username = normalizeUsername(req.body?.username);
        const password = normalizePassword(req.body?.password, 'Senha');

        const pool = await conectar();
        const user = await findUserByUsername(pool, username);

        if (!user || !user.ativo || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
            throw new AppError(401, 'Usuario ou senha invalidos.');
        }

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

module.exports = router;
