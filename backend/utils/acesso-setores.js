// Imposicao do controle de acesso por setor (ver [[project_meus_setores]] e a
// decisao: teto por conta, imposto no backend). Le os setores PERMITIDOS da
// conta logada — sempre fresco do banco, para uma mudanca do admin valer no
// proximo request sem precisar derrubar a sessao.
//
// Lista vazia = sem restricao (a conta ve todos os setores).
const { findUserById } = require('./auth');

async function getSetoresPermitidosRequest(pool, req) {
    if (!req.user?.id) {
        return [];
    }

    const user = await findUserById(pool, req.user.id);

    return Array.isArray(user?.setoresPermitidos) ? user.setoresPermitidos : [];
}

// Ids permitidos como inteiros (os setores sao numericos). Vazio = sem
// restricao.
function idsPermitidosNumericos(setoresPermitidos) {
    return (setoresPermitidos || [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id));
}

module.exports = {
    getSetoresPermitidosRequest,
    idsPermitidosNumericos
};
