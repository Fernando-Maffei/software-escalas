// Chamadas HTTP da tela de Usuarios. Toda resposta vira { ok, dados, erro }:
// as telas so mostram `erro`, que e a mensagem escrita pelo backend (ou uma
// generica quando a rede falha) — nunca o detalhe tecnico.

const USUARIOS_URL = '/api/usuarios';

async function requisitar(url, init, erroPadrao) {
    try {
        const resposta = await fetch(url, init);
        const dados = await resposta.json().catch(() => ({}));

        if (!resposta.ok) {
            return { ok: false, dados, erro: dados?.error || erroPadrao };
        }

        return { ok: true, dados, erro: null };
    } catch (error) {
        return { ok: false, dados: {}, erro: 'Falha de comunicacao com o servidor. Tente de novo.' };
    }
}

function json(metodo, corpo) {
    return {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo)
    };
}

export function listarUsuarios() {
    return requisitar(USUARIOS_URL, undefined, 'Nao foi possivel carregar os usuarios.');
}

export async function listarSetores() {
    const resultado = await requisitar('/api/setores', undefined, 'Nao foi possivel carregar os setores.');
    const dados = resultado.dados;
    const lista = Array.isArray(dados) ? dados : (dados?.setores || dados?.data || []);
    return { ...resultado, lista };
}

export function criarUsuario(corpo) {
    return requisitar(USUARIOS_URL, json('POST', corpo), 'Nao foi possivel criar o usuario.');
}

export function atualizarUsuario(id, corpo) {
    return requisitar(`${USUARIOS_URL}/${Number(id)}`, json('PUT', corpo), 'Nao foi possivel atualizar o usuario.');
}

export function excluirUsuario(id) {
    return requisitar(`${USUARIOS_URL}/${Number(id)}`, { method: 'DELETE' }, 'Nao foi possivel excluir o usuario.');
}
