// Dialogos da tela de Usuarios sobre <dialog> nativo: foco preso no dialogo,
// Esc fecha e o fundo fica inerte sem codigo extra. Cada um e criado na hora
// e removido ao fechar. Texto vindo do banco sempre passa por escapeHtml.
import { escapeHtml } from '../../lib/html-seguro.js';

export function abrirDialogo(classe, html) {
    const dialogo = document.createElement('dialog');
    dialogo.className = `usr-dialogo ${classe}`;
    // <dialog> ja e um dialogo para leitores de tela; o atributo explicito e
    // para quem procura por [role="dialog"] (o robo de testes, por exemplo).
    dialogo.setAttribute('role', 'dialog');
    dialogo.setAttribute('aria-modal', 'true');
    dialogo.innerHTML = html;
    document.body.appendChild(dialogo);

    dialogo.addEventListener('close', () => dialogo.remove());
    // Clique no fundo (fora da caixa) fecha, como nos demais modais.
    dialogo.addEventListener('click', (evento) => {
        if (evento.target === dialogo) {
            dialogo.close('cancelar');
        }
    });

    dialogo.showModal();
    return dialogo;
}

/**
 * Confirmacao com titulo, texto e botao nomeado pela acao ("Desativar", e nao
 * "OK"). Com `digitar`, o botao so libera depois de digitar esse texto — usado
 * na exclusao definitiva.
 *
 * @param {{ titulo: string, mensagem: string, confirmar: string, perigo?: boolean, digitar?: string }} opcoes
 * @returns {Promise<boolean>}
 */
export function confirmarAcao({ titulo, mensagem, confirmar, perigo = false, digitar = '' }) {
    return new Promise((resolve) => {
        const dialogo = abrirDialogo(
            'usr-dialogo-confirmar',
            `
            <form method="dialog" class="usr-dialogo-caixa">
                <h2 class="usr-dialogo-titulo">
                    <i class="fas ${perigo ? 'fa-triangle-exclamation' : 'fa-circle-question'}" aria-hidden="true"></i>
                    ${escapeHtml(titulo)}
                </h2>
                <p class="usr-dialogo-texto">${escapeHtml(mensagem)}</p>
                ${digitar ? `
                    <label class="usr-campo">
                        <span>Para confirmar, digite <strong>${escapeHtml(digitar)}</strong></span>
                        <input type="text" class="form-control" data-digitar autocomplete="off" spellcheck="false">
                    </label>` : ''}
                <div class="usr-dialogo-acoes">
                    <button type="submit" value="cancelar" class="btn-secondary usr-btn">Cancelar</button>
                    <button type="submit" value="ok" class="${perigo ? 'btn-danger' : 'btn-primary'} usr-btn" data-ok ${digitar ? 'disabled' : ''}>
                        ${escapeHtml(confirmar)}
                    </button>
                </div>
            </form>
            `
        );

        const ok = dialogo.querySelector('[data-ok]');
        const campo = dialogo.querySelector('[data-digitar]');

        if (campo) {
            campo.addEventListener('input', () => {
                ok.disabled = campo.value.trim() !== digitar;
            });
            campo.focus();
        } else {
            // Foco no "Cancelar": Enter sem querer nao confirma acao destrutiva.
            dialogo.querySelector('[value="cancelar"]').focus();
        }

        dialogo.addEventListener('close', () => resolve(dialogo.returnValue === 'ok'));
    });
}

/**
 * Mostra uma senha gerada pelo servidor, uma unica vez, com botao de copiar.
 *
 * @param {{ username: string, senha: string, isAdmin: boolean }} dados
 */
export function mostrarSenhaGerada({ username, senha, isAdmin }) {
    // Conta de administrador e pessoal (senha provisoria, trocada no primeiro
    // acesso); a de visualizacao e compartilhada e a senha vale como esta.
    const explicacao = isAdmin
        ? 'Repasse agora: ela nao sera exibida de novo. No primeiro acesso a pessoa define a senha definitiva.'
        : 'Repasse a equipe agora: ela nao sera exibida de novo. Esta senha vale como esta — quem usa a conta de visualizacao nao pode altera-la.';

    const dialogo = abrirDialogo(
        'usr-dialogo-senha',
        `
        <form method="dialog" class="usr-dialogo-caixa">
            <h2 class="usr-dialogo-titulo">
                <i class="fas fa-key" aria-hidden="true"></i>
                ${isAdmin ? 'Senha temporaria' : 'Senha de acesso'} de ${escapeHtml(username)}
            </h2>
            <div class="usr-senha-gerada">
                <code data-senha>${escapeHtml(senha)}</code>
                <button type="button" class="btn-secondary usr-btn usr-btn-sm" data-copiar>
                    <i class="fas fa-copy" aria-hidden="true"></i> Copiar
                </button>
            </div>
            <p class="usr-dialogo-texto">${explicacao}</p>
            <div class="usr-dialogo-acoes">
                <button type="submit" value="ok" class="btn-primary usr-btn">
                    <i class="fas fa-check" aria-hidden="true"></i> Ja anotei
                </button>
            </div>
        </form>
        `
    );

    const copiar = dialogo.querySelector('[data-copiar]');

    copiar.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(senha);
            copiar.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Copiada';
        } catch (error) {
            // Sem clipboard (http fora de localhost): seleciona para Ctrl+C.
            const selecao = window.getSelection();
            const faixa = document.createRange();
            faixa.selectNodeContents(dialogo.querySelector('[data-senha]'));
            selecao.removeAllRanges();
            selecao.addRange(faixa);
            copiar.textContent = 'Use Ctrl+C';
        }
    });
}
