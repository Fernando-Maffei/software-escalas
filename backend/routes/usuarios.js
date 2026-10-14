const express = require('express');

const { sql, conectar } = require('../db');
const { withTransaction } = require('../db/transactions');
const { AppError } = require('../lib/errors');
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
    travarAdministradores,
    updateUserFlags,
    updateUserPassword,
    updateUserSetoresPermitidos
} = require('../auth/auth');

const router = express.Router();

// Toda a gestao de contas e exclusiva de administradores. O requireAuth
// global (server.js) ja rodou antes deste router.
router.use(requireAdmin);

// Recusa tirar o ultimo administrador ativo. Roda DENTRO da transacao que vai
// gravar, depois da trava: o papel do alvo e relido ali, porque outra
// requisicao pode ter mudado entre a leitura inicial da rota e este ponto.
async function exigirOutroAdminAtivo(tx, alvoId, orientacao) {
    await travarAdministradores(tx);

    const alvo = await findUserById(tx, alvoId);

    if (!alvo?.isAdmin || !alvo.ativo) {
        return;
    }

    if ((await countOtherActiveAdmins(tx, alvoId)) === 0) {
        throw new AppError(400, `Este e o unico administrador ativo. ${orientacao}`);
    }
}

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
        const querDefinirSenha = typeof req.body?.novaSenha === 'string' && req.body.novaSenha.length > 0;
        const isSelf = alvo.id === req.user.id;

        if (isSelf && (querDesativar || querRemoverAdmin)) {
            throw new AppError(400, 'Voce nao pode desativar ou remover a administracao da propria conta.');
        }

        /** @type {{ ativo?: boolean, isAdmin?: boolean }} */
        const flags = {};

        if (querDesativar || querReativar) {
            flags.ativo = req.body.ativo;
        }

        if (querRemoverAdmin || querPromoverAdmin) {
            flags.isAdmin = req.body.isAdmin;
        }

        // Valida ANTES de gravar qualquer coisa: antes uma senha curta dava 400
        // depois de ja ter mudado ativo/admin.
        // Senha definida explicitamente pelo administrador (diferente do reset,
        // que gera uma aleatoria). Vale como esta e nao exige troca no primeiro
        // acesso — quem definiu ja escolheu a senha final.
        const novaSenha = querDefinirSenha ? normalizePassword(req.body.novaSenha, 'Nova senha') : null;
        let senhaTemporaria = null;

        await withTransaction(sql, pool, async (tx) => {
            if (querDesativar || querRemoverAdmin) {
                await exigirOutroAdminAtivo(tx, alvo.id, 'Promova outro usuario antes.');
            }

            await updateUserFlags(tx, alvo.id, flags);

            // Setores permitidos (teto de acesso imposto). So aplica quando o
            // campo vem no corpo, para nao zerar a permissao numa atualizacao de
            // flags. Nao derruba a sessao: a imposicao no backend le o teto
            // fresco do banco a cada request.
            if (Array.isArray(req.body?.setoresPermitidos)) {
                await updateUserSetoresPermitidos(tx, alvo.id, req.body.setoresPermitidos);
            }

            if (novaSenha) {
                await updateUserPassword(tx, alvo.id, novaSenha, { deveTrocarSenha: false });
            } else if (querResetarSenha) {
                // Le o papel depois de updateUserFlags: se a mesma requisicao
                // promoveu ou rebaixou o usuario, quem vale e o papel novo.
                const alvoAtualizado = await findUserById(tx, alvo.id);

                senhaTemporaria = generateRandomPassword();
                await updateUserPassword(tx, alvo.id, senhaTemporaria, {
                    // Mesma razao da criacao: conta de visualizacao e
                    // compartilhada e nao pode exigir troca no primeiro acesso.
                    deveTrocarSenha: alvoAtualizado.isAdmin
                });
            }

            // Mudancas restritivas valem imediatamente, nao so no proximo login.
            if (querDesativar || querRemoverAdmin || querResetarSenha || querDefinirSenha) {
                await revokeUserSessions(tx, alvo.id);
            }
        });

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
        // deleteUser apaga a linha em Usuarios; a FK ON DELETE CASCADE da tabela
        // Sessoes remove junto qualquer sessao aberta da conta, sem passo extra.
        await withTransaction(sql, pool, async (tx) => {
            await exigirOutroAdminAtivo(tx, alvo.id, 'Promova outro usuario antes de excluir.');
            await deleteUser(tx, alvo.id);
        });

        res.json({
            success: true,
            message: `Usuario "${alvo.username}" excluido definitivamente.`
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
