// Regra de permissao por perfil, isolada da camada HTTP para poder ser
// testada sem subir servidor. O middleware que a consome esta em
// backend/server.js.

// Areas que nao-admin nao acessa nem para leitura: expoem dados de
// infraestrutura (host/usuario do banco, pasta de backup, estado do servico
// do Windows, lista de contas).
const ADMIN_ONLY_PREFIXES = Object.freeze([
    '/configuracao-banco',
    '/sistema',
    '/usuarios'
]);

const READ_ONLY_METHODS = Object.freeze(['GET', 'HEAD', 'OPTIONS']);

function normalizePath(value) {
    const path = String(value || '');
    const withoutTrailingSlashes = path.replace(/\/+$/, '');

    return withoutTrailingSlashes || '/';
}

function isAdminOnlyPath(path) {
    const normalized = normalizePath(path);

    return ADMIN_ONLY_PREFIXES.some(
        (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
    );
}

function isReadOnlyMethod(method) {
    return READ_ONLY_METHODS.includes(String(method || '').toUpperCase());
}

// Retorna null quando a requisicao e permitida, ou { status, message }
// descrevendo a recusa. Admin passa por tudo; usuario comum so le, e nunca
// entra nas areas administrativas.
function checkAccess({ isAdmin, method, path }) {
    if (isAdmin) {
        return null;
    }

    if (isAdminOnlyPath(path)) {
        return { status: 403, message: 'Apenas administradores podem acessar esta area.' };
    }

    if (!isReadOnlyMethod(method)) {
        return { status: 403, message: 'Seu perfil tem acesso somente de leitura.' };
    }

    return null;
}

module.exports = {
    ADMIN_ONLY_PREFIXES,
    READ_ONLY_METHODS,
    checkAccess,
    isAdminOnlyPath,
    isReadOnlyMethod
};
