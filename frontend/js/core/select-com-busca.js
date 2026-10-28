// Seletor de colaborador com busca: em vez de rolar uma lista longa, digita-se
// parte do nome. Aplica-se por cima de um <select> comum marcado com
// data-pesquisavel, que continua sendo a fonte da verdade: o valor, as opcoes
// desabilitadas (com o motivo no texto) e o evento 'change' sao os dele, entao
// quem ja lia o select nao muda nada.
//
// O select fica escondido so visualmente (continua focavel: o .focus() de quem
// o usava passa para a caixa de busca) e a lista e redesenhada das opcoes dele
// toda vez que abre ou que as opcoes mudam (MutationObserver) — e o caso da
// cobertura, que troca as opcoes ao buscar quem pode assumir o horario.
import { escapeHtml } from '../lib/html-seguro.js';

function normalizar(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}

function textoSelecionado(select) {
    const opcao = select.options[select.selectedIndex];
    return opcao && opcao.value ? opcao.textContent.trim() : '';
}

function aprimorar(select) {
    const caixa = document.createElement('div');
    caixa.className = 'select-busca';

    const campo = document.createElement('input');
    campo.type = 'search';
    campo.className = `select-busca-campo ${select.className}`.trim();
    campo.autocomplete = 'off';
    campo.setAttribute('role', 'combobox');
    campo.setAttribute('aria-expanded', 'false');
    campo.setAttribute('aria-label', select.getAttribute('aria-label') || 'Pesquisar colaborador');
    campo.placeholder = select.options[0] && !select.options[0].value
        ? `${select.options[0].textContent.trim()} — digite para buscar`
        : 'Digite para buscar';

    const lista = document.createElement('ul');
    lista.className = 'select-busca-lista';
    lista.setAttribute('role', 'listbox');
    lista.hidden = true;

    select.classList.add('select-busca-original');
    select.tabIndex = -1;
    select.parentNode.insertBefore(caixa, select);
    caixa.append(select, campo, lista);

    let destaque = -1;

    const opcoesVisiveis = () => {
        const termo = normalizar(campo.value === textoSelecionado(select) ? '' : campo.value);
        return [...select.options].filter((opcao) => !termo || normalizar(opcao.textContent).includes(termo));
    };

    const desenhar = () => {
        const opcoes = opcoesVisiveis();
        destaque = Math.min(destaque, opcoes.length - 1);

        lista.innerHTML = opcoes.length
            ? opcoes.map((opcao, indice) => `
                <li role="option" data-valor="${escapeHtml(opcao.value)}"
                    class="${opcao.disabled ? 'is-desabilitada' : ''}${indice === destaque ? ' is-destaque' : ''}${opcao.value === select.value ? ' is-selecionada' : ''}"
                    aria-disabled="${opcao.disabled ? 'true' : 'false'}" aria-selected="${opcao.value === select.value ? 'true' : 'false'}">
                    ${escapeHtml(opcao.textContent.trim())}
                </li>`).join('')
            : '<li class="select-busca-vazio">Ninguem com esse nome.</li>';
    };

    const mostrarSelecionado = () => {
        campo.value = textoSelecionado(select);
    };

    const abrir = () => {
        if (!lista.hidden) {
            return;
        }

        // Quem ja ouvia o foco do select (ex.: a cobertura busca a
        // disponibilidade) continua sendo avisado.
        select.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        destaque = -1;
        lista.hidden = false;
        campo.setAttribute('aria-expanded', 'true');
        desenhar();
    };

    const fechar = () => {
        lista.hidden = true;
        campo.setAttribute('aria-expanded', 'false');
        mostrarSelecionado();
    };

    const escolher = (valor) => {
        const opcao = [...select.options].find((item) => item.value === valor);

        if (!opcao || opcao.disabled) {
            return;
        }

        select.value = valor;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        fechar();
    };

    // O foco so seleciona o texto: as telas poem o foco no campo ao abrir (ex.:
    // o editor do plantao), e a lista abrindo sozinha cobria a janela. Ela
    // abre no clique, ao digitar ou com a seta para baixo.
    campo.addEventListener('focus', () => campo.select());
    campo.addEventListener('click', abrir);
    campo.addEventListener('input', () => {
        destaque = 0;
        abrir();
        desenhar();
    });
    campo.addEventListener('blur', () => setTimeout(fechar, 0));

    campo.addEventListener('keydown', (evento) => {
        const opcoes = opcoesVisiveis();

        if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
            evento.preventDefault();
            abrir();
            const passo = evento.key === 'ArrowDown' ? 1 : -1;
            destaque = Math.max(0, Math.min(opcoes.length - 1, destaque + passo));
            desenhar();
        } else if (evento.key === 'Enter') {
            if (!lista.hidden && opcoes[destaque]) {
                evento.preventDefault();
                escolher(opcoes[destaque].value);
            } else {
                // Lista fechada: o Enter e de quem ouvia o select (ex.: o
                // editor do plantao adiciona a linha).
                select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
                evento.preventDefault();
            }
        } else if (evento.key === 'Escape' && !lista.hidden) {
            // So fecha a lista; a janela em volta continua aberta.
            evento.preventDefault();
            evento.stopPropagation();
            fechar();
        }
    });

    // mousedown, e nao click: o blur do campo fecharia a lista antes.
    lista.addEventListener('mousedown', (evento) => {
        evento.preventDefault();
        const item = evento.target.closest('[data-valor]');

        if (item) {
            escolher(item.dataset.valor);
        }
    });

    select.addEventListener('focus', () => campo.focus());
    select.addEventListener('change', mostrarSelecionado);
    new MutationObserver(() => {
        if (lista.hidden) {
            mostrarSelecionado();
        } else {
            desenhar();
        }
    }).observe(select, { childList: true, subtree: true, attributes: true });

    mostrarSelecionado();
}

// Aplica a busca em todo select[data-pesquisavel] dentro de `raiz` que ainda
// nao a tem. Chamado depois de cada render que cria esses selects.
export function aplicarBuscaNosSelects(raiz = document) {
    raiz.querySelectorAll('select[data-pesquisavel]:not(.select-busca-original)').forEach(aprimorar);
}
