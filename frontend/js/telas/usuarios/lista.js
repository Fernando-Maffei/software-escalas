// Lista de contas em cards: quem e, papel, situacao, setores e ultimo acesso.
// As acoes ficam no painel da conta (botao "Editar"), nao espalhadas no card.
import { escapeHtml } from '../../lib/html-seguro.js';
import { contarUsuarios, filtrarUsuarios, formatarUltimoAcesso, inicialDoNome, resumirSetores } from './formatacao.js';

const ROTULOS_FILTRO = Object.freeze({
    todos: 'Todos',
    ativos: 'Ativos',
    inativos: 'Inativos',
    admins: 'Administradores'
});

export function ehContaPropria(usuario, usuarioAtual) {
    return Number(usuario.id) === Number(usuarioAtual?.id);
}

export function renderSelos(usuario) {
    return [
        usuario.isAdmin
            ? '<span class="usr-selo usr-selo-admin"><i class="fas fa-user-shield" aria-hidden="true"></i> Administrador</span>'
            : '<span class="usr-selo usr-selo-leitura"><i class="fas fa-eye" aria-hidden="true"></i> Visualizacao</span>',
        usuario.ativo
            ? '<span class="usr-selo usr-selo-ativo">Ativa</span>'
            : '<span class="usr-selo usr-selo-inativo">Desativada</span>',
        usuario.deveTrocarSenha
            ? '<span class="usr-selo usr-selo-pendente" title="A pessoa precisa definir a senha no proximo acesso">Troca de senha pendente</span>'
            : ''
    ].join('');
}

export function renderAvatar(usuario) {
    return `<span class="usr-avatar ${usuario.isAdmin ? 'is-admin' : ''}" aria-hidden="true">${escapeHtml(inicialDoNome(usuario.username))}</span>`;
}

function renderCartao(usuario, ctx) {
    const propria = ehContaPropria(usuario, ctx.usuarioAtual);
    const acesso = formatarUltimoAcesso(usuario.ultimoLoginAt);
    const setores = resumirSetores(usuario.setoresPermitidos, ctx.setores);

    return `
        <li class="usr-cartao ${usuario.ativo ? '' : 'is-inativo'}" ${propria ? 'data-propria' : ''}>
            ${renderAvatar(usuario)}
            <div class="usr-cartao-corpo">
                <div class="usr-cartao-topo">
                    <strong class="usr-nome">${escapeHtml(usuario.username)}</strong>
                    ${propria ? '<span class="usr-voce">voce</span>' : ''}
                    <span class="usr-selos">${renderSelos(usuario)}</span>
                </div>
                <div class="usr-cartao-meta">
                    <span class="${setores.restrito ? 'is-restrito' : ''}" title="${escapeHtml(setores.completo)}">
                        <i class="fas fa-shield-halved" aria-hidden="true"></i>
                        ${escapeHtml(setores.texto)}
                    </span>
                    <span title="${escapeHtml(acesso.titulo)}">
                        <i class="fas fa-clock" aria-hidden="true"></i>
                        Ultimo acesso: ${escapeHtml(acesso.texto)}
                    </span>
                </div>
            </div>
            <button type="button" class="btn-secondary usr-btn usr-btn-sm" data-editar="${Number(usuario.id)}"
                aria-label="Editar a conta ${escapeHtml(usuario.username)}">
                <i class="fas fa-pen" aria-hidden="true"></i> Editar
            </button>
        </li>
    `;
}

export function renderFiltros(ctx) {
    const contagem = contarUsuarios(ctx.usuarios);

    return Object.entries(ROTULOS_FILTRO).map(([chave, rotulo]) => `
        <button type="button" class="usr-filtro ${ctx.filtro === chave ? 'is-ativo' : ''}" data-filtro="${chave}"
            aria-pressed="${ctx.filtro === chave ? 'true' : 'false'}">
            ${rotulo} <span class="usr-filtro-num">${contagem[chave]}</span>
        </button>
    `).join('');
}

export function renderLista(ctx) {
    const visiveis = filtrarUsuarios(ctx.usuarios, { busca: ctx.busca, filtro: ctx.filtro });

    if (!visiveis.length) {
        const motivo = ctx.busca
            ? `Nenhuma conta encontrada para "${escapeHtml(ctx.busca)}".`
            : 'Nenhuma conta neste filtro.';

        return `<div class="usr-vazio"><i class="fas fa-user-slash" aria-hidden="true"></i><p>${motivo}</p></div>`;
    }

    return `<ul class="usr-lista">${visiveis.map((usuario) => renderCartao(usuario, ctx)).join('')}</ul>`;
}
