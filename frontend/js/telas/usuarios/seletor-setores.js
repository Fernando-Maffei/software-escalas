// Escolha dos setores PERMITIDOS de uma conta (teto de acesso imposto pelo
// backend), usada no cadastro e no painel da conta. Dois modos explicitos —
// "Todos os setores" ou "Apenas os marcados" — no lugar dos chips antigos,
// em que "nenhum marcado" queria dizer "todos" e confundia.
import { escapeHtml } from '../../lib/html-seguro.js';

let sequencia = 0;

export function renderSeletorSetores(setores, selecionados = []) {
    sequencia += 1;
    const grupo = `usr-setores-modo-${sequencia}`;
    const marcados = new Set(selecionados.map(String));
    const existentes = new Set(setores.map((setor) => setor.id));
    const removidos = [...marcados].filter((id) => !existentes.has(id)).length;
    const restrito = marcados.size > 0;

    const opcoes = setores.map((setor) => `
        <label class="usr-setor-opcao">
            <input type="checkbox" value="${escapeHtml(setor.id)}" ${marcados.has(setor.id) ? 'checked' : ''}>
            <span>${escapeHtml(setor.nome)}</span>
        </label>
    `).join('');

    return `
        <div class="usr-setores" data-seletor-setores>
            <div class="usr-setores-modo" role="radiogroup" aria-label="Alcance de setores">
                <label class="usr-modo-opcao">
                    <input type="radio" name="${grupo}" value="todos" ${restrito ? '' : 'checked'}>
                    <span><strong>Todos os setores</strong><small>Sem restricao</small></span>
                </label>
                <label class="usr-modo-opcao">
                    <input type="radio" name="${grupo}" value="restrito" ${restrito ? 'checked' : ''}>
                    <span><strong>Apenas os marcados</strong><small>A conta so ve estes setores</small></span>
                </label>
            </div>
            <div class="usr-setores-lista" data-lista ${restrito ? '' : 'hidden'}>
                ${setores.length ? `
                    <div class="usr-setores-atalhos">
                        <button type="button" class="usr-link" data-marcar="todos">Marcar todos</button>
                        <button type="button" class="usr-link" data-marcar="nenhum">Limpar</button>
                        <span class="usr-setores-contagem" data-contagem aria-live="polite"></span>
                    </div>
                    <div class="usr-setores-grade">${opcoes}</div>`
                    : '<p class="usr-aviso">Nenhum setor cadastrado ainda.</p>'}
                ${removidos ? `<p class="usr-aviso">${removidos} setor(es) que nao existem mais serao descartados ao salvar.</p>` : ''}
                <p class="usr-aviso usr-aviso-erro" data-vazio hidden>Marque ao menos um setor ou escolha "Todos os setores".</p>
            </div>
        </div>
    `;
}

/**
 * @param {Element} raiz
 * @returns {{ modo: 'todos' | 'restrito', ids: string[], valido: boolean }}
 */
export function lerSeletorSetores(raiz) {
    const restrito = raiz.querySelector('input[type="radio"][value="restrito"]')?.checked === true;
    const ids = restrito
        ? Array.from(raiz.querySelectorAll('.usr-setor-opcao input:checked')).map((caixa) => caixa.value)
        : [];

    return { modo: restrito ? 'restrito' : 'todos', ids, valido: !restrito || ids.length > 0 };
}

function atualizar(raiz) {
    const { modo, ids, valido } = lerSeletorSetores(raiz);
    const total = raiz.querySelectorAll('.usr-setor-opcao input').length;
    const lista = raiz.querySelector('[data-lista]');
    const contagem = raiz.querySelector('[data-contagem]');

    lista.hidden = modo !== 'restrito';

    if (contagem) {
        contagem.textContent = `${ids.length} de ${total} marcado(s)`;
    }

    raiz.querySelector('[data-vazio]').hidden = valido;
}

export function ligarSeletorSetores(raiz, aoMudar = () => {}) {
    const seletor = raiz.matches('[data-seletor-setores]') ? raiz : raiz.querySelector('[data-seletor-setores]');

    if (!seletor) {
        return;
    }

    seletor.addEventListener('change', () => {
        atualizar(seletor);
        aoMudar(lerSeletorSetores(seletor));
    });

    seletor.addEventListener('click', (evento) => {
        const botao = evento.target.closest('[data-marcar]');

        if (!botao) {
            return;
        }

        const marcar = botao.dataset.marcar === 'todos';
        seletor.querySelectorAll('.usr-setor-opcao input').forEach((caixa) => {
            caixa.checked = marcar;
        });
        atualizar(seletor);
        aoMudar(lerSeletorSetores(seletor));
    });

    atualizar(seletor);
}
