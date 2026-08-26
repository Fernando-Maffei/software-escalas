const express = require('express');

const { conectar } = require('../db');
const { AppError } = require('../utils/errors');
const {
    countOtherActiveAdmins,
    createUser,
    deleteUser,
    findUserById,
    findUserByUsername,
    generateRandomPassword,
    listUsers,
    normalizePassword,
    normalizeUsername,
    requireAdmin,
    revokeUserSessions,
    updateUserFlags,
    updateUserPassword,
    updateUserSetoresPermitidos
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
        setoresPermitidos: Array.isArray(user.setoresPermitidos) ? user.setoresPermitidos : [],
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
            // Conta de administrador e pessoal: a senha definida por outra
            // pessoa e provisoria e o dono troca no primeiro acesso. Conta
            // de visualizacao e compartilhada pela equipe — forcar a troca
            // faria a primeira pessoa a entrar trancar todas as outras.
            deveTrocarSenha: isAdmin,
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

        // Setores permitidos (teto de acesso imposto). So aplica quando o campo
        // vem no corpo, para nao zerar a permissao numa atualizacao de flags.
        // Nao derruba a sessao: a imposicao no backend le o teto fresco do banco
        // a cada request, entao a mudanca ja vale no proximo carregamento.
        if (Array.isArray(req.body?.setoresPermitidos)) {
            await updateUserSetoresPermitidos(pool, alvo.id, req.body.setoresPermitidos);
        }

        let senhaTemporaria = null;

        if (querResetarSenha) {
            // Le o papel depois de updateUserFlags: se a mesma requisicao
            // promoveu ou rebaixou o usuario, quem vale e o papel novo.
            const alvoAtualizado = await findUserById(pool, alvo.id);

            senhaTemporaria = generateRandomPassword();
            await updateUserPassword(pool, alvo.id, senhaTemporaria, {
                // Mesma razao da criacao: conta de visualizacao e
                // compartilhada e nao pode exigir troca no primeiro acesso.
                deveTrocarSenha: alvoAtualizado.isAdmin
            });
        }

        // Mudancas restritivas valem imediatamente, nao so no proximo login.
        if (querDesativar || querRemoverAdmin || querResetarSenha) {
            await revokeUserSessions(pool, alvo.id);
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

router.delete('/:id', async (req, res, next) => {
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

        // Nao apagar a propria conta: quem esta logado seguiria com sessao
        // valida apontando para um usuario inexistente.
        if (alvo.id === req.user.id) {
            throw new AppError(400, 'Voce nao pode excluir a propria conta.');
        }

        // Mesma protecao do desativar: nunca deixar o sistema sem administrador.
        if (alvo.isAdmin) {
            const outrosAdmins = await countOtherActiveAdmins(pool, alvo.id);

            if (outrosAdmins === 0) {
                throw new AppError(400, 'Este e o unico administrador ativo. Promova outro usuario antes de excluir.');
            }
        }

        // deleteUser apaga a linha em Usuarios; a FK ON DELETE CASCADE da tabela
        // Sessoes remove junto qualquer sessao aberta da conta, sem passo extra.
        await deleteUser(pool, alvo.id);

        res.json({
            success: true,
            message: `Usuario "${alvo.username}" excluido definitivamente.`
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
