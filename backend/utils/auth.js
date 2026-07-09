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
        ativo: Boolean(row.Ativo)
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

async function createUser(pool, { username, password, deveTrocarSenha = false }) {
    const normalizedUsername = normalizeUsername(username);
    const normalizedPassword = normalizePassword(password);
    const { hash, salt } = hashPassword(normalizedPassword);

    await pool.request()
        .input('username', sql.NVarChar(100), normalizedUsername)
        .input('hash', sql.NVarChar(255), hash)
        .input('salt', sql.NVarChar(255), salt)
        .input('deveTrocarSenha', sql.Bit, deveTrocarSenha)
        .query(`
            INSERT INTO Usuarios (Username, PasswordHash, PasswordSalt, DeveTrocarSenha)
            VALUES (@username, @hash, @salt, @deveTrocarSenha)
        `);

    return findUserByUsername(pool, normalizedUsername);
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
        deveTrocarSenha: !envPassword
    });

    return { username, password, generated: !envPassword };
}

function createSession(user) {
    const token = crypto.randomBytes(32).toString('hex');

    sessions.set(token, {
        userId: user.id,
        username: user.username,
        expiresAt: Date.now() + SESSION_TTL_MS
    });

    return token;
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

    req.user = { id: session.userId, username: session.username };
    setSessionCookie(res, token);
    next();
}

module.exports = {
    SESSION_COOKIE_NAME,
    countUsers,
    createSession,
    createUser,
    clearSessionCookie,
    destroySession,
    ensureDefaultAdmin,
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
};
