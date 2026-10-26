// Imposicao do controle de acesso por setor: cada conta pode ter um teto de
// setores (SetoresPermitidosJson), imposto no backend. Le os setores PERMITIDOS da
// conta logada — sempre fresco do banco, para uma mudanca do admin valer no
// proximo request sem precisar derrubar a sessao.
//
// Lista vazia = sem restricao (a conta ve todos os setores).
const { sql } = require('../db');
const { AppError } = require('../lib/errors');
const { findUserById } = require('./auth');

async function getSetoresPermitidosRequest(pool, req) {
    if (!req.user?.id) {
        return [];
    }

    const user = await findUserById(pool, req.user.id);

    return Array.isArray(user?.setoresPermitidos) ? user.setoresPermitidos : [];
}

// Ids permitidos como inteiros validos para a coluna INT (os setores sao
// numericos). Valor que nao e id de setor e descartado — e, se nada sobrar, as
// rotas nao mostram ninguem (falha fechada).
const SQL_INT_MAX = 2147483647;

function idsPermitidosNumericos(setoresPermitidos) {
    return (setoresPermitidos || [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0 && id <= SQL_INT_MAX);
}

// Ids dos colaboradores que a conta logada pode ver, ou null quando ela nao
// tem restricao de setor. Serve as leituras que nao passam pela lista de
// colaboradores (ausencias, plantoes, banco de horas, jornada, folgas): antes
// o teto valia so em GET /colaboradores e essas rotas devolviam todo mundo.
async function colaboradoresVisiveis(pool, req) {
    const permitidos = await getSetoresPermitidosRequest(pool, req);

    if (!permitidos.length) {
        return null;
    }

    const ids = idsPermitidosNumericos(permitidos);

    if (!ids.length) {
        return new Set();
    }

    const request = pool.request();
    const params = ids.map((id, indice) => {
        request.input(`setor${indice}`, sql.Int, id);
        return `@setor${indice}`;
    });
    const result = await request.query(`SELECT Id FROM Colaboradores WHERE SetorId IN (${params.join(', ')})`);

    return new Set(result.recordset.map((linha) => Number(linha.Id)));
}

// A tela de lancamentos do mes (Calendario: ferias, folgas e ausencias) e
// geral: qualquer conta ve e lanca para todos os colaboradores. Ela pede isso
// explicitamente com ?escopo=lancamentos, e so as listas que ela consome
// (GET /colaboradores e GET /ausencias) aceitam o parametro. O relatorio
// Mensal completo le as mesmas listas e e geral pelo mesmo motivo. Escala do Dia,
// Banco de Horas e Dashboard nao o mandam e seguem limitadas pelo teto.
function escopoLancamentos(req) {
    return String(req.query?.escopo || '') === 'lancamentos';
}

// Falha com 404 (e nao 403) para nao confirmar sequer que o colaborador existe.
function exigirColaboradorVisivel(visiveis, colaboradorId) {
    if (visiveis && !visiveis.has(Number(colaboradorId))) {
        throw new AppError(404, 'Colaborador nao encontrado.');
    }
}

module.exports = {
    colaboradoresVisiveis,
    escopoLancamentos,
    exigirColaboradorVisivel,
    getSetoresPermitidosRequest,
    idsPermitidosNumericos
};
