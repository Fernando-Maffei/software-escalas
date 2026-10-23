// Campo de senha com "mostrar/ocultar" e a lista de requisitos marcando ao
// vivo enquanto se digita. Usado no cadastro e no "Definir senha".
import { escapeHtml } from '../../lib/html-seguro.js';
import { requisitosSenha } from './formatacao.js';

export function renderCampoSenha(rotulo) {
    return `
        <div class="usr-campo-senha" data-campo-senha>
            <label class="usr-campo">
                <span>${escapeHtml(rotulo)}</span>
                <span class="usr-senha-entrada">
                    <input type="password" class="form-control" data-senha autocomplete="new-password" spellcheck="false" maxlength="128">
                    <button type="button" class="usr-icone-btn" data-mostrar aria-label="Mostrar senha" title="Mostrar senha">
                        <i class="fas fa-eye" aria-hidden="true"></i>
                    </button>
                </span>
            </label>
            <ul class="usr-requisitos" data-requisitos aria-live="polite"></ul>
        </div>
    `;
}

function desenharRequisitos(campo, nomeDeUsuario) {
    const senha = campo.querySelector('[data-senha]').value;
    const lista = requisitosSenha(senha, nomeDeUsuario());

    campo.querySelector('[data-requisitos]').innerHTML = lista.map((item) => `
        <li class="${item.ok ? 'is-ok' : ''}">
            <i class="fas ${item.ok ? 'fa-check' : 'fa-circle'}" aria-hidden="true"></i>
            ${escapeHtml(item.texto)}
        </li>
    `).join('');

    return lista.every((item) => item.ok);
}

/**
 * @param {Element} raiz
 * @param {() => string} nomeDeUsuario
 * @returns {{ valor: () => string, atende: () => boolean, limpar: () => void, focar: () => void, atualizar: () => void }}
 */
export function ligarCampoSenha(raiz, nomeDeUsuario) {
    const campo = raiz.querySelector('[data-campo-senha]');
    const entrada = campo.querySelector('[data-senha]');
    const mostrar = campo.querySelector('[data-mostrar]');

    mostrar.addEventListener('click', () => {
        const visivel = entrada.type === 'text';
        entrada.type = visivel ? 'password' : 'text';
        mostrar.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
        mostrar.title = mostrar.getAttribute('aria-label');
        mostrar.innerHTML = `<i class="fas ${visivel ? 'fa-eye' : 'fa-eye-slash'}" aria-hidden="true"></i>`;
    });

    const atualizar = () => desenharRequisitos(campo, nomeDeUsuario);
    entrada.addEventListener('input', atualizar);
    atualizar();

    return {
        valor: () => entrada.value,
        atende: atualizar,
        atualizar,
        limpar: () => {
            entrada.value = '';
            atualizar();
        },
        focar: () => entrada.focus()
    };
}
