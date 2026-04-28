const { AppError } = require('./errors');

function extractRawDatabaseMessage(error) {
    return String(
        error?.originalError?.info?.message
        || error?.originalError?.message
        || error?.message
        || ''
    ).trim();
}

function normalizeErrorCode(error) {
    return String(
        error?.code
        || error?.originalError?.code
        || error?.name
        || ''
    ).trim().toUpperCase();
}

function mapDatabaseConnectionError(error, fallbackMessage) {
    if (error instanceof AppError) {
        return error;
    }

    const rawMessage = extractRawDatabaseMessage(error);
    const errorCode = normalizeErrorCode(error);
    const details = {
        code: errorCode || null,
        rawMessage: rawMessage || null
    };

    if (
        errorCode === 'ELOGIN'
        || /login failed/i.test(rawMessage)
        || /falha de login/i.test(rawMessage)
    ) {
        return new AppError(
            400,
            'Falha de autenticacao no SQL Server. Verifique usuario e senha informados.',
            details
        );
    }

    if (
        ['ESOCKET', 'ENOTFOUND', 'ETIMEOUT'].includes(errorCode)
        || /server was not found/i.test(rawMessage)
        || /could not open a connection/i.test(rawMessage)
        || /failed to connect/i.test(rawMessage)
        || /timed out/i.test(rawMessage)
    ) {
        return new AppError(
            400,
            'Nao foi possivel conectar ao servidor SQL Server informado. Verifique host, porta e instancia.',
            details
        );
    }

    if (
        /cannot open database/i.test(rawMessage)
        || /database .* requested by the login/i.test(rawMessage)
        || /invalid object name/i.test(rawMessage)
    ) {
        return new AppError(
            400,
            'A conexao foi aberta, mas o banco de dados informado nao esta acessivel. Verifique o nome do banco e as permissoes.',
            details
        );
    }

    if (
        /permission/i.test(rawMessage)
        || /not authorized/i.test(rawMessage)
        || /create table permission denied/i.test(rawMessage)
        || /alter table permission denied/i.test(rawMessage)
    ) {
        return new AppError(
            403,
            'Conexao realizada, mas o usuario nao possui permissao para criar ou alterar tabelas.',
            details
        );
    }

    return new AppError(500, fallbackMessage, details);
}

module.exports = {
    mapDatabaseConnectionError
};
