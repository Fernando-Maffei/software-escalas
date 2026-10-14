// Ultimo middleware do Express: transforma qualquer erro em resposta JSON.
//
// Mensagem de AppError e escrita por nos para o usuario, entao vai como esta.
// Erro inesperado (driver do banco, bug, TypeError) pode carregar nome de
// tabela, SQL ou caminho de arquivo: o cliente recebe uma mensagem generica e
// o detalhe fica so no log do servidor.
const { AppError } = require('./errors');

const MENSAGEM_ERRO_INTERNO = 'Erro interno no servidor. O detalhe foi registrado no log.';

function montarRespostaDeErro(error) {
    if (error instanceof AppError) {
        return {
            status: error.statusCode || 500,
            corpo: { error: error.message, details: error.details || null }
        };
    }

    // Erros HTTP do proprio Express/body-parser (JSON malformado, corpo grande
    // demais) trazem status 4xx e expose=true: a mensagem e segura.
    const status = Number(error?.statusCode || error?.status) || 500;

    if (status < 500 && error?.expose) {
        return { status, corpo: { error: error.message, details: null } };
    }

    return { status: status < 500 ? status : 500, corpo: { error: MENSAGEM_ERRO_INTERNO, details: null } };
}

function tratadorDeErros(logger = console) {
    // O Express reconhece o middleware de erro pela aridade (4 parametros),
    // entao _next precisa existir mesmo sem uso.
    return function tratarErro(error, req, res, _next) {
        const { status, corpo } = montarRespostaDeErro(error);

        if (status >= 500) {
            logger.error(`[${req.method}] ${req.originalUrl}`, error);
        }

        res.status(status).json(corpo);
    };
}

module.exports = {
    MENSAGEM_ERRO_INTERNO,
    montarRespostaDeErro,
    tratadorDeErros
};
