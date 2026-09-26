const crypto = require('crypto');

const { sql, conectar } = require('../db');
const { AppError } = require('../lib/errors');
const { normalizeOptionalText } = require('../lib/validation');

const SCRYPT_KEYLEN = 64;
const SESSION_COOKIE_NAME = 'escalas_sid';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
const MIN_PASSWORD_LENGTH = 8;

// As sessoes vivem na tabela Sessoes do banco (nao mais num Map em memoria).
// Assim o servidor reinicia sem deslogar ninguem e varias instancias atras de
// um balanceador compartilham a mesma sessao — pre-requisito para nuvem. O
// custo e uma consulta por request autenticado, trivial pelo indice na chave.
// A validade desliza a cada acesso (getSession renova o ExpiresAt), como antes.

// scrypt assincrono: a versao Sync travava o event loop (~50 ms por login),
// e com varios logins juntos o servidor inteiro parava de responder.
/**
 * @param {string} password
 * @param {string} salt
 * @returns {Promise<Buffer>}
 */
function derivarChave(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, SCRYPT_KEYLEN, (error, chave) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(chave);
        });
    });
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = (await derivarChave(password, salt)).toString('hex');
    return { hash, salt };
}

async function verifyPassword(password, hash, salt) {
    const candidate = await derivarChave(password, salt);
    const stored = Buffer.from(hash, 'hex');

    if (candidate.length !== stored.length) {
        return false;
    }

    return crypto.timingSafeEqual(candidate, stored);
}

// Hash de uma senha qualquer, calculado uma vez. Login de usuario que nao
// existe roda o mesmo scrypt contra ele, para responder no mesmo tempo que uma
// senha errada — senao a demora revelaria quais usuarios existem.
let hashFicticio = null;

async function verificarContraHashFicticio(password) {
    if (!hashFicticio) {
        hashFicticio = await hashPassword(crypto.randomBytes(16).toString('hex'));
    }

    await verifyPassword(password, hashFicticio.hash, hashFicticio.salt);
    return false;
}

// Confere usuario + senha. Usuario inexistente ou inativo leva o mesmo tempo
// de uma senha errada.
async function credenciaisValidas(user, password) {
    if (!user) {
        return verificarContraHashFicticio(password);
    }

    const senhaConfere = await verifyPassword(password, user.passwordHash, user.passwordSalt);
    return senhaConfere && user.ativo;
}

function normalizeUsername(value) {
    const username = normalizeOptionalText(value, 'Usuario', { maxLength: 100 });

    if (!username) {
        throw new AppError(400, 'Usuario e obrigatorio.');
    }

    return username;
}

function normalizePassword(value, fieldName = 'Senha') {
    const password = String(value || '');

    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new AppError(400, `${fieldName} deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }

    return password;
}

function generateRandomPassword() {
    return crypto.randomBytes(9).toString('base64url');
}

// Normaliza a lista de setores visiveis para um array de ids em texto (sem
// duplicatas, sem vazios, com teto de tamanho). Usado tanto ao ler do banco
// quanto ao gravar, para os dois lados falarem o mesmo formato. Lista vazia
// significa "ver todos" (sem filtro).
function normalizeSetoresVisiveis(value) {
    let bruto = value;

    if (typeof bruto === 'string') {
        try {
            bruto = JSON.parse(bruto);
        } catch (error) {
            return [];
        }
    }

    if (!Array.isArray(bruto)) {
        return [];
    }

    const vistos = new Set();

    for (const item of bruto) {
        if (item === null || item === undefined || typeof item === 'object') {
            continue;
        }

        const id = String(item).trim();

        if (id) {
            vistos.add(id);
        }

        if (vistos.size >= 100) {
            break;
        }
    }

    return Array.from(vistos);
}

function mapUserRow(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.Id,
        username: row.Username,
        passwordHash: row.PasswordHash,
        passwordSalt: row.PasswordSalt,
        deveTrocarSenha: Boolean(row.DeveTrocarSenha),
        ativo: Boolean(row.Ativo),
        isAdmin: Boolean(row.IsAdmin),
        setoresVisiveis: normalizeSetoresVisiveis(row.SetoresVisiveisJson),
        setoresPermitidos: normalizeSetoresVisiveis(row.SetoresPermitidosJson),
        criadoEm: row.CreatedAt || null,
        ultimoLoginAt: row.UltimoLoginAt || null
    };
}

async function countUsers(pool) {
    const result = await pool.request().query('SELECT COUNT(*) AS total FROM Usuarios');
    return result.recordset[0]?.total || 0;
}

async function findUserByUsername(pool, username) {
    const result = await pool.request()
        .input('username', sql.NVarChar(100), username)
        .query('SELECT * FROM Usuarios WHERE Username = @username');

    return mapUserRow(result.recordset[0]);
}

async function findUserById(pool, id) {
    const result = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM Usuarios WHERE Id = @id');

    return mapUserRow(result.recordset[0]);
}

async function createUser(pool, { username, password, deveTrocarSenha = false, isAdmin = false }) {
    const normalizedUsername = normalizeUsername(username);
    const normalizedPassword = normalizePassword(password);
    const { hash, salt } = await hashPassword(normalizedPassword);

    await pool.request()
        .input('username', sql.NVarChar(100), normalizedUsername)
        .input('hash', sql.NVarChar(255), hash)
        .input('salt', sql.NVarChar(255), salt)
        .input('deveTrocarSenha', sql.Bit, deveTrocarSenha)
        .input('isAdmin', sql.Bit, isAdmin)
        .query(`
            INSERT INTO Usuarios (Username, PasswordHash, PasswordSalt, DeveTrocarSenha, IsAdmin)
            VALUES (@username, @hash, @salt, @deveTrocarSenha, @isAdmin)
        `);

    return findUserByUsername(pool, normalizedUsername);
}

async function listUsers(pool) {
    const result = await pool.request().query(`
        SELECT Id, Username, DeveTrocarSenha, Ativo, IsAdmin, SetoresPermitidosJson, CreatedAt, UltimoLoginAt
        FROM Usuarios
        ORDER BY Username
    `);

    return result.recordset.map(mapUserRow);
}

async function countOtherActiveAdmins(pool, excludedUserId) {
    const result = await pool.request()
        .input('id', sql.Int, excludedUserId)
        .query('SELECT COUNT(*) AS total FROM Usuarios WHERE IsAdmin = 1 AND Ativo = 1 AND Id <> @id');

    return result.recordset[0]?.total || 0;
}

/**
 * @param {import('mssql').ConnectionPool | import('mssql').Transaction} pool
 * @param {number} userId
 * @param {{ ativo?: boolean, isAdmin?: boolean }} flags
 */
async function updateUserFlags(pool, userId, { ativo, isAdmin }) {
    const assignments = [];

    if (ativo !== undefined) {
        assignments.push('Ativo = @ativo');
    }

    if (isAdmin !== undefined) {
        assignments.push('IsAdmin = @isAdmin');
    }

    if (assignments.length === 0) {
        return;
    }

    const request = pool.request().input('id', sql.Int, userId);

    if (ativo !== undefined) {
        request.input('ativo', sql.Bit, Boolean(ativo));
    }

    if (isAdmin !== undefined) {
        request.input('isAdmin', sql.Bit, Boolean(isAdmin));
    }

    await request.query(`UPDATE Usuarios SET ${assignments.join(', ')} WHERE Id = @id`);
}

async function updateUserPassword(pool, userId, newPassword, options = {}) {
    const { deveTrocarSenha = false } = options;
    const normalizedPassword = normalizePassword(newPassword, 'Nova senha');
    const { hash, salt } = await hashPassword(normalizedPassword);

    await pool.request()
        .input('id', sql.Int, userId)
        .input('hash', sql.NVarChar(255), hash)
        .input('salt', sql.NVarChar(255), salt)
        .input('deveTrocarSenha', sql.Bit, deveTrocarSenha)
        .query(`
            UPDATE Usuarios
            SET PasswordHash = @hash, PasswordSalt = @salt, DeveTrocarSenha = @deveTrocarSenha
            WHERE Id = @id
        `);
}

async function touchLastLogin(pool, userId) {
    await pool.request()
        .input('id', sql.Int, userId)
        .query('UPDATE Usuarios SET UltimoLoginAt = GETDATE() WHERE Id = @id');
}

// Salva a preferencia "Meus setores" da conta. Lista vazia grava NULL (=ver
// todos), evitando distinguir "[]" de "sem preferencia". Retorna a lista
// normalizada que ficou gravada.
async function updateUserSetoresVisiveis(pool, userId, setores) {
    const normalizados = normalizeSetoresVisiveis(setores);
    const json = normalizados.length ? JSON.stringify(normalizados) : null;

    await pool.request()
        .input('id', sql.Int, userId)
        .input('json', sql.NVarChar(sql.MAX), json)
        .query('UPDATE Usuarios SET SetoresVisiveisJson = @json WHERE Id = @id');

    return normalizados;
}

// Salva os setores PERMITIDOS da conta (teto imposto, definido por admin).
// Lista vazia grava NULL (= sem restricao, ve todos). Retorna a lista gravada.
async function updateUserSetoresPermitidos(pool, userId, setores) {
    const normalizados = normalizeSetoresVisiveis(setores);
    const json = normalizados.length ? JSON.stringify(normalizados) : null;

    await pool.request()
        .input('id', sql.Int, userId)
        .input('json', sql.NVarChar(sql.MAX), json)
        .query('UPDATE Usuarios SET SetoresPermitidosJson = @json WHERE Id = @id');

    return normalizados;
}

// Exclusao definitiva. Diferente de desativar (Ativo = 0), apaga a linha. Nao
// ha tabela que referencie Usuarios (a escala e por colaborador, nao por
// conta), entao a remocao nao deixa orfaos. As protecoes (nao apagar a si
// mesmo, nao apagar o ultimo admin) ficam na rota, junto das demais regras.
async function deleteUser(pool, userId) {
    await pool.request()
        .input('id', sql.Int, userId)
        .query('DELETE FROM Usuarios WHERE Id = @id');
}

async function ensureDefaultAdmin(pool) {
    const total = await countUsers(pool);

    if (total > 0) {
        return null;
    }

    const username = normalizeOptionalText(process.env.ADMIN_USERNAME, 'Usuario') || 'admin';
    const envPassword = process.env.ADMIN_PASSWORD || '';
    const envPasswordValida = envPassword.length >= MIN_PASSWORD_LENGTH;

    // Senha do .env curta demais e ignorada — e isso precisa ficar visivel.
    // Antes ela era trocada por uma aleatoria marcada como "nao gerada": a
    // senha nunca aparecia e ninguem conseguia entrar.
    if (envPassword && !envPasswordValida) {
        console.warn(
            `[auth] ADMIN_PASSWORD ignorada: tem menos de ${MIN_PASSWORD_LENGTH} caracteres. Uma senha aleatoria sera gerada.`
        );
    }

    const password = envPasswordValida ? envPassword : generateRandomPassword();

    await createUser(pool, {
        username,
        password,
        deveTrocarSenha: !envPasswordValida,
        isAdmin: true
    });

    return { username, password, generated: !envPasswordValida };
}

async function createSession(pool, user) {
    const token = crypto.randomBytes(32).toString('hex');

    // ExpiresAt calculado no proprio banco (SYSUTCDATETIME) para nao depender do
    // relogio nem do fuso do processo Node — a comparacao em getSession usa a
    // mesma base UTC.
    await pool.request()
        .input('token', sql.Char(64), token)
        .input('userId', sql.Int, user.id)
        .input('username', sql.NVarChar(100), user.username)
        .input('isAdmin', sql.Bit, Boolean(user.isAdmin))
        .input('ttl', sql.Int, SESSION_TTL_SECONDS)
        .query(`
            INSERT INTO Sessoes (Token, UserId, Username, IsAdmin, ExpiresAt)
            VALUES (@token, @userId, @username, @isAdmin, DATEADD(SECOND, @ttl, SYSUTCDATETIME()))
        `);

    return token;
}

// Encerra imediatamente todas as sessoes ativas de um usuario — usado ao
// desativar a conta, remover o papel de administrador ou resetar a senha,
// para a mudanca valer na hora e nao so no proximo login. Retorna quantas
// sessoes foram apagadas.
async function revokeUserSessions(pool, userId) {
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query('DELETE FROM Sessoes WHERE UserId = @userId');

    return result.rowsAffected?.[0] || 0;
}

// Encerra todas as sessoes da conta menos a informada (a de quem acabou de
// trocar a propria senha). Retorna quantas foram apagadas.
async function revokeOtherUserSessions(pool, userId, tokenAtual) {
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .input('token', sql.Char(64), tokenAtual || '')
        .query('DELETE FROM Sessoes WHERE UserId = @userId AND Token <> @token');

    return result.rowsAffected?.[0] || 0;
}

// Valida a sessao e, na mesma ida ao banco, renova o ExpiresAt (validade
// deslizante) e devolve os dados. Uma sessao expirada nao casa no WHERE e
// retorna null — a linha vencida sera varrida por purgeExpiredSessions.
async function getSession(pool, token) {
    if (!token) {
        return null;
    }

    const result = await pool.request()
        .input('token', sql.Char(64), token)
        .input('ttl', sql.Int, SESSION_TTL_SECONDS)
        .query(`
            UPDATE Sessoes
            SET ExpiresAt = DATEADD(SECOND, @ttl, SYSUTCDATETIME())
            OUTPUT inserted.UserId, inserted.Username, inserted.IsAdmin
            WHERE Token = @token AND ExpiresAt > SYSUTCDATETIME()
        `);

    const row = result.recordset[0];

    if (!row) {
        return null;
    }

    return {
        userId: row.UserId,
        username: row.Username,
        isAdmin: Boolean(row.IsAdmin)
    };
}

async function destroySession(pool, token) {
    if (!token) {
        return;
    }

    await pool.request()
        .input('token', sql.Char(64), token)
        .query('DELETE FROM Sessoes WHERE Token = @token');
}

// Remove sessoes vencidas. Chamado uma vez na inicializacao e periodicamente
// pelo servidor — as linhas expiradas ja nao autenticam (WHERE em getSession),
// isto so evita a tabela crescer sem limite.
async function purgeExpiredSessions(pool) {
    const result = await pool.request()
        .query('DELETE FROM Sessoes WHERE ExpiresAt <= SYSUTCDATETIME()');

    return result.rowsAffected?.[0] || 0;
}

function parseCookies(req) {
    const header = req.headers.cookie;
    const cookies = {};

    if (!header) {
        return cookies;
    }

    header.split(';').forEach((pair) => {
        const separatorIndex = pair.indexOf('=');

        if (separatorIndex === -1) {
            return;
        }

        const key = pair.slice(0, separatorIndex).trim();
        const value = pair.slice(separatorIndex + 1).trim();

        if (!key) {
            return;
        }

        // Cookie com escape invalido (ex.: "%" solto) e entrada malformada do
        // cliente, nao erro do servidor: ele e ignorado, e a requisicao segue
        // como sem sessao (401) em vez de estourar URIError (500).
        try {
            cookies[key] = decodeURIComponent(value);
        } catch (error) {
            if (!(error instanceof URIError)) {
                throw error;
            }
        }
    });

    return cookies;
}

function getSessionTokenFromRequest(req) {
    return parseCookies(req)[SESSION_COOKIE_NAME] || null;
}

function setSessionCookie(res, token) {
    const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
    res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`
    );
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

async function requireAuth(req, res, next) {
    try {
        const token = getSessionTokenFromRequest(req);
        const pool = await conectar();
        const session = await getSession(pool, token);

        if (!session) {
            next(new AppError(401, 'Sessao invalida ou expirada. Faca login novamente.'));
            return;
        }

        req.user = { id: session.userId, username: session.username, isAdmin: Boolean(session.isAdmin) };
        setSessionCookie(res, token);
        next();
    } catch (error) {
        next(error);
    }
}

function requireAdmin(req, res, next) {
    if (!req.user?.isAdmin) {
        next(new AppError(403, 'Apenas administradores podem executar esta acao.'));
        return;
    }

    next();
}

module.exports = {
    SESSION_COOKIE_NAME,
    countOtherActiveAdmins,
    countUsers,
    createSession,
    createUser,
    clearSessionCookie,
    credenciaisValidas,
    deleteUser,
    destroySession,
    ensureDefaultAdmin,
    findUserById,
    findUserByUsername,
    generateRandomPassword,
    getSessionTokenFromRequest,
    listUsers,
    purgeExpiredSessions,
    normalizePassword,
    normalizeUsername,
    requireAdmin,
    requireAuth,
    revokeOtherUserSessions,
    revokeUserSessions,
    setSessionCookie,
    touchLastLogin,
    updateUserFlags,
    updateUserPassword,
    updateUserSetoresPermitidos,
    updateUserSetoresVisiveis,
    verifyPassword
};
