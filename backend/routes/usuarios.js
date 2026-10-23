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
    requireAdmin,
    revokeUserSessions,
    travarAdministradores,
    updateUserFlags,
    updateUserPassword,
    updateUserSetoresPermitidos
} = require('../auth/auth');
const { validarNovoUsername, validarSenhaForte } = require('../auth/regras-conta');

const router = express.Router();

// Toda a gestao de contas e exclusiva de administradores. O requireAuth
// global (server.js) ja rodou antes deste router.
router.use(requireAdmin);

// As respostas trazem senha temporaria e dados de acesso: nada de cache em
// navegador ou proxy.
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

// Violacao do indice unico UX_Usuarios_Username (dois cadastros do mesmo
// nome ao mesmo tempo passam pela checagem previa).
const ERROS_CHAVE_DUPLICADA = new Set([2601, 2627]);

function ehChaveDuplicada(error) {
    return ERROS_CHAVE_DUPLICADA.has(Number(error?.number ?? error?.originalError?.info?.number));
}

const SQL_INT_MAX = 2147483647;
const MAX_SETORES_POR_CONTA = 100;

// Setores permitidos vindos do corpo: lista de ids de setores que EXISTEM.
// Antes qualquer texto era gravado e um id errado deixava a conta sem ver
// ninguem (falha fechada, mas silenciosa). Devolve os ids em texto, no mesmo
// formato que auth.js grava.
async function validarSetoresPermitidos(pool, valor) {
    if (!Array.isArray(valor)) {
        throw new AppError(400, 'Setores permitidos devem ser uma lista.');
    }

    const ids = Array.from(new Set(valor.map((item) => Number(item))));

    if (ids.some((id) => !Number.isInteger(id) || id <= 0 || id > SQL_INT_MAX)) {
        throw new AppError(400, 'Setor permitido invalido.');
    }

    if (ids.length > MAX_SETORES_POR_CONTA) {
        throw new AppError(400, `No maximo ${MAX_SETORES_POR_CONTA} setores por conta.`);
    }

    if (!ids.length) {
        return [];
    }

    const request = pool.request();
    const params = ids.map((id, indice) => {
        request.input(`setor${indice}`, sql.Int, id);
        return `@setor${indice}`;
    });
    const result = await request.query(`SELECT Id FROM Setores WHERE Id IN (${params.join(', ')})`);

    if (result.recordset.length !== ids.length) {
        throw new AppError(400, 'Um dos setores escolhidos nao existe mais. Recarregue a tela.');
    }

    return ids.map(String);
}

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
        const username = validarNovoUsername(req.body?.username);
        const isAdmin = req.body?.isAdmin === true;
        const senhaInformada = typeof req.body?.senha === 'string' ? req.body.senha : '';
        const senha = senhaInformada ? validarSenhaForte(senhaInformada, { username }) : generateRandomPassword();

        const pool = await conectar();
        const existente = await findUserByUsername(pool, username);

        if (existente) {
            throw new AppError(400, 'Ja existe um usuario com esse nome.');
        }

        // Setores ja na criacao, na mesma transacao: se a gravacao do teto
        // falhasse depois do INSERT, a conta nasceria vendo todos os setores.
        const setoresPermitidos = req.body?.setoresPermitidos === undefined
            ? []
            : await validarSetoresPermitidos(pool, req.body.setoresPermitidos);

        const usuario = await withTransaction(sql, pool, async (tx) => {
            const criado = await createUser(tx, {
                username,
                password: senha,
                // Conta de administrador e pessoal: a senha definida por outra
                // pessoa e provisoria e o dono troca no primeiro acesso. Conta
                // de visualizacao e compartilhada pela equipe — forcar a troca
                // faria a primeira pessoa a entrar trancar todas as outras.
                deveTrocarSenha: isAdmin,
                isAdmin
            });

            if (setoresPermitidos.length) {
                await updateUserSetoresPermitidos(tx, criado.id, setoresPermitidos);
                return findUserById(tx, criado.id);
            }

            return criado;
        }).catch((error) => {
            if (ehChaveDuplicada(error)) {
                throw new AppError(400, 'Ja existe um usuario com esse nome.');
            }

            throw error;
        });

        res.status(201).json({
            success: true,
            message: 'Usuario criado com sucesso.',
            usuario: toPublicUser(usuario),
            // So a senha GERADA volta, exibida uma unica vez para o
            // administrador repassar; a digitada ele ja conhece.
            senhaTemporaria: senhaInformada ? null : senha
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

        // A propria senha so muda por "Minha senha" (/api/auth/trocar-senha),
        // que exige a senha atual: uma sessao de admin esquecida aberta nao
        // pode trocar a senha do dono por aqui e tranca-lo do lado de fora.
        if (isSelf && (querResetarSenha || querDefinirSenha)) {
            throw new AppError(400, 'Para alterar a propria senha, use "Minha senha".');
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
        const novaSenha = querDefinirSenha
            ? validarSenhaForte(req.body.novaSenha, { username: alvo.username, campo: 'Nova senha' })
            : null;
        const querMudarSetores = req.body?.setoresPermitidos !== undefined;
        const setoresPermitidos = querMudarSetores ? await validarSetoresPermitidos(pool, req.body.setoresPermitidos) : null;
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
            if (setoresPermitidos) {
                await updateUserSetoresPermitidos(tx, alvo.id, setoresPermitidos);
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
