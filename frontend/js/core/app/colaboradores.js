import { escapeHtml } from '../../lib/html-seguro.js';
import { API } from '../api.js';
import { appContent } from '../app.js';
import { estado } from '../estado.js';
import { carregarSetores } from '../runtime/dados-e-modais.js';
import { abrirDesligadosColaboradores, abrirEditorColaborador, colaboradorEditorTemAlteracoes } from '../runtime/plantao-colaboradores/colaboradores-e-jornada.js';
import { renderListaColaboradores } from '../runtime/plantao-colaboradores/plantao-editor.js';
import { mostrarToast } from './horas-e-resumo.js';
import { atributosAcao } from '../../lib/atributos-acao.js';

let colaboradoresOffsetObserver;
let colaboradoresOffsetResizeLigado;

export function renderColaboradores() {
    appContent.innerHTML = `
        <div class="page-header colaboradores-page-header">
            <h1>Colaboradores</h1>
            <div class="colaboradores-header-actions">
                <button id="btnColaboradoresDesligados" class="btn-secondary" type="button">
                    <i class="fas fa-user-slash"></i> Desligados
                </button>
                <button id="btnNovoColaborador" class="btn-primary">
                    <i class="fas fa-plus"></i> Novo Colaborador
                </button>
            </div>
        </div>

        <div class="colaboradores-layout">
            <!-- LISTA DE COLABORADORES -->
            <div class="colaboradores-container">
                <div class="colaboradores-header">
                    <div class="search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" id="searchColaborador" placeholder="Buscar colaborador..." class="form-control">
                    </div>
                    <span class="total-colaboradores">
                        <i class="fas fa-users"></i> Total: ${estado.colaboradores.length}
                    </span>
                </div>
                
                <div id="listaColaboradores" class="colaboradores-grid"></div>
            </div>

        </div>

        <!-- Janela do cadastro, no mesmo molde da janela do dia de plantao:
             a lista fica com a largura toda e o editor abre por cima. -->
        <div id="colaboradorEditor" class="colaborador-modal" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="editorTitle">
            <div class="colaborador-modal-caixa">
                <div class="editor-header">
                    <h3><i class="fas fa-user-edit"></i> <span id="editorTitle">Novo Colaborador</span></h3>
                    <button ${atributosAcao('fecharColaboradorEditor')} class="btn-close-editor" aria-label="Fechar" title="Fechar (Esc)">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div id="colaboradorEditorContent" class="editor-form"></div>
            </div>
        </div>
    `;

    renderListaColaboradores();

    // Clique no fundo escurecido fecha como o X (com o aviso de alteracoes).
    document.getElementById('colaboradorEditor')?.addEventListener('mousedown', (event) => {
        if (event.target === event.currentTarget) {
            fecharColaboradorEditor();
        }
    });

    // Evento do botão novo colaborador
    document.getElementById('btnNovoColaborador').addEventListener('click', function() {
        abrirEditorColaborador(null);
    });

    // Evento do botão "Desligados" (soft delete / retencao / limpeza)
    const btnDesligados = document.getElementById('btnColaboradoresDesligados');
    if (btnDesligados) {
        btnDesligados.addEventListener('click', function() {
            abrirDesligadosColaboradores();
        });
    }

    // Evento de busca
    document.getElementById('searchColaborador').addEventListener('input', function(e) {
        filtrarColaboradores(e.target.value);
    });

    ajustarOffsetCabecalhoColaboradores();
}

// A barra de busca e fixa logo abaixo do cabecalho da pagina, mas os dois
// ficam em pais diferentes, entao o CSS precisava de um "top" fixo (88px)
// que nao correspondia a altura real do cabecalho (83px). A diferenca abria
// uma fresta por onde os cards apareciam ao rolar. Aqui a altura e medida e
// publicada como variavel CSS, o que tambem acompanha o cabecalho quando ele
// quebra em duas linhas em telas estreitas.
function ajustarOffsetCabecalhoColaboradores() {
    const cabecalho = document.querySelector('.colaboradores-page-header');
    const layout = document.querySelector('.colaboradores-layout');

    if (!cabecalho || !layout) {
        return;
    }

    const aplicar = () => {
        const alvo = document.querySelector('.colaboradores-page-header');
        const destino = document.querySelector('.colaboradores-layout');

        if (!alvo || !destino) {
            return;
        }

        const altura = Math.round(alvo.getBoundingClientRect().height);

        if (altura > 0) {
            // 1px de sobreposicao evita fresta por arredondamento de subpixel.
            destino.style.setProperty('--colaboradores-offset-topo', `${altura - 1}px`);
        }
    };

    aplicar();

    // A referencia do observer precisa ficar guardada: um ResizeObserver sem
    // referencia forte pode ser coletado e simplesmente parar de disparar.
    // O listener de resize cobre o caso de o observer nao estar disponivel.
    if (colaboradoresOffsetObserver) {
        colaboradoresOffsetObserver.disconnect();
    }

    if (typeof ResizeObserver === 'function') {
        colaboradoresOffsetObserver = new ResizeObserver(aplicar);
        colaboradoresOffsetObserver.observe(cabecalho);
    }

    if (!colaboradoresOffsetResizeLigado) {
        colaboradoresOffsetResizeLigado = true;
        window.addEventListener('resize', aplicar);
    }
}

// X, Cancelar, Esc e clique fora: fecham a janela, mas perguntam antes se
// houver alteracao ainda nao salva.
export function fecharColaboradorEditor() {
    if (colaboradorEditorTemAlteracoes()
        && !window.confirm('Ha alteracoes neste colaborador que ainda nao foram salvas. Fechar e descartar?')) {
        return;
    }

    esconderColaboradorEditor();
}

// Fecha sem perguntar: depois de salvar ou de desligar.
export function esconderColaboradorEditor() {
    const editorPanel = document.getElementById('colaboradorEditor');
    if (editorPanel) {
        editorPanel.style.display = 'none';
    }
}

function colaboradorEditorAberto() {
    const editorPanel = document.getElementById('colaboradorEditor');
    return Boolean(editorPanel && editorPanel.style.display !== 'none');
}

// Um ouvinte so para o modulo: a janela e recriada a cada entrada na tela.
// Com a janela de desligar aberta por cima, o Esc e dela.
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && colaboradorEditorAberto() && !document.getElementById('modalColabGeral')) {
        event.preventDefault();
        fecharColaboradorEditor();
    }
});

function filtrarColaboradores(termo) {
    if (!termo) {
        renderListaColaboradores();
        return;
    }

    const filtrados = estado.colaboradores.filter(c =>
        String(c.Nome || c.nome || '').toLowerCase().includes(termo.toLowerCase())
    );

    renderListaColaboradores(filtrados);
}

// Abre a modal #modalSenhaExclusao e resolve com a senha digitada quando o
// usuario confirma E a verificacao (options.verificar) passa; resolve com null
// se ele cancelar/fechar. Senha errada mantem a modal aberta com o erro — nada
// e apagado. Interacao autocontida: nao mexe na modal generica de confirmacao.
// Usada pela exclusao definitiva de colaborador desligado (core/runtime/plantao-colaboradores/colaboradores-e-jornada.js).
export function solicitarSenhaModal(options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalSenhaExclusao');
        const mensagem = document.getElementById('senhaExclusaoMensagem');
        const input = document.getElementById('senhaExclusaoInput');
        const erro = document.getElementById('senhaExclusaoErro');
        const btnOk = document.getElementById('confirmarSenhaExclusaoBtn');
        const btnCancelar = document.getElementById('cancelarSenhaExclusaoBtn');
        const btnFechar = document.getElementById('fecharModalSenhaExclusaoBtn');

        if (!modal || !input || !btnOk || !btnCancelar) {
            resolve(null);
            return;
        }

        if (mensagem) {
            mensagem.textContent = options.mensagem || 'Esta ação não pode ser desfeita.';
        }
        input.value = '';
        if (erro) {
            erro.textContent = ''; erro.hidden = true;
        }
        // O CSS mostra os modais via .modal.active (opacity/visibility). Sem
        // adicionar .active o modal ficava display:flex porem opacity:0 —
        // invisivel — dando a impressao de que "clicar nao faz nada".
        modal.classList.remove('hidden');
        modal.classList.add('active');
        setTimeout(() => input.focus(), 50);

        let ocupado = false;

        function limpar() {
            btnOk.removeEventListener('click', aoConfirmar);
            btnCancelar.removeEventListener('click', aoCancelar);
            if (btnFechar) {
                btnFechar.removeEventListener('click', aoCancelar);
            }
            input.removeEventListener('keydown', aoTeclar);
            modal.classList.remove('active');
            modal.classList.add('hidden');
        }

        function mostrarErro(texto) {
            if (erro) {
                erro.textContent = texto; erro.hidden = false;
            }
            input.focus();
            input.select();
        }

        async function aoConfirmar() {
            if (ocupado) {
                return;
            }
            const senha = input.value;

            if (!senha) {
                mostrarErro('Informe sua senha.');
                return;
            }

            ocupado = true;
            btnOk.disabled = true;

            try {
                if (typeof options.verificar === 'function') {
                    await options.verificar(senha);
                }
                limpar();
                btnOk.disabled = false;
                resolve(senha);
            } catch (error) {
                ocupado = false;
                btnOk.disabled = false;
                mostrarErro(error && error.status === 403
                    ? 'Senha incorreta.'
                    : (error?.message || 'Não foi possível verificar a senha.'));
            }
        }

        function aoCancelar() {
            limpar();
            resolve(null);
        }

        function aoTeclar(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                aoConfirmar();
            } else if (event.key === 'Escape') {
                aoCancelar();
            }
        }

        btnOk.addEventListener('click', aoConfirmar);
        btnCancelar.addEventListener('click', aoCancelar);
        if (btnFechar) {
            btnFechar.addEventListener('click', aoCancelar);
        }
        input.addEventListener('keydown', aoTeclar);
    });
}

/* ===========================
   CARREGAR DADOS
=========================== */
function buildSetorOptionsHtml(selectedId = null) {
    const currentSetores = Array.isArray(estado.setores) ? estado.setores : [];

    return [
        '<option value="">Selecione...</option>',
        ...currentSetores.map((setor) => `
            <option value="${setor.id}" ${Number(selectedId) === Number(setor.id) ? 'selected' : ''}>${escapeHtml(setor.nome)}</option>
        `)
    ].join('');
}

export async function adicionarSetorRapido() {
    const nome = window.prompt('Nome do novo setor:');

    if (!nome || !String(nome).trim()) {
        return;
    }

    try {
        await API.salvarSetor({ nome });
        await carregarSetores();

        const select = document.getElementById('editorSetorId');
        const setorCriado = (estado.setores || []).find((item) => item.nome.toLowerCase() === String(nome).trim().toLowerCase());

        if (select) {
            select.innerHTML = buildSetorOptionsHtml(setorCriado?.id || null);

            if (setorCriado?.id) {
                select.value = String(setorCriado.id);
            }
        }

        mostrarToast('Setor salvo com sucesso!', 'success');
    } catch (error) {
        mostrarToast(error.message || 'Erro ao salvar setor.', 'error');
    }
}
