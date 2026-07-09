const express = require('express');

const { conectar } = require('../db');
const { AppError } = require('../utils/errors');
const {
    countOtherActiveAdmins,
    createUser,
    findUserById,
    findUserByUsername,
    generateRandomPassword,
    listUsers,
    normalizePassword,
    normalizeUsername,
    requireAdmin,
    revokeUserSessions,
    updateUserFlags,
    updateUserPassword
} = require('../utils/auth');

const router = express.Router();

// Toda a gestao de contas e exclusiva de administradores. O requireAuth
// global (server.js) ja rodou antes deste router.
router.use(requireAdmin);

function toPublicUser(user) {
    return {
        id: user.id,
        username: user.username,
        ativo: user.ativo,
        isAdmin: user.isAdmin,
        deveTrocarSenha: user.deveTrocarSenha,
        criadoEm: user.criadoEm,
        ultimoLoginAt: user.ultimoLoginAt
    };
}

router.get('/', async (req, res, next) => {
    try {
        const pool = await conectar();
        const usuarios = await listUsers(pool);

        res.json({
            total: usuarios.length,
            usuarios: usuarios.map(toPublicUser)
        });
    } catch (error) {
        next(error);
    }
});

router.post('/', async (req, res, next) => {
    try {
        const username = normalizeUsername(req.body?.username);
        const isAdmin = req.body?.isAdmin === true;
        const senhaInformada = String(req.body?.senha || '');
        const senhaGerada = !senhaInformada;
        const senha = senhaGerada ? generateRandomPassword() : normalizePassword(senhaInformada);

        const pool = await conectar();
        const existente = await findUserByUsername(pool, username);

        if (existente) {
            throw new AppError(400, 'Ja existe um usuario com esse nome.');
        }

        const usuario = await createUser(pool, {
            username,
            password: senha,
            // Senha definida por outra pessoa e sempre provisoria: o dono da
            // conta troca no primeiro acesso.
            deveTrocarSenha: true,
            isAdmin
        });

        res.status(201).json({
            success: true,
            message: 'Usuario criado com sucesso.',
            usuario: toPublicUser(usuario),
            // Exibida uma unica vez para o administrador repassar ao usuario.
            senhaTemporaria: senha
        });
    } catch (error) {
        next(error);
    }
});

router.put('/:id', async (req, res, next) => {
    try {
        const userId = Number(req.params.id);

        if (!Number.isInteger(userId) || userId <= 0) {
            throw new AppError(400, 'Identificador de usuario invalido.');
        }

        const pool = await conectar();
        const alvo = await findUserById(pool, userId);

        if (!alvo) {
            throw new AppError(404, 'Usuario nao encontrado.');
        }

        const querDesativar = req.body?.ativo === false;
        const querReativar = req.body?.ativo === true;
        const querRemoverAdmin = req.body?.isAdmin === false;
        const querPromoverAdmin = req.body?.isAdmin === true;
        const querResetarSenha = req.body?.resetarSenha === true;
        const isSelf = alvo.id === req.user.id;

        if (isSelf && (querDesativar || querRemoverAdmin)) {
            throw new AppError(400, 'Voce nao pode desativar ou remover a administracao da propria conta.');
        }

        if ((querDesativar || querRemoverAdmin) && alvo.isAdmin) {
            const outrosAdmins = await countOtherActiveAdmins(pool, alvo.id);

            if (outrosAdmins === 0) {
                throw new AppError(400, 'Este e o unico administrador ativo. Promova outro usuario antes.');
            }
        }

        const flags = {};

        if (querDesativar || querReativar) {
            flags.ativo = req.body.ativo;
        }

        if (querRemoverAdmin || querPromoverAdmin) {
            flags.isAdmin = req.body.isAdmin;
        }

        await updateUserFlags(pool, alvo.id, flags);

        let senhaTemporaria = null;

        if (querResetarSenha) {
            senhaTemporaria = generateRandomPassword();
            await updateUserPassword(pool, alvo.id, senhaTemporaria, { deveTrocarSenha: true });
        }

        // Mudancas restritivas valem imediatamente, nao so no proximo login.
        if (querDesativar || querRemoverAdmin || querResetarSenha) {
            revokeUserSessions(alvo.id);
        }

        const atualizado = await findUserById(pool, alvo.id);

        res.json({
            success: true,
            message: 'Usuario atualizado com sucesso.',
            usuario: toPublicUser(atualizado),
            senhaTemporaria
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
