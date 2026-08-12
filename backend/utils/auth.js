const crypto = require('crypto');

const { sql } = require('../db');
const { AppError } = require('./errors');
const { normalizeOptionalText } = require('./validation');

const SCRYPT_KEYLEN = 64;
const SESSION_COOKIE_NAME = 'escalas_sid';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

const sessions = new Map();

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
    return { hash, salt };
}

function verifyPassword(password, hash, salt) {
    const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    const stored = Buffer.from(hash, 'hex');

    if (candidate.length !== stored.length) {
        return false;
    }

    return crypto.timingSafeEqual(candidate, stored);
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
    const { hash, salt } = hashPassword(normalizedPassword);

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
        SELECT Id, Username, DeveTrocarSenha, Ativo, IsAdmin, CreatedAt, UltimoLoginAt
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
    const { hash, salt } = hashPassword(normalizedPassword);

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
    const envPassword = process.env.ADMIN_PASSWORD;
    const password = envPassword && envPassword.length >= MIN_PASSWORD_LENGTH
        ? envPassword
        : generateRandomPassword();

    await createUser(pool, {
        username,
        password,
        deveTrocarSenha: !envPassword,
        isAdmin: true
    });

    return { username, password, generated: !envPassword };
}

function createSession(user) {
    const token = crypto.randomBytes(32).toString('hex');

    sessions.set(token, {
        userId: user.id,
        username: user.username,
        isAdmin: Boolean(user.isAdmin),
        expiresAt: Date.now() + SESSION_TTL_MS
    });

    return token;
}

// Encerra imediatamente todas as sessoes ativas de um usuario — usado ao
// desativar a conta, remover o papel de administrador ou resetar a senha,
// para a mudanca valer na hora e nao so no proximo login.
function revokeUserSessions(userId) {
    let revoked = 0;

    sessions.forEach((session, token) => {
        if (session.userId === userId) {
            sessions.delete(token);
            revoked += 1;
        }
    });

    return revoked;
}

function getSession(token) {
    if (!token) {
        return null;
    }

    const session = sessions.get(token);

    if (!session) {
        return null;
    }

    if (session.expiresAt < Date.now()) {
        sessions.delete(token);
        return null;
    }

    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return session;
}

function destroySession(token) {
    if (token) {
        sessions.delete(token);
    }
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

        if (key) {
            cookies[key] = decodeURIComponent(value);
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

function requireAuth(req, res, next) {
    const token = getSessionTokenFromRequest(req);
    const session = getSession(token);

    if (!session) {
        next(new AppError(401, 'Sessao invalida ou expirada. Faca login novamente.'));
        return;
    }

    req.user = { id: session.userId, username: session.username, isAdmin: Boolean(session.isAdmin) };
    setSessionCookie(res, token);
    next();
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
    deleteUser,
    destroySession,
    ensureDefaultAdmin,
    findUserById,
    findUserByUsername,
    generateRandomPassword,
    getSessionTokenFromRequest,
    listUsers,
    normalizePassword,
    normalizeUsername,
    requireAdmin,
    requireAuth,
    revokeUserSessions,
    setSessionCookie,
    touchLastLogin,
    updateUserFlags,
    updateUserPassword,
    updateUserSetoresVisiveis,
    verifyPassword
};
