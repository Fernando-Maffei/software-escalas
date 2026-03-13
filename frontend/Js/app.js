let ausencias = [];
let colaboradores = [];
let editandoId = null;
let editandoAusenciaId = null;
let plantoesLancados = [];
let feriadosLocais = []
let editandoFeriadoId = null;
let exclusaoPendenteId = null;
let exclusaoTipo = 'ausencia';


// EXPOR FUNÇÕES GLOBAIS (já está correto)
window.carregarPagina = carregarPagina;
window.abrirModalHorario = abrirModalHorario;
window.debugTiposAusencias = debugTiposAusencias;
window.debugDados = debugDados;
window.atualizarTudo = atualizarTudo;
window.testarAtualizacao = testarAtualizacao;
window.ausencias = ausencias;
window.colaboradores = colaboradores;
window.feriadosLocais = feriadosLocais;
window.editarFeriado = editarFeriado;
window.excluirFeriado = excluirFeriado;
window.gerarRelatorioCompleto = gerarRelatorioCompleto;
window.toggleCamposHora = toggleCamposHora;

// Substituir as funções antigas de abrir modal
window.abrirModalAusencia = function(dataISO) {
    window.abrirModalLancamento('pessoal', dataISO);
};
window.abrirModalFeriado = function(dataISO) {
    window.abrirModalLancamento('feriados', dataISO);
};


// Elemento principal onde o conteúdo será renderizado
const appContent = document.getElementById("appContent");
document.addEventListener("DOMContentLoaded", async () => {
    console.log("Inicializando aplicação...");
    
    const temaSalvo = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaSalvo);

    try {
        await carregarColaboradores();
        console.log("Colaboradores carregados:", colaboradores.length);
        
        await carregarAusencias();
        console.log("Ausências carregadas:", ausencias.length);
        
        await carregarFeriadosLocais();
        console.log("Feriados locais carregados:", feriadosLocais.length);
        
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        mostrarToast("Erro ao carregar dados do servidor", "error");
    }
    
    configurarNavegacao();
    configurarModais();
    configurarObservers();
    renderDashboard();


    setTimeout(() => {
            if (typeof window.setActiveButton === 'function') {
                window.setActiveButton('dashboard');
            }
        }, 100);
});



async function testarConexaoBackend() {
    console.log("🔍 Testando conexão com Supabase...");
    
    try {
        const colaboradores = await API.getColaboradores();
        console.log(`✅ Colaboradores: ${colaboradores.length} registros`);
        
        const ausencias = await API.getAusencias();
        console.log(`✅ Ausências: ${ausencias.length} registros`);
        
        const feriados = await API.getFeriados();
        console.log(`✅ Feriados: ${feriados.length} registros`);
        
        const plantoes = await API.getPlantoes();
        console.log(`✅ Plantões: ${plantoes.length} registros`);
        
        console.log("🎉 Todos os sistemas estão funcionando!");
        
    } catch (error) {
        console.error("❌ Erro na conexão com Supabase:", error);
    }
}

window.testarConexaoBackend = testarConexaoBackend;

window.testarConexaoBackend = testarConexaoBackend;


/* ===========================
   CONFIGURAÇÃO DE MODAIS
=========================== */
function configurarModais() {
    console.log("Configurando modais...");
    
    // Botão de lançamento ajuste (delegação de eventos)
    document.addEventListener('click', function(e) {
        if (e.target.id === 'btnLancamentoAjuste' || e.target.closest('#btnLancamentoAjuste')) {
            e.preventDefault();
            abrirModalAusencia();
        }
    });
    
    // Fechar modal de lançamento (botão X)
    const fecharModalBtn = document.getElementById('fecharModalBtn');
    if (fecharModalBtn) {
        fecharModalBtn.addEventListener('click', function() {
            fecharModal('modal');
        });
    }
    
    // Fechar modal de horário (botão X)
    const fecharModalHorarioBtn = document.getElementById('fecharModalHorarioBtn');
    if (fecharModalHorarioBtn) {
        fecharModalHorarioBtn.addEventListener('click', function() {
            fecharModal('modalHorario');
        });
    }
    
    // Fechar modal de horário (botão Cancelar)
    const fecharModalHorarioBtn2 = document.getElementById('fecharModalHorarioBtn2');
    if (fecharModalHorarioBtn2) {
        fecharModalHorarioBtn2.addEventListener('click', function() {
            fecharModal('modalHorario');
        });
    }
    
    // Fechar ao clicar fora do modal
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
            e.target.classList.remove('active');
        }
    });
    
    // Botão salvar ausência
    const salvarAusenciaBtn = document.getElementById('salvarAusenciaBtn');
    if (salvarAusenciaBtn) {
        salvarAusenciaBtn.addEventListener('click', salvarAusencia);
    }
    
    // Botão cancelar edição
    const cancelarEdicaoBtn = document.getElementById('cancelarEdicaoLancamentoBtn');
    if (cancelarEdicaoBtn) {
        cancelarEdicaoBtn.addEventListener('click', cancelarEdicaoAusencia);
    }
}

// Função para fechar modal
function fecharModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('active');
    }
}

let dataSelecionada = null;

/* ===========================
   FUNÇÕES DE AUSÊNCIA
=========================== */
function abrirModalAusencia(dataISO = null) {
    console.log("Abrindo modal de ausência...", dataISO);
    
    const modal = document.getElementById("modal");
    if (!modal) {
        console.error("Modal não encontrado!");
        return;
    }
    
    // Armazena a data selecionada (agora usado APENAS para referência)
    dataSelecionada = dataISO;
    
    // MOSTRA APENAS O LOADING, ESCONDE OS OUTROS
    document.getElementById("loadingAusencias").classList.remove("hidden");
    document.getElementById("emptyAusencias").classList.add("hidden");
    document.getElementById("listaAusencias").classList.add("hidden");
    
    // Limpa formulário
    document.getElementById("colaboradorSelect").value = "";
    document.getElementById("tipoSelect").value = "folga";
    
    // 🔥 Preenche a data se fornecida (apenas como sugestão, usuário pode alterar)
    if (dataISO) {
        // Se a data veio no formato ISO (YYYY-MM-DD), usa direto
        let dataFormatada = dataISO;
        
        // Verifica se é uma data válida no formato ISO
        if (dataISO.includes('T')) {
            dataFormatada = dataISO.split('T')[0];
        }
        
        console.log("Data sugerida para input:", dataFormatada);
        
        document.getElementById("dataInicio").value = dataFormatada;
        document.getElementById("dataFim").value = dataFormatada;
    } else {
        document.getElementById("dataInicio").value = "";
        document.getElementById("dataFim").value = "";
    }
    
    // Reseta modo de edição
    editandoAusenciaId = null;
    document.getElementById("salvarAusenciaBtn").innerHTML = '<i class="fas fa-save"></i> Salvar';
    document.getElementById("cancelarEdicaoLancamentoBtn").classList.add("hidden");
    
    // Carrega colaboradores no select
    carregarColaboradoresNoSelect();
    
    // Carrega listagem de ausências APENAS DO DIA SELECIONADO (para mostrar lançamentos existentes)
    carregarAusenciasDoDia(dataISO);
    
    // Abre o modal
    modal.classList.remove("hidden");
    modal.classList.add("active");
}

// Função para abrir modal de horário
function abrirModalHorario(colaborador) {
    console.log("Abrindo modal de horário...");
    
    const modal = document.getElementById("modalHorario");
    if (!modal) {
        console.error("Modal de horário não encontrado!");
        return;
    }
    
    window.colaboradorEditando = colaborador.Id;
    
    const modalNome = document.getElementById("modalNome");
    const trabInicio = document.getElementById("modalTrabInicio");
    const trabFim = document.getElementById("modalTrabFim");
    const almInicio = document.getElementById("modalAlmInicio");
    const almFim = document.getElementById("modalAlmFim");
    
    if (modalNome) modalNome.innerText = colaborador.Nome;
    if (trabInicio) trabInicio.value = formatarHora(colaborador.TrabalhoInicio);
    if (trabFim) trabFim.value = formatarHora(colaborador.TrabalhoFim);
    if (almInicio) almInicio.value = formatarHora(colaborador.AlmocoInicio);
    if (almFim) almFim.value = formatarHora(colaborador.AlmocoFim);
    
    modal.classList.remove("hidden");
    modal.classList.add("active");
}



// Função para salvar ausência

async function salvarAusencia(tipo, dataInicio, dataFim) {
    const colaboradorId = document.getElementById("colaboradorSelect").value;
    const periodoTipo = document.getElementById("periodoTipo").value;
    const horaInicio = document.getElementById("horaInicio").value;
    const horaFim = document.getElementById("horaFim").value;
    
    console.log("Preparando dados para salvar:", {
        colaboradorId, tipo, dataInicio, dataFim, periodoTipo, horaInicio, horaFim
    });
    
    if (!colaboradorId) {
        throw new Error("Selecione um colaborador");
    }
    
    if (periodoTipo === 'horas') {
        if (!horaInicio || !horaFim) {
            throw new Error("Preencha as horas de início e fim");
        }
        if (horaFim <= horaInicio) {
            throw new Error("Hora fim deve ser maior que hora início");
        }
    }
    
    const dados = {
        colaboradorId: parseInt(colaboradorId),
        tipo: tipo,
        dataInicio: dataInicio,
        dataFim: dataFim,
        periodoTipo: periodoTipo
    };
    
    if (periodoTipo === 'horas') {
        dados.horaInicio = horaInicio;
        dados.horaFim = horaFim;
    }
    
    try {
        const resultado = await API.salvarAusencia(dados);
        console.log("✅ Ausência salva:", resultado);
        return resultado;
    } catch (error) {
        console.error("❌ Erro ao salvar ausência:", error);
        throw error;
    }
}


// Função para cancelar edição
function cancelarEdicaoAusencia() {
    editandoAusenciaId = null;
    
    const colaboradorSelect = document.getElementById("colaboradorSelect");
    const tipoSelect = document.getElementById("tipoSelect");
    const dataInicio = document.getElementById("dataInicio");
    const dataFim = document.getElementById("dataFim");
    const salvarBtn = document.getElementById("salvarAusenciaBtn");
    const cancelarBtn = document.getElementById("cancelarEdicaoLancamentoBtn");
    
    if (colaboradorSelect) colaboradorSelect.value = "";
    if (tipoSelect) tipoSelect.value = "folga";
    if (dataInicio) dataInicio.value = "";
    if (dataFim) dataFim.value = "";
    if (salvarBtn) salvarBtn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    if (cancelarBtn) cancelarBtn.classList.add("hidden");
}

// Carrega colaboradores no select
function carregarColaboradoresNoSelect() {
    const select = document.getElementById("colaboradorSelect");
    if (!select) return;
    
    select.innerHTML = '<option value="">Selecione um colaborador</option>';
    
    if (colaboradores && colaboradores.length > 0) {
        colaboradores.forEach(c => {
            select.innerHTML += `<option value="${c.Id}">${c.Nome}</option>`;
        });
    }
}




// Atualize a função configurarModais para incluir o novo modal
function configurarModais() {
    console.log("Configurando modais...");
    
    // Botão de lançamento ajuste
    document.addEventListener('click', function(e) {
        if (e.target.id === 'btnLancamentoAjuste' || e.target.closest('#btnLancamentoAjuste')) {
            e.preventDefault();
            abrirModalAusencia();
        }
    });
    
    // Fechar modal de lançamento (botão X)
    const fecharModalBtn = document.getElementById('fecharModalBtn');
    if (fecharModalBtn) {
        fecharModalBtn.addEventListener('click', function() {
            fecharModal('modal');
        });
    }
    
    // Fechar modal de confirmação (botão X)
    const fecharModalConfirmacaoBtn = document.getElementById('fecharModalConfirmacaoBtn');
    if (fecharModalConfirmacaoBtn) {
        fecharModalConfirmacaoBtn.addEventListener('click', function() {
            fecharModal('modalConfirmacao');
            exclusaoPendenteId = null;
        });
    }
    
    // Cancelar exclusão (botão Cancelar)
    const cancelarExclusaoBtn = document.getElementById('cancelarExclusaoBtn');
    if (cancelarExclusaoBtn) {
        cancelarExclusaoBtn.addEventListener('click', function() {
            fecharModal('modalConfirmacao');
            exclusaoPendenteId = null;
        });
    }
    
    // Confirmar exclusão
    const confirmarExclusaoBtn = document.getElementById('confirmarExclusaoBtn');
    if (confirmarExclusaoBtn) {
        confirmarExclusaoBtn.addEventListener('click', confirmarExclusao);
    }
    
    // Fechar modal de horário (botão X)
    const fecharModalHorarioBtn = document.getElementById('fecharModalHorarioBtn');
    if (fecharModalHorarioBtn) {
        fecharModalHorarioBtn.addEventListener('click', function() {
            fecharModal('modalHorario');
        });
    }
    
    // Fechar modal de horário (botão Cancelar)
    const fecharModalHorarioBtn2 = document.getElementById('fecharModalHorarioBtn2');
    if (fecharModalHorarioBtn2) {
        fecharModalHorarioBtn2.addEventListener('click', function() {
            fecharModal('modalHorario');
        });
    }
    
    // Fechar ao clicar fora do modal
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
            e.target.classList.remove('active');
            if (e.target.id === 'modalConfirmacao') {
                exclusaoPendenteId = null;
            }
        }
    });
    
    // Botão salvar ausência
    const salvarAusenciaBtn = document.getElementById('salvarAusenciaBtn');
    if (salvarAusenciaBtn) {
        salvarAusenciaBtn.addEventListener('click', salvarAusencia);
    }
    
    // Botão cancelar edição
    const cancelarEdicaoBtn = document.getElementById('cancelarEdicaoLancamentoBtn');
    if (cancelarEdicaoBtn) {
        cancelarEdicaoBtn.addEventListener('click', cancelarEdicaoAusencia);
    }
}


async function confirmarExclusao() {
    console.log("🔍 Confirmando exclusão:", { 
        id: exclusaoPendenteId, 
        tipo: exclusaoTipo 
    });
    
    if (!exclusaoPendenteId) {
        console.error("Nenhum ID pendente");
        fecharModal('modalConfirmacao');
        return;
    }
    
    try {
        if (exclusaoTipo === 'feriado') {
            await API.excluirFeriado(exclusaoPendenteId);
        } else {
            await API.excluirAusencia(exclusaoPendenteId);
        }
        
        // Recarregar dados
        await atualizarTudo();
        
        // Fechar modal e resetar
        fecharModal('modalConfirmacao');
        exclusaoPendenteId = null;
        exclusaoTipo = 'ausencia';
        
        mostrarToast("✅ Excluído com sucesso!", "success");
        
        // Se o modal de lançamento estiver aberto, recarregar listagens
        const modalLancamento = document.getElementById("modalLancamento");
        if (modalLancamento && !modalLancamento.classList.contains('hidden')) {
            if (typeof carregarListagens === 'function') {
                await carregarListagens();
            }
        }
        
    } catch (error) {
        console.error("❌ Erro ao excluir:", error);
        mostrarToast(`❌ Erro ao excluir: ${error.message}`, "error");
        fecharModal('modalConfirmacao');
    }
}
/* ===========================
   NAVEGAÇÃO
=========================== */
function configurarNavegacao() {
   console.log('Navegação configurada');
}

function carregarPagina(pagina) {
    console.log('Carregando página:', pagina);
    
    if (!appContent) return;
    
    // 🔥 NOVO: Atualiza a URL sem recarregar a página
    window.location.hash = pagina;
    
    // Atualiza o botão ativo na sidebar
    if (typeof window.setActiveButton === 'function') {
        window.setActiveButton(pagina);
    }
    
    // Parar atualização automática do dashboard se estiver saindo dele
    if (pagina !== 'dashboard' && typeof window.pararAtualizacaoAutomatica === 'function') {
        window.pararAtualizacaoAutomatica();
    }
    
    switch (pagina) {
        case "dashboard":
            renderDashboard();
            break;
        case "calendario":
            renderCalendario();
            break;
        case "colaboradores":
            renderColaboradores();
            break;
        case "escala":
            renderEscalaDia();
            break;
        case "lancamentoPlantao":
            renderLancamentoPlantao();
            break;
        case "configuracoes":
            renderConfiguracoes();
            break;
        case "relatorios":
            renderRelatorios();
            break;
        default:
            console.log("Página não encontrada:", pagina);
            renderDashboard(); // Fallback para dashboard
    }
}


/* ===========================
   TELA COLABORADORES
=========================== */
function renderColaboradores() {
    appContent.innerHTML = `
        <div class="page-header">
            <h1>Colaboradores</h1>
            <button id="btnNovoColaborador" class="btn-primary">
                <i class="fas fa-plus"></i> Novo Colaborador
            </button>
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
                        <i class="fas fa-users"></i> Total: ${colaboradores.length}
                    </span>
                </div>
                
                <div id="listaColaboradores" class="colaboradores-grid"></div>
            </div>

            <!-- PAINEL LATERAL DE EDIÇÃO (sempre visível quando aberto) -->
            <div id="colaboradorEditor" class="editor-sidebar" style="display: none;">
                <div class="editor-content" style="opacity: 1; visibility: visible;">
                    <div class="editor-header">
                        <h3><i class="fas fa-user-edit"></i> <span id="editorTitle">Novo Colaborador</span></h3>
                        <button onclick="fecharColaboradorEditor()" class="btn-close-editor">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div id="colaboradorEditorContent" class="editor-form"></div>
                </div>
            </div>
        </div>
    `;

    renderListaColaboradores();
    
    // Evento do botão novo colaborador
    document.getElementById('btnNovoColaborador').addEventListener('click', function() {
        abrirEditorColaborador(null);
    });
    
    // Evento de busca
    document.getElementById('searchColaborador').addEventListener('input', function(e) {
        filtrarColaboradores(e.target.value);
    });
}

function configurarToggleColaborador() {
    const sidebar = document.getElementById('colaboradorEditor');
    const toggleBtn = document.getElementById('toggleColaboradorEditor');
    const toggleIcon = document.getElementById('toggleColaboradorIcon');

    if (!sidebar || !toggleBtn) return;

    // Remove eventos anteriores
    toggleBtn.replaceWith(toggleBtn.cloneNode(true));
    
    // Pega os elementos novamente
    const newToggleBtn = document.getElementById('toggleColaboradorEditor');
    const newToggleIcon = document.getElementById('toggleColaboradorIcon');

    newToggleBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        sidebar.classList.toggle('collapsed');
        
        if (sidebar.classList.contains('collapsed')) {
            newToggleIcon.className = 'fas fa-chevron-left';
        } else {
            newToggleIcon.className = 'fas fa-chevron-right';
        }
    });
}

function renderEditorForm(colaborador = null) {
    const isEditing = colaborador !== null;
    const colaboradorId = colaborador ? colaborador.Id : 'null';
    
    return `
        <div class="editor-colaborador">
            <div class="editor-form-group">
                <label><i class="fas fa-user"></i> Nome</label>
                <input type="text" id="editorNome" value="${colaborador?.Nome?.replace(/"/g, '&quot;') || ''}" placeholder="Nome completo" class="form-control">
            </div>
            
            <div class="editor-form-group">
                <label><i class="fas fa-briefcase"></i> Trabalho</label>
                <div class="time-inputs">
                    <input type="time" id="editorTrabInicio" value="${formatarHora(colaborador?.TrabalhoInicio) || ''}" class="form-control">
                    <span>até</span>
                    <input type="time" id="editorTrabFim" value="${formatarHora(colaborador?.TrabalhoFim) || ''}" class="form-control">
                </div>
            </div>
            
            <div class="editor-form-group">
                <label><i class="fas fa-utensils"></i> Almoço</label>
                <div class="time-inputs">
                    <input type="time" id="editorAlmInicio" value="${formatarHora(colaborador?.AlmocoInicio) || ''}" class="form-control">
                    <span>até</span>
                    <input type="time" id="editorAlmFim" value="${formatarHora(colaborador?.AlmocoFim) || ''}" class="form-control">
                </div>
            </div>
            
            <div class="editor-actions">
                <button onclick="salvarColaboradorEditor(${colaboradorId})" class="btn-primary">
                    <i class="fas fa-save"></i> ${isEditing ? 'Atualizar' : 'Salvar'}
                </button>
                <button onclick="fecharColaboradorEditor()" class="btn-secondary">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
            
            ${isEditing ? `
                <div class="editor-footer">
                    <button onclick="excluirColaborador(${colaborador.Id})" class="btn-danger" style="width: 100%;">
                        <i class="fas fa-trash"></i> Excluir Colaborador
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

function configurarColaboradorEditor() {
    const sidebar = document.getElementById('colaboradorEditor');
    const toggleBtn = document.getElementById('toggleColaboradorEditor');
    const toggleIcon = document.getElementById('toggleColaboradorIcon');

    if (!sidebar || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        
        if (sidebar.classList.contains('collapsed')) {
            toggleIcon.className = 'fas fa-chevron-left';
        } else {
            toggleIcon.className = 'fas fa-chevron-right';
        }
    });
}

function abrirEditorColaboradores(id) {
    console.log("Abrindo editor para ID:", id);
    
    const colaborador = id ? colaboradores.find(c => c.Id === id) : null;
    
    const editorPanel = document.getElementById('colaboradorEditor');
    const editorTitle = document.getElementById('editorTitle');
    const editorContent = document.getElementById('colaboradorEditorContent');
    
    console.log("Elementos encontrados:", { 
        editorPanel: !!editorPanel, 
        editorTitle: !!editorTitle, 
        editorContent: !!editorContent 
    });
    
    if (!editorPanel || !editorTitle || !editorContent) {
        console.error("Elementos do editor não encontrados!");
        return;
    }
    
    // Mostra o painel
    editorPanel.style.display = 'block';
    console.log("Painel exibido, display =", editorPanel.style.display);
    
    // Atualiza o título
    editorTitle.innerText = colaborador ? 'Editar Colaborador' : 'Novo Colaborador';
    
    // Gera o formulário
    let formHtml = '';
    
    if (colaborador) {
        formHtml = `
            <div class="editor-colaborador">
                <div class="editor-form-group">
                    <label><i class="fas fa-user"></i> Nome</label>
                    <input type="text" id="editorNome" value="${colaborador.Nome || ''}" placeholder="Nome completo" class="form-control">
                </div>
                
                <div class="editor-form-group">
                    <label><i class="fas fa-briefcase"></i> Trabalho</label>
                    <div class="time-inputs">
                        <input type="time" id="editorTrabInicio" value="${formatarHora(colaborador.TrabalhoInicio) || ''}" class="form-control">
                        <span>até</span>
                        <input type="time" id="editorTrabFim" value="${formatarHora(colaborador.TrabalhoFim) || ''}" class="form-control">
                    </div>
                </div>
                
                <div class="editor-form-group">
                    <label><i class="fas fa-utensils"></i> Almoço</label>
                    <div class="time-inputs">
                        <input type="time" id="editorAlmInicio" value="${formatarHora(colaborador.AlmocoInicio) || ''}" class="form-control">
                        <span>até</span>
                        <input type="time" id="editorAlmFim" value="${formatarHora(colaborador.AlmocoFim) || ''}" class="form-control">
                    </div>
                </div>
                
                <div class="editor-actions">
                    <button onclick="salvarColaboradorEditor(${colaborador.Id})" class="btn-primary">
                        <i class="fas fa-save"></i> Atualizar
                    </button>
                    <button onclick="fecharColaboradorEditor()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
                
                <div class="editor-footer">
                    <button onclick="excluirColaborador(${colaborador.Id})" class="btn-danger" style="width: 100%;">
                        <i class="fas fa-trash"></i> Excluir Colaborador
                    </button>
                </div>
            </div>
        `;
    } else {
        formHtml = `
            <div class="editor-colaborador">
                <div class="editor-form-group">
                    <label><i class="fas fa-user"></i> Nome</label>
                    <input type="text" id="editorNome" placeholder="Nome completo" class="form-control">
                </div>
                
                <div class="editor-form-group">
                    <label><i class="fas fa-briefcase"></i> Trabalho</label>
                    <div class="time-inputs">
                        <input type="time" id="editorTrabInicio" class="form-control">
                        <span>até</span>
                        <input type="time" id="editorTrabFim" class="form-control">
                    </div>
                </div>
                
                <div class="editor-form-group">
                    <label><i class="fas fa-utensils"></i> Almoço</label>
                    <div class="time-inputs">
                        <input type="time" id="editorAlmInicio" class="form-control">
                        <span>até</span>
                        <input type="time" id="editorAlmFim" class="form-control">
                    </div>
                </div>
                
                <div class="editor-actions">
                    <button onclick="salvarColaboradorEditor(null)" class="btn-primary">
                        <i class="fas fa-save"></i> Salvar
                    </button>
                    <button onclick="fecharColaboradorEditor()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
            </div>
        `;
    }
    
    editorContent.innerHTML = formHtml;
    console.log("Formulário renderizado");
    
    // Armazena o ID para edição
    if (colaborador) {
        editandoId = colaborador.Id;
    } else {
        editandoId = null;
    }
}


function fecharColaboradorEditor() {
    const editorPanel = document.getElementById('colaboradorEditor');
    if (editorPanel) {
        editorPanel.style.display = 'none';
    }
    editandoId = null;
}

async function salvarColaboradorEditor(id) {
    console.log("Salvando colaborador ID:", id);
    
    const nome = document.getElementById('editorNome')?.value;
    const trabalhoInicio = document.getElementById('editorTrabInicio')?.value;
    const trabalhoFim = document.getElementById('editorTrabFim')?.value;
    const almocoInicio = document.getElementById('editorAlmInicio')?.value;
    const almocoFim = document.getElementById('editorAlmFim')?.value;

    if (!nome) {
        mostrarToast("Nome é obrigatório!", "error");
        return;
    }

    try {
        const dados = {
            nome,
            trabalhoInicio,
            trabalhoFim,
            almocoInicio,
            almocoFim
        };
        
        if (id) {
            dados.id = id;
        }
        
        await API.salvarColaborador(dados);

        await carregarColaboradores();
        renderListaColaboradores();
        fecharColaboradorEditor();
        
        mostrarToast(
            id ? "✅ Colaborador atualizado!" : "✅ Colaborador salvo com sucesso!", 
            "success"
        );
        
    } catch (error) {
        console.error("Erro ao salvar:", error);
        mostrarToast("❌ Erro ao salvar colaborador", "error");
    }
}

function filtrarColaboradores(termo) {
    if (!termo) {
        renderListaColaboradores();
        return;
    }
    
    const filtrados = colaboradores.filter(c => 
        c.Nome.toLowerCase().includes(termo.toLowerCase())
    );
    
    renderListaColaboradores(filtrados);
}

function cancelarEdicao() {
    editandoId = null;
    renderColaboradores();
}

async function salvarNovoColaborador() {
    const nome = document.getElementById("novoNome")?.value;
    const trabalhoInicio = document.getElementById("novoTrabInicio")?.value;
    const trabalhoFim = document.getElementById("novoTrabFim")?.value;
    const almocoInicio = document.getElementById("novoAlmInicio")?.value;
    const almocoFim = document.getElementById("novoAlmFim")?.value;

    if (!nome) {
        mostrarToast("Nome é obrigatório!", "error");
        return;
    }

    try {
        const metodo = editandoId ? "PUT" : "POST";
        const url = editandoId 
            ? `http://localhost:3000/api/colaboradores/${editandoId}`
            : `http://localhost:3000/api/colaboradores`;

        const response = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome,
                trabalhoInicio,
                trabalhoFim,
                almocoInicio,
                almocoFim
            })
        });

        if (!response.ok) throw new Error("Erro ao salvar");

        editandoId = null;
        await carregarColaboradores();
        renderColaboradores();
        mostrarToast("Colaborador salvo com sucesso!", "success");
        
    } catch (error) {
        console.error("Erro ao salvar:", error);
        mostrarToast("Erro ao salvar colaborador", "error");
    }
}

function renderListaColaboradores(lista = colaboradores) {
    const container = document.getElementById("listaColaboradores");
    if (!container) return;

    if (!lista || lista.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>Nenhum colaborador encontrado</p>
                <small>Clique em "Novo Colaborador" para adicionar</small>
            </div>
        `;
        return;
    }

    container.innerHTML = "";

    lista.forEach(c => {
        const card = document.createElement("div");
        card.className = "colaborador-card";
        card.style.cursor = "pointer";
        
        card.onclick = function(e) {
            e.preventDefault();
            abrirEditorColaboradores(c.Id);
        };

        card.innerHTML = `
            <div class="colaborador-avatar">
                ${c.Nome?.charAt(0) || '?'}
            </div>
            <div class="colaborador-info">
                <h4 class="colaborador-nome">${c.Nome || 'Sem nome'}</h4>
                <div class="colaborador-horarios">
                    <span class="horario-tag">
                        <i class="fas fa-briefcase"></i> ${formatarHora(c.TrabalhoInicio)} - ${formatarHora(c.TrabalhoFim)}
                    </span>
                    <span class="horario-tag">
                        <i class="fas fa-utensils"></i> ${formatarHora(c.AlmocoInicio)} - ${formatarHora(c.AlmocoFim)}
                    </span>
                </div>
            </div>
            <div class="colaborador-edit-indicator">
                <i class="fas fa-chevron-right"></i>
            </div>
        `;

        container.appendChild(card);
    });
}

function editarColaborador(id) {
    const c = colaboradores.find(x => x.Id === id);
    if (!c) return;

    editandoId = id;
    renderColaboradores();

    setTimeout(() => {
        document.getElementById("novoNome").value = c.Nome || '';
        document.getElementById("novoTrabInicio").value = formatarHora(c.TrabalhoInicio);
        document.getElementById("novoTrabFim").value = formatarHora(c.TrabalhoFim);
        document.getElementById("novoAlmInicio").value = formatarHora(c.AlmocoInicio);
        document.getElementById("novoAlmFim").value = formatarHora(c.AlmocoFim);
    }, 100);
}

async function excluirColaborador(id) {
    if (!confirm("Tem certeza que deseja excluir este colaborador?")) return;

    try {
        await API.excluirColaborador(id);
        
        await carregarColaboradores();
        renderListaColaboradores();
        mostrarToast("✅ Colaborador excluído com sucesso!", "success");
        
    } catch (error) {
        console.error("Erro ao excluir:", error);
        mostrarToast("❌ Erro ao excluir colaborador", "error");
    }
}

/* ===========================
   CARREGAR DADOS
=========================== */
async function carregarColaboradores() {
    try {
        console.log("Carregando colaboradores do Supabase...");
        const data = await API.getColaboradores();
        colaboradores = Array.isArray(data) ? data : [];
        window.colaboradores = colaboradores;
        console.log(`✅ Colaboradores carregados: ${colaboradores.length}`);
        return colaboradores;
    } catch (error) {
        console.error("❌ Erro ao carregar colaboradores:", error);
        colaboradores = [];
        window.colaboradores = [];
        mostrarToast("Erro ao carregar colaboradores", "error");
        return [];
    }
}

async function carregarAusencias() {
    try {
        console.log("📥 Carregando ausências do Supabase...");
        const data = await API.getAusencias();
        
        window.ausencias = data || [];
        ausencias = window.ausencias;
        
        console.log(`✅ Ausências carregadas: ${ausencias.length}`);
        return ausencias;
    } catch (error) {
        console.error("❌ Erro ao carregar ausências:", error);
        window.ausencias = [];
        ausencias = [];
        mostrarToast("Erro ao carregar ausências", "error");
        return [];
    }
}
async function carregarFeriadosLocais() {
    try {
        console.log("📅 Carregando feriados do Supabase...");
        const data = await API.getFeriados();
        
        feriadosLocais = Array.isArray(data) ? data : [];
        window.feriadosLocais = feriadosLocais;
        
        console.log(`✅ Feriados locais carregados: ${feriadosLocais.length}`);
        return feriadosLocais;
    } catch (error) {
        console.error("❌ Erro ao carregar feriados locais:", error);
        feriadosLocais = [];
        window.feriadosLocais = [];
        mostrarToast("Erro ao carregar feriados", "error");
        return [];
    }
}
/* ===========================
   TELA ESCALA DO DIA
=========================== */
async function renderEscalaDia() {
    await carregarColaboradores();
    await carregarAusencias();

    const hoje = new Date();
    const dataHoje = hoje.toISOString().split('T')[0];
    
    // Salvar a data atual no escopo global para a timeline
    window.dataEscalaSelecionada = dataHoje;

    appContent.innerHTML = `
        <div class="page-header">
            <div>
                <h1>Escala do Dia</h1>
                <div class="data-selector">
                    <i class="fas fa-calendar-alt"></i>
                    <input type="date" id="seletorDataEscala" value="${dataHoje}" class="form-control">
                    <button id="btnCarregarEscala" class="btn-primary">
                        <i class="fas fa-search"></i> Ver Escala
                    </button>
                </div>
            </div>
            <div class="legenda-timeline">
                <span class="legenda-item"><span class="cor trabalhando"></span> Trabalhando</span>
                <span class="legenda-item"><span class="cor almoco"></span> Almoço</span>
                <span class="legenda-item"><span class="cor folga"></span> Folga</span>
                <span class="legenda-item"><span class="cor ferias"></span> Férias</span>
                <span class="legenda-item"><span class="cor ausencia-parcial"></span> Ausência Parcial</span>
                <span class="legenda-item"><span class="cor fora"></span> Fora</span>
            </div>
        </div>

        <div class="escala-layout">
            <div class="timeline-container">
                <div class="timeline-header" id="timelineHeader"></div>
                <div id="timelineBody" class="timeline-body"></div>
            </div>

            <div id="sidebarEditor" class="editor-sidebar collapsed">
                <div class="editor-toggle" id="toggleEditor">
                    <i class="fas fa-chevron-left" id="toggleIcon"></i>
                </div>
                
                <div class="editor-content">
                    <h3><i class="fas fa-clock"></i> Editar Horários</h3>
                    <div id="editorContent" class="editor-form"></div>
                </div>
            </div>
        </div>

        <!-- RESUMO POR HORÁRIO -->
        <div class="resumo-container" id="resumoContainer">
            <div class="resumo-header">
                <i class="fas fa-chart-pie"></i>
                <h4>Resumo por Horário</h4>
            </div>
            <div class="resumo-grid" id="resumoGrid"></div>
        </div>
    `;

    // Adicionar evento ao botão e ao input
    document.getElementById('btnCarregarEscala').addEventListener('click', () => {
        const novaData = document.getElementById('seletorDataEscala').value;
        if (novaData) {
            window.dataEscalaSelecionada = novaData;
            gerarHeaderTimeline();
            gerarTimelineVisualComAusencias();
            gerarResumoHorarios();
        }
    });

    document.getElementById('seletorDataEscala').addEventListener('change', (e) => {
        window.dataEscalaSelecionada = e.target.value;
    });

    gerarHeaderTimeline();
    gerarTimelineVisualComAusencias();
    gerarResumoHorarios();
    configurarSidebarEditor();
}

function configurarSidebarEditor() {
    const sidebar = document.getElementById('sidebarEditor');
    const toggleBtn = document.getElementById('toggleEditor');
    const toggleIcon = document.getElementById('toggleIcon');

    if (!sidebar || !toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        
        // Muda o ícone conforme estado
        if (sidebar.classList.contains('collapsed')) {
            toggleIcon.className = 'fas fa-chevron-left';
        } else {
            toggleIcon.className = 'fas fa-chevron-right';
        }
    });
}

function gerarTimelineVisualComAusencias() {
    const body = document.getElementById("timelineBody");
    if (!body) return;

    body.innerHTML = "";

    if (!colaboradores || colaboradores.length === 0) {
        body.innerHTML = '<div class="empty-state">Nenhum colaborador cadastrado</div>';
        return;
    }

    const dataSelecionada = window.dataEscalaSelecionada || new Date().toISOString().split('T')[0];
    const dataObj = new Date(dataSelecionada + 'T12:00:00');
    
    console.log(`📅 Gerando escala para: ${dataSelecionada}`);

    colaboradores.forEach(c => {
        const trabInicio = obterHoraNumerica(c.TrabalhoInicio);
        const trabFim = obterHoraNumerica(c.TrabalhoFim);
        const almInicio = obterHoraNumerica(c.AlmocoInicio);
        const almFim = obterHoraNumerica(c.AlmocoFim);

        // Buscar ausências do colaborador para esta data
        const ausenciasDoDia = window.ausencias?.filter(a => {
            if ((a.colaboradorId || a.ColaboradorId) !== c.Id) return false;
            
            const dataInicio = new Date(a.DataInicio || a.dataInicio);
            const dataFim = new Date(a.DataFim || a.dataFim);
            
            dataInicio.setHours(0, 0, 0, 0);
            dataFim.setHours(0, 0, 0, 0);
            const dataComp = new Date(dataSelecionada);
            dataComp.setHours(0, 0, 0, 0);
            
            return dataComp >= dataInicio && dataComp <= dataFim;
        }) || [];

        let tipoAusenciaDia = null;
        let horasAusencia = null;
        
        if (ausenciasDoDia.length > 0) {
            const ausencia = ausenciasDoDia[0];
            tipoAusenciaDia = (ausencia.tipo || ausencia.Tipo || '').toLowerCase();
            
            if (ausencia.periodoTipo === 'horas' || ausencia.PeriodoTipo === 'horas') {
                const horaInicio = ausencia.horaInicio || ausencia.HoraInicio;
                const horaFim = ausencia.horaFim || ausencia.HoraFim;
                
                if (horaInicio && horaFim) {
                    horasAusencia = {
                        inicio: obterHoraNumerica(horaInicio),
                        fim: obterHoraNumerica(horaFim)
                    };
                }
            }
        }
 
        const horasTrabalhadas = calcularHorasTrabalhadas(c, dataSelecionada, ausenciasDoDia);
        
        const horasFormatadas = horasTrabalhadas % 1 === 0 
            ? `${horasTrabalhadas}h` 
            : `${horasTrabalhadas.toFixed(1)}h`;

        const row = document.createElement("div");
        row.classList.add("timeline-row");
        row.setAttribute('data-colaborador-id', c.Id);

        // Nome do colaborador (ocupa primeira coluna)
        let html = `<div class="timeline-name" onclick="abrirEditorNaEscala(${c.Id})">
            <i class="fas fa-user"></i> 
            <span>${c.Nome || 'Sem nome'}</span>
            <i class="fas fa-pen edit-indicator"></i>
        </div>`;

        // ===== COLUNA DE TOTAL DE HORAS =====
        let totalClass = 'total-cell';
        let totalTooltip = `${horasFormatadas} trabalhadas`;

        if (horasTrabalhadas === 0) {
            totalClass += ' total-zero';
            if (tipoAusenciaDia === 'ferias') totalTooltip = 'Férias - 0h';
            else if (tipoAusenciaDia === 'folga') totalTooltip = 'Folga - 0h';
            else if (tipoAusenciaDia === 'ausencia') totalTooltip = 'Ausente - 0h';
            else totalTooltip = 'Não trabalha hoje - 0h';
        } else if (horasTrabalhadas < (trabFim - trabInicio - ((almFim - almInicio) || 0))) {
            totalClass += ' total-parcial';
            totalTooltip = `Parcial: ${horasFormatadas} (esperado ${(trabFim - trabInicio - ((almFim - almInicio) || 0)).toFixed(1)}h)`;
        }

        html += `<div class="timeline-cell ${totalClass}" title="${totalTooltip}">
            <span class="total-valor">${horasFormatadas}</span>
        </div>`;

        // Gerar células para cada hora
        for (let hora = 7; hora <= 18; hora++) {
            let classe = "fora-expediente";
            let tooltip = `${hora}:00 - `;
            let status = "Fora do expediente";

            if (tipoAusenciaDia === 'ferias' && !horasAusencia) {
                classe = "ferias";
                status = "Férias (dia inteiro)";
            } 
            else if (tipoAusenciaDia === 'folga' && !horasAusencia) {
                classe = "folga";
                status = "Folga (dia inteiro)";
            }
            else if (tipoAusenciaDia === 'ausencia' && !horasAusencia) {
                classe = "folga";
                status = "Ausente (dia inteiro)";
            }
            else {
                const noTrabalho = trabInicio !== null && trabFim !== null && 
                                  hora >= trabInicio && hora < trabFim;
                
                const noAlmoco = almInicio !== null && almFim !== null && 
                                hora >= almInicio && hora < almFim;

                if (horasAusencia && hora >= horasAusencia.inicio && hora < horasAusencia.fim) {
                    classe = "ausencia-parcial";
                    status = `Ausente (${hora}:00-${horasAusencia.fim}:00)`;
                }
                else if (noAlmoco) {
                    classe = "almoco";
                    status = "Horário de almoço";
                }
                else if (noTrabalho) {
                    classe = "trabalhando";
                    status = "Trabalhando";
                }
            }

            tooltip += status;
            html += `<div class="timeline-cell ${classe}" title="${tooltip}"></div>`;
        }

        row.innerHTML = html;
        body.appendChild(row);
    });

    adicionarLinhaTotalizador();
}

// Função separada para o totalizador

function adicionarLinhaTotalizador() {
    const body = document.getElementById("timelineBody");
    if (!body) return;

    // Remover linha anterior
    const linhaAnterior = document.getElementById('linha-total-timeline');
    if (linhaAnterior) linhaAnterior.remove();

    // Calcular totais
    const totaisPorHora = [];
    let totalHorasDia = 0;
    
    for (let hora = 7; hora <= 18; hora++) {
        totaisPorHora.push({
            hora: hora,
            total: 0,
            trabalhando: 0,
            almoco: 0,
            folga: 0,
            ferias: 0,
            ausente: 0,
            fora: 0
        });
    }

    // Coletar dados
    document.querySelectorAll('.timeline-row').forEach(row => {
        if (row.id === 'linha-total-timeline') return;
        
        // Total de horas do colaborador
        const totalCell = row.querySelector('.total-cell .total-valor');
        if (totalCell) {
            const horasText = totalCell.textContent;
            const horas = parseFloat(horasText.replace('h', ''));
            if (!isNaN(horas)) {
                totalHorasDia += horas;
            }
        }
        
        // Contagem por hora
        const cells = row.querySelectorAll('.timeline-cell:not(.total-cell)');
        cells.forEach((cell, index) => {
            if (index < totaisPorHora.length) {
                if (cell.classList.contains('trabalhando')) totaisPorHora[index].trabalhando++;
                else if (cell.classList.contains('almoco')) totaisPorHora[index].almoco++;
                else if (cell.classList.contains('folga')) totaisPorHora[index].folga++;
                else if (cell.classList.contains('ferias')) totaisPorHora[index].ferias++;
                else if (cell.classList.contains('ausencia-parcial')) totaisPorHora[index].ausente++;
                else if (cell.classList.contains('fora-expediente')) totaisPorHora[index].fora++;
                
                totaisPorHora[index].total++;
            }
        });
    });

    // Criar linha de total
    const totalRow = document.createElement("div");
    totalRow.id = 'linha-total-timeline';
    totalRow.classList.add("timeline-row", "total-row");

    // Nome da linha
    let html = `<div class="timeline-name total-nome">
        <i class="fas fa-chart-bar"></i>
        <span><strong>TOTAL</strong></span>
        <span class="total-colaboradores">${colaboradores.length} colab.</span>
    </div>`;

    // Coluna de total de horas
    const horasFormatadas = totalHorasDia % 1 === 0 
        ? `${totalHorasDia}h` 
        : `${totalHorasDia.toFixed(1)}h`;
    
    html += `<div class="timeline-cell total-cell total-geral" title="Total de horas trabalhadas no dia">
        <span class="total-valor total-geral-valor">${horasFormatadas}</span>
    </div>`;

    // Colunas por hora
    totaisPorHora.forEach(item => {
        html += `
            <div class="timeline-cell total-cell" title="${item.hora}:00">
                <div class="total-info">
                    <span class="total-ocupados" title="Trabalhando: ${item.trabalhando} | Almoço: ${item.almoco}">
                        👔 ${item.trabalhando + item.almoco}
                    </span>
                    <span class="total-ausentes" title="Folga: ${item.folga} | Férias: ${item.ferias} | Ausente: ${item.ausente}">
                        🌴 ${item.folga + item.ferias + item.ausente}
                    </span>
                    <span class="total-livres" title="Fora: ${item.fora}">
                        ⚪ ${item.fora}
                    </span>
                </div>
            </div>
        `;
    });

    totalRow.innerHTML = html;
    body.appendChild(totalRow);
}
// Adicione esta função utilitária se não existir
function formatarHoraNumerica(horas) {
    if (horas === null || horas === undefined) return '';
    return `${Math.floor(horas).toString().padStart(2, '0')}:00`;
}

// app.js - Função gerarHeaderTimeline corrigida

function gerarHeaderTimeline() {
    const header = document.getElementById("timelineHeader");
    if (!header) return;

    // Limpar header
    header.innerHTML = '';
    
    // Coluna do colaborador
    header.innerHTML += '<div class="timeline-name-header">Colaborador</div>';
    
    // Coluna de total de horas
    header.innerHTML += '<div class="hora-header total-header" title="Total de horas trabalhadas no dia">Total</div>';

    // Colunas das horas
    for (let hora = 7; hora <= 18; hora++) {
        header.innerHTML += `
            <div class="hora-header">
                <span>${hora}:00</span>
            </div>
        `;
    }
    
    console.log("✅ Header da timeline gerado com coluna de total");
}

// app.js - Função para calcular horas trabalhadas no dia

function calcularHorasTrabalhadas(colaborador, dataSelecionada, ausenciasDoDia) {
    // Horário base do colaborador
    const trabInicio = obterHoraNumerica(colaborador.TrabalhoInicio);
    const trabFim = obterHoraNumerica(colaborador.TrabalhoFim);
    const almInicio = obterHoraNumerica(colaborador.AlmocoInicio);
    const almFim = obterHoraNumerica(colaborador.AlmocoFim);
    
    // Se não tem horário definido
    if (trabInicio === null || trabFim === null) return 0;
    
    // Duração total do expediente (em horas)
    let horasTrabalho = trabFim - trabInicio;
    
    // Subtrair almoço se existir
    if (almInicio !== null && almFim !== null) {
        horasTrabalho -= (almFim - almInicio);
    }
    
    // Verificar ausências
    if (ausenciasDoDia.length > 0) {
        const ausencia = ausenciasDoDia[0];
        const tipoAusencia = (ausencia.tipo || ausencia.Tipo || '').toLowerCase();
        const periodoTipo = ausencia.periodoTipo || ausencia.PeriodoTipo || 'dia_inteiro';
        
        // Ausência dia inteiro
        if (periodoTipo === 'dia_inteiro') {
            return 0;
        }
        
        // Ausência parcial (horas específicas)
        if (periodoTipo === 'horas') {
            const horaInicioAusencia = obterHoraNumerica(ausencia.horaInicio || ausencia.HoraInicio);
            const horaFimAusencia = obterHoraNumerica(ausencia.horaFim || ausencia.HoraFim);
            
            if (horaInicioAusencia !== null && horaFimAusencia !== null) {
                // Calcular interseção entre horário de trabalho e ausência
                const inicioAusencia = Math.max(trabInicio, horaInicioAusencia);
                const fimAusencia = Math.min(trabFim, horaFimAusencia);
                
                if (fimAusencia > inicioAusencia) {
                    const horasAusentes = fimAusencia - inicioAusencia;
                    
                    // Ajustar se a ausência cobre parte do almoço
                    if (almInicio !== null && almFim !== null) {
                        const inicioAlmocoAusencia = Math.max(almInicio, horaInicioAusencia);
                        const fimAlmocoAusencia = Math.min(almFim, horaFimAusencia);
                        
                        if (fimAlmocoAusencia > inicioAlmocoAusencia) {
                            // A ausência já cobre parte do almoço, não precisa subtrair novamente
                            horasTrabalho -= horasAusentes;
                        } else {
                            horasTrabalho -= horasAusentes;
                        }
                    } else {
                        horasTrabalho -= horasAusentes;
                    }
                }
            }
        }
    }
    
    // Garantir que não fique negativo
    return Math.max(0, horasTrabalho);
}

function gerarTimelineVisual() {
    const body = document.getElementById("timelineBody");
    if (!body) return;

    body.innerHTML = "";

    if (!colaboradores || colaboradores.length === 0) {
        body.innerHTML = '<div class="empty-state">Nenhum colaborador cadastrado</div>';
        return;
    }

    colaboradores.forEach(c => {
        const trabInicio = obterHoraNumerica(c.TrabalhoInicio);
        const trabFim = obterHoraNumerica(c.TrabalhoFim);
        const almInicio = obterHoraNumerica(c.AlmocoInicio);
        const almFim = obterHoraNumerica(c.AlmocoFim);

        const row = document.createElement("div");
        row.classList.add("timeline-row");
        row.setAttribute('data-colaborador-id', c.Id);

        // 🔥 MUDANÇA AQUI: abrirEditorNaEscala em vez de abrirEditorColaborador
        let html = `<div class="timeline-name" onclick="abrirEditorNaEscala(${c.Id})">
            <i class="fas fa-user"></i> 
            <span>${c.Nome || 'Sem nome'}</span>
            <i class="fas fa-pen edit-indicator"></i>
        </div>`;

        for (let hora = 7; hora <= 18; hora++) {
            let classe = "fora-expediente";
            let tooltip = `${hora}:00 - Fora do expediente`;

            if (trabInicio !== null && trabFim !== null && hora >= trabInicio && hora < trabFim) {
                classe = "trabalhando";
                tooltip = `${hora}:00 - Trabalhando`;
            }

            if (almInicio !== null && almFim !== null && hora >= almInicio && hora < almFim) {
                classe = "almoco";
                tooltip = `${hora}:00 - Horário de almoço`;
            }

            html += `<div class="timeline-cell ${classe}" title="${tooltip}"></div>`;
        }

        row.innerHTML = html;
        body.appendChild(row);
    });

}
function abrirEditorColaborador(id) {
    console.log("Abrindo editor para ID:", id);
    
    const colaborador = id ? colaboradores.find(c => c.Id === id) : null;
    
    const editorPanel = document.getElementById('colaboradorEditor');
    const editorTitle = document.getElementById('editorTitle');
    const editorContent = document.getElementById('colaboradorEditorContent');
    
    if (!editorPanel || !editorTitle || !editorContent) {
        console.error("Elementos do editor não encontrados!");
        return;
    }
    
    // Mostra o painel
    editorPanel.style.display = 'block';
    
    // Garante que o conteúdo está visível
    editorPanel.querySelector('.editor-content').style.opacity = '1';
    editorPanel.querySelector('.editor-content').style.visibility = 'visible';
    
    // Atualiza o título
    editorTitle.innerText = colaborador ? 'Editar Colaborador' : 'Novo Colaborador';
    
    // Gera o formulário
    let formHtml = '';
    
    if (colaborador) {
        formHtml = `
            <div class="editor-colaborador">
                <div class="editor-form-group">
                    <label><i class="fas fa-user"></i> Nome</label>
                    <input type="text" id="editorNome" value="${colaborador.Nome || ''}" placeholder="Nome completo" class="form-control">
                </div>
                
                <div class="editor-form-group">
                    <label><i class="fas fa-briefcase"></i> Trabalho</label>
                    <div class="time-inputs">
                        <input type="time" id="editorTrabInicio" value="${formatarHora(colaborador.TrabalhoInicio) || ''}" class="form-control">
                        <span>até</span>
                        <input type="time" id="editorTrabFim" value="${formatarHora(colaborador.TrabalhoFim) || ''}" class="form-control">
                    </div>
                </div>
                
                <div class="editor-form-group">
                    <label><i class="fas fa-utensils"></i> Almoço</label>
                    <div class="time-inputs">
                        <input type="time" id="editorAlmInicio" value="${formatarHora(colaborador.AlmocoInicio) || ''}" class="form-control">
                        <span>até</span>
                        <input type="time" id="editorAlmFim" value="${formatarHora(colaborador.AlmocoFim) || ''}" class="form-control">
                    </div>
                </div>
                
                <div class="editor-actions">
                    <button onclick="salvarColaboradorEditor(${colaborador.Id})" class="btn-primary">
                        <i class="fas fa-save"></i> Atualizar
                    </button>
                    <button onclick="fecharColaboradorEditor()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
                
                <div class="editor-footer">
                    <button onclick="excluirColaborador(${colaborador.Id})" class="btn-danger" style="width: 100%;">
                        <i class="fas fa-trash"></i> Excluir Colaborador
                    </button>
                </div>
            </div>
        `;
    } else {
        formHtml = `
            <div class="editor-colaborador">
                <div class="editor-form-group">
                    <label><i class="fas fa-user"></i> Nome</label>
                    <input type="text" id="editorNome" placeholder="Nome completo" class="form-control">
                </div>
                
                <div class="editor-form-group">
                    <label><i class="fas fa-briefcase"></i> Trabalho</label>
                    <div class="time-inputs">
                        <input type="time" id="editorTrabInicio" class="form-control">
                        <span>até</span>
                        <input type="time" id="editorTrabFim" class="form-control">
                    </div>
                </div>
                
                <div class="editor-form-group">
                    <label><i class="fas fa-utensils"></i> Almoço</label>
                    <div class="time-inputs">
                        <input type="time" id="editorAlmInicio" class="form-control">
                        <span>até</span>
                        <input type="time" id="editorAlmFim" class="form-control">
                    </div>
                </div>
                
                <div class="editor-actions">
                    <button onclick="salvarColaboradorEditor(null)" class="btn-primary">
                        <i class="fas fa-save"></i> Salvar
                    </button>
                    <button onclick="fecharColaboradorEditor()" class="btn-secondary">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
            </div>
        `;
    }
    
    editorContent.innerHTML = formHtml;
    
    // Armazena o ID para edição
    if (colaborador) {
        editandoId = colaborador.Id;
    } else {
        editandoId = null;
    }
}

// app.js - Função salvarEditorColaborador corrigida

async function salvarEditorColaborador(id) {
    const trabalhoInicio = document.getElementById(`editTrabInicio-${id}`)?.value;
    const trabalhoFim = document.getElementById(`editTrabFim-${id}`)?.value;
    const almocoInicio = document.getElementById(`editAlmInicio-${id}`)?.value;
    const almocoFim = document.getElementById(`editAlmFim-${id}`)?.value;

    try {
        const response = await fetch(`http://localhost:3000/api/colaboradores/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                trabalhoInicio,
                trabalhoFim,
                almocoInicio,
                almocoFim
            })
        });

        if (!response.ok) throw new Error("Erro ao salvar");

        await carregarColaboradores();
        
        // 🔥 IMPORTANTE: Regenerar o header com a coluna de total
        gerarHeaderTimeline();
        
        // Gerar a timeline com as ausências
        gerarTimelineVisualComAusencias();
        
        gerarResumoHorarios();
        fecharEditor();
        mostrarToast("Horários salvos com sucesso!", "success");
        
    } catch (error) {
        console.error("Erro ao salvar horários:", error);
        mostrarToast("Erro ao salvar horários", "error");
    }
}

function fecharEditor() {
    const editorContent = document.getElementById('editorContent');
    editorContent.innerHTML = `
        <div class="editor-empty">
            <i class="fas fa-arrow-left"></i>
            <p>Clique no nome de um colaborador para editar seus horários</p>
        </div>
    `;
}

function atualizarEstatisticas() {
    const statsContainer = document.getElementById('statsContent');
    if (!statsContainer || !colaboradores.length) return;

    const agora = new Date();
    const horaAtual = agora.getHours();

    let trabalhandoAgora = 0;
    let almocoAgora = 0;
    let foraAgora = 0;

    colaboradores.forEach(c => {
        const trabInicio = obterHoraNumerica(c.TrabalhoInicio);
        const trabFim = obterHoraNumerica(c.TrabalhoFim);
        const almInicio = obterHoraNumerica(c.AlmocoInicio);
        const almFim = obterHoraNumerica(c.AlmocoFim);

        const noTrabalho = trabInicio !== null && trabFim !== null && 
                          horaAtual >= trabInicio && horaAtual < trabFim;
        
        const noAlmoco = almInicio !== null && almFim !== null && 
                        horaAtual >= almInicio && horaAtual < almFim;

        if (noAlmoco) {
            almocoAgora++;
        } else if (noTrabalho) {
            trabalhandoAgora++;
        } else {
            foraAgora++;
        }
    });

    statsContainer.innerHTML = `
        <div class="stat-item">
            <span class="stat-label">Hora atual:</span>
            <span class="stat-value">${horaAtual}:00</span>
        </div>
        <div class="stat-item">
            <span class="stat-label trabalhando-text">👔 Trabalhando:</span>
            <span class="stat-value">${trabalhandoAgora}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label almoco-text">🍽️ Em almoço:</span>
            <span class="stat-value">${almocoAgora}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label fora-text">⚪ Fora:</span>
            <span class="stat-value">${foraAgora}</span>
        </div>
        <div class="stat-item total">
            <span class="stat-label">Total:</span>
            <span class="stat-value">${colaboradores.length}</span>
        </div>
    `;
}

/* ===========================
   TELA CALENDÁRIO
=========================== */
function renderCalendario() {
    appContent.innerHTML = `
        <div class="page-header">
            <h1>Calendário Mensal</h1>
            <button id="btnLancamentoAjuste" class="btn-primary">
                <i class="fas fa-plus"></i> Lançamento ajuste
            </button>
        </div>

        <div class="calendar-wrapper">
            <div class="calendar-header">
                <div class="month-nav">
                    <button id="prevMonth" class="nav-btn">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <h2 id="monthTitle">Carregando...</h2>
                    <button id="nextMonth" class="nav-btn">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>

            <div class="weekdays"></div>
            <div id="calendar" class="calendar-grid"></div>
        </div>
    `;

    setTimeout(() => {
        if (typeof inicializarCalendario === 'function') {
            inicializarCalendario();
        }
    }, 100);
}

/* ===========================
   UTILITÁRIOS
=========================== */
function formatarHora(hora) {
    if (!hora) return "";
    
    if (hora.includes("T")) {
        const date = new Date(hora);
        if (isNaN(date.getTime())) return "";
        const h = String(date.getHours()).padStart(2, "0");
        const m = String(date.getMinutes()).padStart(2, "0");
        return `${h}:${m}`;
    }

    if (hora.includes(":")) {
        return hora.substring(0, 5);
    }

    return "";
}

function obterHoraNumerica(hora) {
    if (!hora) return null;
    
    const horaStr = formatarHora(hora);
    if (!horaStr) return null;
    
    const partes = horaStr.split(":");
    if (partes.length < 1) return null;
    
    return parseInt(partes[0]);
}

// Função para mostrar toast
function mostrarToast(mensagem, tipo = "success") {
    console.log(`Toast: ${mensagem} (${tipo})`);
    
    // Cria o container se não existir
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = `toast ${tipo}`;
    
    let icone = "fa-info-circle";
    if (tipo === "success") icone = "fa-check-circle";
    else if (tipo === "error") icone = "fa-exclamation-circle";
    else if (tipo === "warning") icone = "fa-exclamation-triangle";
    
    toast.innerHTML = `<i class="fas ${icone}"></i> ${mensagem}`;
    
    container.appendChild(toast);
    
    // Remove após 3 segundos
    setTimeout(() => {
        toast.style.animation = "slideOut 0.3s ease";
        setTimeout(() => {
            if (toast.parentNode === container) {
                toast.remove();
            }
            
            // Remove container se estiver vazio
            if (container.children.length === 0) {
                container.remove();
            }
        }, 300);
    }, 3000);
}

// Função para debug - mostra o estado atual
function debugAusencias() {
    console.log("=== DEBUG AUSÊNCIAS ===");
    console.log("Data selecionada:", dataSelecionada);
    console.log("Todas ausências:", ausencias);
    console.log("Colaboradores:", colaboradores);
    
    if (dataSelecionada) {
        const filtradas = ausencias.filter(a => {
            const dataInicio = new Date(a.DataInicio || a.dataInicio);
            const dataFim = new Date(a.DataFim || a.dataFim);
            const dataAlvo = new Date(dataSelecionada);
            
            dataInicio.setHours(0,0,0,0);
            dataFim.setHours(0,0,0,0);
            dataAlvo.setHours(0,0,0,0);
            
            return dataAlvo >= dataInicio && dataAlvo <= dataFim;
        });
        console.log("Filtradas pelo dia:", filtradas);
    }
}

function gerarLinhaResumo() {
    const body = document.getElementById("timelineBody");
    if (!body) return;

    // Verifica se já existe uma linha de resumo e remove
    const linhaResumoExistente = document.getElementById('linhaResumo');
    if (linhaResumoExistente) {
        linhaResumoExistente.remove();
    }

    // Cria array para contar colaboradores por hora
    const contagemPorHora = Array(12).fill(0).map(() => ({
        trabalhando: 0,
        almoco: 0,
        fora: 0
    }));

    // Conta colaboradores em cada hora
    colaboradores.forEach(c => {
        const trabInicio = obterHoraNumerica(c.TrabalhoInicio);
        const trabFim = obterHoraNumerica(c.TrabalhoFim);
        const almInicio = obterHoraNumerica(c.AlmocoInicio);
        const almFim = obterHoraNumerica(c.AlmocoFim);

        for (let hora = 7; hora <= 18; hora++) {
            const index = hora - 7;
            
            const noAlmoco = almInicio !== null && almFim !== null && 
                            hora >= almInicio && hora < almFim;
            
            const noTrabalho = trabInicio !== null && trabFim !== null && 
                              hora >= trabInicio && hora < trabFim && !noAlmoco;

            if (noAlmoco) {
                contagemPorHora[index].almoco++;
            } else if (noTrabalho) {
                contagemPorHora[index].trabalhando++;
            } else {
                contagemPorHora[index].fora++;
            }
        }
    });

    // Cria a linha de resumo
    const linhaResumo = document.createElement("div");
    linhaResumo.id = 'linhaResumo';
    linhaResumo.className = 'timeline-row resumo-row';

    let html = `<div class="timeline-name resumo-nome">
        <i class="fas fa-chart-bar"></i>
        <span><strong>Resumo</strong></span>
    </div>`;

    for (let hora = 7; hora <= 18; hora++) {
        const index = hora - 7;
        const dados = contagemPorHora[index];
        
        html += `
            <div class="timeline-cell resumo-cell" title="${hora}:00">
                <div class="resumo-info">
                    <span class="resumo-trabalhando" title="Trabalhando">
                        <i class="fas fa-briefcase"></i> ${dados.trabalhando}
                    </span>
                    <span class="resumo-almoco" title="Almoço">
                        <i class="fas fa-utensils"></i> ${dados.almoco}
                    </span>
                    <span class="resumo-fora" title="Fora">
                        <i class="fas fa-clock"></i> ${dados.fora}
                    </span>
                </div>
            </div>
        `;
    }

    linhaResumo.innerHTML = html;
    body.appendChild(linhaResumo);
}

function gerarResumoHorarios() {
    const resumoGrid = document.getElementById('resumoGrid');
    if (!resumoGrid) return;

    if (!colaboradores || colaboradores.length === 0) {
        resumoGrid.innerHTML = '<div class="resumo-empty">Nenhum colaborador cadastrado</div>';
        return;
    }

    const dataSelecionada = window.dataEscalaSelecionada || new Date().toISOString().split('T')[0];
    const dataObj = new Date(dataSelecionada + 'T12:00:00');

    // Cria array para contar colaboradores por hora
    const contagemPorHora = [];

    for (let hora = 7; hora <= 18; hora++) {
        contagemPorHora.push({
            hora: hora,
            trabalhando: 0,
            almoco: 0,
            folga: 0,
            ferias: 0,
            ausente: 0,
            fora: 0
        });
    }

    // Conta colaboradores em cada hora considerando ausências
    colaboradores.forEach(c => {
        const trabInicio = obterHoraNumerica(c.TrabalhoInicio);
        const trabFim = obterHoraNumerica(c.TrabalhoFim);
        const almInicio = obterHoraNumerica(c.AlmocoInicio);
        const almFim = obterHoraNumerica(c.AlmocoFim);

        // Buscar ausências do colaborador para esta data
        const ausenciasDoDia = window.ausencias?.filter(a => {
            if ((a.colaboradorId || a.ColaboradorId) !== c.Id) return false;
            
            const dataInicio = new Date(a.DataInicio || a.dataInicio);
            const dataFim = new Date(a.DataFim || a.dataFim);
            
            dataInicio.setHours(0, 0, 0, 0);
            dataFim.setHours(0, 0, 0, 0);
            const dataComp = new Date(dataSelecionada);
            dataComp.setHours(0, 0, 0, 0);
            
            return dataComp >= dataInicio && dataComp <= dataFim;
        }) || [];

        let tipoAusenciaDia = null;
        let horasAusencia = null;
        
        if (ausenciasDoDia.length > 0) {
            const ausencia = ausenciasDoDia[0];
            tipoAusenciaDia = (ausencia.tipo || ausencia.Tipo || '').toLowerCase();
            
            if (ausencia.periodoTipo === 'horas' || ausencia.PeriodoTipo === 'horas') {
                const horaInicio = ausencia.horaInicio || ausencia.HoraInicio;
                const horaFim = ausencia.horaFim || ausencia.HoraFim;
                
                if (horaInicio && horaFim) {
                    horasAusencia = {
                        inicio: obterHoraNumerica(horaInicio),
                        fim: obterHoraNumerica(horaFim)
                    };
                }
            }
        }

        for (let hora = 7; hora <= 18; hora++) {
            const index = hora - 7;
            
            // Verificar ausência dia inteiro
            if (tipoAusenciaDia === 'ferias' && !horasAusencia) {
                contagemPorHora[index].ferias++;
                continue;
            }
            else if ((tipoAusenciaDia === 'folga' || tipoAusenciaDia === 'ausencia') && !horasAusencia) {
                contagemPorHora[index].folga++;
                continue;
            }
            
            // Verificar ausência parcial
            if (horasAusencia && hora >= horasAusencia.inicio && hora < horasAusencia.fim) {
                contagemPorHora[index].ausente++;
                continue;
            }
            
            // Verificar horário normal
            const noAlmoco = almInicio !== null && almFim !== null && 
                            hora >= almInicio && hora < almFim;
            
            const noTrabalho = trabInicio !== null && trabFim !== null && 
                              hora >= trabInicio && hora < trabFim && !noAlmoco;

            if (noAlmoco) {
                contagemPorHora[index].almoco++;
            } else if (noTrabalho) {
                contagemPorHora[index].trabalhando++;
            } else {
                contagemPorHora[index].fora++;
            }
        }
    });

    // Gerar o HTML do resumo
    let html = '';
    
    contagemPorHora.forEach(item => {
        const total = item.trabalhando + item.almoco + item.folga + item.ferias + item.ausente + item.fora;
        
        html += `
            <div class="resumo-card">
                <div class="resumo-hora">${item.hora}:00</div>
                <div class="resumo-barras">
                    <div class="resumo-barra-container">
                        <div class="resumo-barra trabalhando" style="width: ${(item.trabalhando / total) * 100}%" title="Trabalhando: ${item.trabalhando}"></div>
                        <div class="resumo-barra almoco" style="width: ${(item.almoco / total) * 100}%" title="Almoço: ${item.almoco}"></div>
                        <div class="resumo-barra folga" style="width: ${(item.folga / total) * 100}%" title="Folga: ${item.folga}"></div>
                        <div class="resumo-barra ferias" style="width: ${(item.ferias / total) * 100}%" title="Férias: ${item.ferias}"></div>
                        <div class="resumo-barra ausente" style="width: ${(item.ausente / total) * 100}%" title="Ausente: ${item.ausente}"></div>
                        <div class="resumo-barra fora" style="width: ${(item.fora / total) * 100}%" title="Fora: ${item.fora}"></div>
                    </div>
                </div>
                <div class="resumo-numeros">
                    <span class="resumo-num trabalhando-num" title="Trabalhando"><i class="fas fa-briefcase"></i> ${item.trabalhando}</span>
                    <span class="resumo-num almoco-num" title="Almoço"><i class="fas fa-utensils"></i> ${item.almoco}</span>
                    <span class="resumo-num folga-num" title="Folga"><i class="fas fa-leaf"></i> ${item.folga}</span>
                    <span class="resumo-num ferias-num" title="Férias"><i class="fas fa-umbrella-beach"></i> ${item.ferias}</span>
                    <span class="resumo-num ausente-num" title="Ausente"><i class="fas fa-exclamation-triangle"></i> ${item.ausente}</span>
                    <span class="resumo-num fora-num" title="Fora"><i class="fas fa-clock"></i> ${item.fora}</span>
                </div>
            </div>
        `;
    });

    resumoGrid.innerHTML = html;
}

// Função para a escala do dia (renomeada)
function abrirEditorNaEscala(id) {
    const c = colaboradores.find(x => x.Id === id);
    if (!c) return;

    const sidebar = document.getElementById('sidebarEditor');
    if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
        document.getElementById('toggleIcon').className = 'fas fa-chevron-left';
    }

    const editorContent = document.getElementById('editorContent');
    editorContent.innerHTML = `
        <div class="editor-colaborador">
            <div class="editor-header">
                <h4>${c.Nome}</h4>
                <button onclick="fecharEditor()" class="btn-close-editor">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="editor-form-group">
                <label><i class="fas fa-briefcase"></i> Trabalho</label>
                <div class="time-inputs">
                    <input type="time" id="editTrabInicio-${c.Id}" value="${formatarHora(c.TrabalhoInicio)}" class="form-control">
                    <span>até</span>
                    <input type="time" id="editTrabFim-${c.Id}" value="${formatarHora(c.TrabalhoFim)}" class="form-control">
                </div>
            </div>
            
            <div class="editor-form-group">
                <label><i class="fas fa-utensils"></i> Almoço</label>
                <div class="time-inputs">
                    <input type="time" id="editAlmInicio-${c.Id}" value="${formatarHora(c.AlmocoInicio)}" class="form-control">
                    <span>até</span>
                    <input type="time" id="editAlmFim-${c.Id}" value="${formatarHora(c.AlmocoFim)}" class="form-control">
                </div>
            </div>
            
            <div class="editor-actions">
                <button onclick="salvarEditorColaborador(${c.Id})" class="btn-primary">
                    <i class="fas fa-save"></i> Salvar
                </button>
                <button onclick="fecharEditor()" class="btn-secondary">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        </div>
    `;
}

function abrirSeletorMes() {
    // Remove seletor existente se houver
    const overlayExistente = document.querySelector('.month-selector-overlay');
    if (overlayExistente) {
        overlayExistente.remove();
    }

    // Cria o overlay
    const overlay = document.createElement('div');
    overlay.className = 'month-selector-overlay';
    
    // Lista de meses em português
    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    // Gera os botões dos meses
    let mesesHTML = '';
    meses.forEach((mes, index) => {
        const activeClass = index === mesAtual ? 'active' : '';
        mesesHTML += `
            <button class="month-btn ${activeClass}" data-mes="${index}">
                ${mes.substring(0, 3)}
            </button>
        `;
    });
    
    overlay.innerHTML = `
        <div class="month-selector-modal">
            <div class="month-selector-header">
                <h3><i class="fas fa-calendar-alt"></i> Navegar</h3>
                <button class="month-selector-close" onclick="this.closest('.month-selector-overlay').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="year-selector">
                <button class="year-btn" id="prevYearBtn">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <span class="current-year" id="currentYearDisplay">${anoAtual}</span>
                <button class="year-btn" id="nextYearBtn">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            
            <div class="months-grid">
                ${mesesHTML}
            </div>
            
            <div class="month-selector-actions">
                <button class="btn-primary" id="irParaDataBtn">
                    <i class="fas fa-check"></i> Ir para
                </button>
                <button class="btn-secondary" onclick="this.closest('.month-selector-overlay').remove()">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Configurar eventos
    const yearDisplay = document.getElementById('currentYearDisplay');
    let anoSelecionado = anoAtual;
    
    // Botão ano anterior
    document.getElementById('prevYearBtn').addEventListener('click', () => {
        anoSelecionado--;
        yearDisplay.textContent = anoSelecionado;
    });
    
    // Botão próximo ano
    document.getElementById('nextYearBtn').addEventListener('click', () => {
        anoSelecionado++;
        yearDisplay.textContent = anoSelecionado;
    });
    
    // Botão "Ir para"
    document.getElementById('irParaDataBtn').addEventListener('click', async () => {
        const mesSelecionado = document.querySelector('.month-btn.active')?.dataset.mes;
        
        if (mesSelecionado !== undefined) {
            const novoMes = parseInt(mesSelecionado);
            
            // Atualiza mês e ano
            mesAtual = novoMes;
            anoAtual = anoSelecionado;
            
            // Recarrega feriados para o novo ano
            await carregarFeriados(anoAtual);
            
            // Atualiza o calendário
            gerarCalendario(mesAtual, anoAtual);
            
            // Fecha o modal
            overlay.remove();
        }
    });
    
    // Evento para os botões de mês
    document.querySelectorAll('.month-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            // Remove active de todos
            document.querySelectorAll('.month-btn').forEach(b => b.classList.remove('active'));
            // Adiciona active no clicado
            this.classList.add('active');
        });
    });
    
    // Fecha ao clicar no overlay (fora do modal)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove();
        }
    });
}

function renderConfiguracoes() {
    // Verifica o tema atual salvo
    const temaAtual = localStorage.getItem('tema') || 'light';
    
    appContent.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-cog"></i> Configurações</h1>
            <p>Personalize sua experiência no sistema</p>
        </div>

        <div class="configuracoes-grid">
            <!-- CARD DE TEMA -->
            <div class="config-card">
                <div class="config-card-header">
                    <i class="fas fa-palette"></i>
                    <h2>Aparência</h2>
                </div>
                
                <div class="config-card-body">
                    <p class="config-description">
                        Escolha o tema que prefere para o sistema
                    </p>
                    
                    <div class="tema-opcoes">
                        <div class="tema-opcao ${temaAtual === 'light' ? 'active' : ''}" data-tema="light">
                            <div class="tema-preview tema-preview-light">
                                <div class="preview-header"></div>
                                <div class="preview-sidebar"></div>
                                <div class="preview-content"></div>
                            </div>
                            <div class="tema-info">
                                <i class="fas fa-sun"></i>
                                <span>Claro</span>
                            </div>
                        </div>
                        
                        <div class="tema-opcao ${temaAtual === 'dark' ? 'active' : ''}" data-tema="dark">
                            <div class="tema-preview tema-preview-dark">
                                <div class="preview-header"></div>
                                <div class="preview-sidebar"></div>
                                <div class="preview-content"></div>
                            </div>
                            <div class="tema-info">
                                <i class="fas fa-moon"></i>
                                <span>Escuro</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- CARD DE PREFERÊNCIAS -->
            <div class="config-card">
                <div class="config-card-header">
                    <i class="fas fa-sliders-h"></i>
                    <h2>Preferências</h2>
                </div>
                
                <div class="config-card-body">
                    <div class="config-item">
                        <div class="config-item-info">
                            <i class="fas fa-calendar-week"></i>
                            <div>
                                <strong>Semana começa em:</strong>
                                <p>Defina o primeiro dia da semana</p>
                            </div>
                        </div>
                        <select id="primeiroDiaSemana" class="config-select">
                            <option value="0">Domingo</option>
                            <option value="1" selected>Segunda-feira</option>
                            <option value="6">Sábado</option>
                        </select>
                    </div>

                    <div class="config-item">
                        <div class="config-item-info">
                            <i class="fas fa-clock"></i>
                            <div>
                                <strong>Formato de hora:</strong>
                                <p>Escolha como as horas são exibidas</p>
                            </div>
                        </div>
                        <select id="formatoHora" class="config-select">
                            <option value="24" selected>24 horas (14:30)</option>
                            <option value="12">12 horas (2:30 PM)</option>
                        </select>
                    </div>

                    <div class="config-item">
                        <div class="config-item-info">
                            <i class="fas fa-bell"></i>
                            <div>
                                <strong>Notificações:</strong>
                                <p>Receber alertas do sistema</p>
                            </div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="notificacoes" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- CARD SOBRE O SISTEMA -->
            <div class="config-card">
                <div class="config-card-header">
                    <i class="fas fa-info-circle"></i>
                    <h2>Sobre</h2>
                </div>
                
                <div class="config-card-body">
                    <div class="sobre-info">
                        <i class="fas fa-calendar-check sobre-icon"></i>
                        <h3>Software de Escalas</h3>
                        <p class="versao">Versão 1.0.0</p>
                        <p class="descricao">
                            Sistema completo para gestão de escalas de trabalho, 
                            colaboradores e horários.
                        </p>
                    </div>
                    
                    <div class="info-item">
                        <i class="fas fa-code-branch"></i>
                        <span>Desenvolvido com HTML5, CSS3 e JavaScript</span>
                    </div>
                    
                    <div class="info-item">
                        <i class="fas fa-database"></i>
                        <span>Backend: Node.js + Express</span>
                    </div>
                    
                </div>
            </div>

            <!-- CARD DE AÇÕES -->
            <div class="config-card">
                <div class="config-card-header">
                    <i class="fas fa-tools"></i>
                    <h2>Ferramentas</h2>
                </div>
                
                <div class="config-card-body">
                    <button class="config-btn" onclick="exportarDados()">
                        <i class="fas fa-download"></i>
                        Exportar Dados
                    </button>
                    
                    <button class="config-btn" onclick="importarDados()">
                        <i class="fas fa-upload"></i>
                        Importar Dados
                    </button>
                    
                    <button class="config-btn config-btn-danger" onclick="resetarSistema()">
                        <i class="fas fa-trash-alt"></i>
                        Resetar Sistema
                    </button>
                </div>
            </div>
        </div>
    `;

    // Adiciona eventos para as opções de tema
    document.querySelectorAll('.tema-opcao').forEach(opcao => {
        opcao.addEventListener('click', function() {
            const tema = this.dataset.tema;
            mudarTema(tema);
            
            // Atualiza a classe active
            document.querySelectorAll('.tema-opcao').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Carrega preferências salvas
    carregarPreferencias();
    
    // Eventos para salvar preferências
    document.getElementById('primeiroDiaSemana').addEventListener('change', salvarPreferencias);
    document.getElementById('formatoHora').addEventListener('change', salvarPreferencias);
    document.getElementById('notificacoes').addEventListener('change', salvarPreferencias);
}

// Função para mudar o tema
function mudarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('tema', tema);
    
    mostrarToast(`Tema ${tema === 'dark' ? 'escuro' : 'claro'} ativado!`, 'success');
}

// Função para carregar preferências salvas
function carregarPreferencias() {
    const primeiroDia = localStorage.getItem('primeiroDiaSemana');
    const formatoHora = localStorage.getItem('formatoHora');
    const notificacoes = localStorage.getItem('notificacoes');
    
    if (primeiroDia) document.getElementById('primeiroDiaSemana').value = primeiroDia;
    if (formatoHora) document.getElementById('formatoHora').value = formatoHora;
    if (notificacoes) document.getElementById('notificacoes').checked = notificacoes === 'true';
}

// Função para salvar preferências
function salvarPreferencias() {
    localStorage.setItem('primeiroDiaSemana', document.getElementById('primeiroDiaSemana').value);
    localStorage.setItem('formatoHora', document.getElementById('formatoHora').value);
    localStorage.setItem('notificacoes', document.getElementById('notificacoes').checked);
    mostrarToast('Preferências salvas!', 'success');
}

// Funções de ferramentas (exemplo)
function exportarDados() {
    try {
        // Prepara os dados completos do sistema
        const dados = {
            colaboradores: colaboradores,
            ausencias: ausencias,
            preferencias: {
                tema: localStorage.getItem('tema') || 'light',
                primeiroDiaSemana: localStorage.getItem('primeiroDiaSemana') || '1',
                formatoHora: localStorage.getItem('formatoHora') || '24',
                notificacoes: localStorage.getItem('notificacoes') === 'true'
            },
            metadata: {
                versao: '1.0.0',
                dataExportacao: new Date().toISOString(),
                sistema: 'Software de Escalas'
            }
        };
        
        // Converte para JSON bonito
        const jsonString = JSON.stringify(dados, null, 2);
        
        // Cria o arquivo para download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-escalas-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        // Limpa a URL criada
        URL.revokeObjectURL(url);
        
        mostrarToast('Dados exportados com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao exportar:', error);
        mostrarToast('Erro ao exportar dados', 'error');
    }
}
function importarDados() {
    // Cria input de arquivo invisível
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        
        reader.onload = async (event) => {
            try {
                // Parse do JSON
                const dados = JSON.parse(event.target.result);
                
                // Valida se é um arquivo válido
                if (!dados.colaboradores || !dados.ausencias) {
                    throw new Error('Arquivo inválido');
                }
                
                // Confirmação do usuário
                if (!confirm('A importação irá substituir todos os dados atuais. Deseja continuar?')) {
                    return;
                }
                
                mostrarToast('Importando dados...', 'warning');
                
                // Importar colaboradores
                for (const colab of dados.colaboradores) {
                    await fetch('http://localhost:3000/api/colaboradores', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(colab)
                    });
                }
                
                // Importar ausências
                for (const aus of dados.ausencias) {
                    await fetch('http://localhost:3000/api/ausencias', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(aus)
                    });
                }
                
                // Importar preferências (opcional)
                if (dados.preferencias) {
                    if (dados.preferencias.tema) {
                        localStorage.setItem('tema', dados.preferencias.tema);
                        document.documentElement.setAttribute('data-theme', dados.preferencias.tema);
                    }
                    if (dados.preferencias.primeiroDiaSemana) {
                        localStorage.setItem('primeiroDiaSemana', dados.preferencias.primeiroDiaSemana);
                    }
                    if (dados.preferencias.formatoHora) {
                        localStorage.setItem('formatoHora', dados.preferencias.formatoHora);
                    }
                    if (dados.preferencias.notificacoes !== undefined) {
                        localStorage.setItem('notificacoes', dados.preferencias.notificacoes);
                    }
                }
                
                // Recarrega os dados no sistema
                await carregarColaboradores();
                await carregarAusencias();
                
                // Atualiza a interface se necessário
                if (document.getElementById('calendar')) {
                    gerarCalendario(mesAtual, anoAtual);
                }
                
                mostrarToast('Dados importados com sucesso!', 'success');
                
            } catch (error) {
                console.error('Erro ao importar:', error);
                mostrarToast('Erro ao importar arquivo', 'error');
            }
        };
        
        reader.readAsText(file);
    };
    
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
}

function resetarSistema() {
    // Modal de confirmação mais seguro
    if (confirm('⚠️ ATENÇÃO: Isso irá apagar TODOS os dados do sistema!\n\nTem certeza?')) {
        
        const senha = prompt('Digite "RESET" para confirmar:');
        
        if (senha === 'RESET') {
            mostrarToast('Resetando sistema...', 'warning');
            
            // Limpa localStorage
            localStorage.clear();
            
            // Recarrega a página
            setTimeout(() => {
                location.reload();
            }, 1500);
            
        } else {
            mostrarToast('Operação cancelada', 'error');
        }
    }
}

async function carregarPlantoes() {
    try {
        console.log("📆 Carregando plantões do Supabase...");
        const data = await API.getPlantoes();
        plantoesLancados = data || [];
        console.log(`✅ Plantões carregados: ${plantoesLancados.length}`);
    } catch (error) {
        console.error("❌ Erro ao carregar plantões:", error);
        plantoesLancados = [];
    }
}

function renderLancamentoPlantao() {
    const hoje = new Date();
    const sabados = gerarProximosSabados(hoje, 6); // Próximos 6 sábados
    
    appContent.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-calendar-plus"></i> Lançar Plantão de Sábado</h1>
            <p>Selecione os colaboradores para cada sábado</p>
        </div>

        <div class="plantao-layout">
            <!-- LISTA DE SÁBADOS -->
            <div class="sabados-container">
                <div class="sabados-header">
                    <h3><i class="fas fa-calendar-day"></i> Sábados Disponíveis</h3>
                </div>
                
                <div id="listaSabados" class="sabados-grid">
                    ${renderSabados(sabados)}
                </div>
            </div>

            <!-- PAINEL DE EDIÇÃO -->
            <div id="plantaoEditor" class="editor-sidebar" style="display: none;">
                <div class="editor-content">
                    <div class="editor-header">
                        <h3><i class="fas fa-clock"></i> <span id="plantaoDataTitle">Selecione um sábado</span></h3>
                        <button onclick="fecharPlantaoEditor()" class="btn-close-editor">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <div id="plantaoEditorContent" class="editor-form">
                        <!-- Conteúdo será preenchido ao clicar -->
                    </div>
                </div>
            </div>
        </div>

        <!-- LISTA DE PLANTÕES JÁ LANÇADOS -->
        <div class="plantoes-lancados-container">
            <div class="plantoes-lancados-header">
                <h3><i class="fas fa-list"></i> Plantões Lançados</h3>
            </div>
            <div id="listaPlantoesLancados" class="plantoes-grid">
                ${renderPlantoesLancados()}
            </div>
        </div>
    `;

    // Carrega os plantões existentes
    carregarPlantoesLancadosNaTela();
}

// Gera os próximos sábados
function gerarProximosSabados(data, quantidade) {
    const sabados = [];
    const dataAtual = new Date(data);
    
    // Encontra o primeiro sábado (6 = sábado)
    while (dataAtual.getDay() !== 6) {
        dataAtual.setDate(dataAtual.getDate() + 1);
    }
    
    for (let i = 0; i < quantidade; i++) {
        const sabado = new Date(dataAtual);
        sabados.push({
            data: sabado,
            dataISO: sabado.toISOString().split('T')[0],
            formatada: sabado.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }),
            dia: sabado.getDate(),
            mes: sabado.toLocaleString('pt-BR', { month: 'short' }).replace('.', ''),
            temPlantao: false
        });
        dataAtual.setDate(dataAtual.getDate() + 7);
    }
    
    return sabados;
}

function renderSabados(sabados) {
    let html = '';
    
    sabados.forEach(sabado => {
        // Verifica se já tem plantão lançado para este sábado
        const plantaoExistente = plantoesLancados.find(p => p.dataISO === sabado.dataISO);
        const temPlantao = !!plantaoExistente;
        const classe = temPlantao ? 'sabado-card lancado' : 'sabado-card';
        
        html += `
            <div class="${classe}" onclick="abrirEditorPlantao('${sabado.dataISO}', '${sabado.formatada}')">
                <div class="sabado-dia">${sabado.dia}</div>
                <div class="sabado-mes">${sabado.mes}</div>
                <div class="sabado-ano">${sabado.data.getFullYear()}</div>
                ${temPlantao ? '<span class="badge-plantao">✓ Lançado</span>' : ''}
            </div>
        `;
    });
    
    return html;
}

function renderPlantoesLancados() {
    if (!plantoesLancados || plantoesLancados.length === 0) {
        return '<div class="empty-state">Nenhum plantão lançado ainda</div>';
    }
    
    // Ordena por data
    const ordenados = [...plantoesLancados].sort((a, b) => 
        new Date(b.dataISO) - new Date(a.dataISO)
    );
    
    let html = '';
    
    ordenados.forEach(plantao => {
        const dataFormatada = new Date(plantao.dataISO).toLocaleDateString('pt-BR');
        
        html += `
            <div class="plantao-card">
                <div class="plantao-header">
                    <span class="plantao-data">📅 ${dataFormatada}</span>
                    <div class="plantao-actions">
                        <button onclick="editarPlantao('${plantao.dataISO}')" class="btn-icon-sm edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="excluirPlantao('${plantao.dataISO}')" class="btn-icon-sm delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="plantao-colaboradores">
                    ${renderColaboradoresPlantao(plantao.colaboradores)}
                </div>
            </div>
        `;
    });
    
    return html;
}

function renderColaboradoresPlantao(colaboradoresIds) {
    if (!colaboradoresIds || colaboradoresIds.length === 0) {
        return '<span class="sem-colaboradores">Nenhum colaborador selecionado</span>';
    }
    
    let html = '';
    
    colaboradoresIds.forEach(id => {
        const colaborador = colaboradores.find(c => c.Id === id);
        if (colaborador) {
            html += `
                <span class="colaborador-tag">
                    <i class="fas fa-user"></i> ${colaborador.Nome}
                </span>
            `;
        }
    });
    
    return html;
}

function abrirEditorPlantao(dataISO, dataFormatada) {
    console.log("Abrindo editor para sábado:", dataISO);
    
    const editorPanel = document.getElementById('plantaoEditor');
    const editorTitle = document.getElementById('plantaoDataTitle');
    const editorContent = document.getElementById('plantaoEditorContent');
    
    if (!editorPanel || !editorTitle || !editorContent) return;
    
    // Mostra o painel
    editorPanel.style.display = 'block';
    
    // Atualiza o título
    editorTitle.innerText = `Plantão - ${dataFormatada}`;
    
    // Verifica se já existe plantão para esta data
    const plantaoExistente = plantoesLancados.find(p => p.dataISO === dataISO);
    
    // Gera o formulário
    let formHtml = `
        <div class="editor-plantao">
            <div class="editor-form-group">
                <label><i class="fas fa-users"></i> Selecione os colaboradores</label>
                <div class="colaboradores-checklist" id="checklistColaboradores">
                    ${renderChecklistColaboradores(plantaoExistente?.colaboradores || [])}
                </div>
            </div>
            
            <div class="editor-actions">
                <button onclick="salvarPlantao('${dataISO}')" class="btn-primary">
                    <i class="fas fa-save"></i> Salvar Plantão
                </button>
                <button onclick="fecharPlantaoEditor()" class="btn-secondary">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            </div>
        </div>
    `;
    
    editorContent.innerHTML = formHtml;
}

function renderChecklistColaboradores(selecionados = []) {
    if (!colaboradores || colaboradores.length === 0) {
        return '<div class="empty-msg"><i class="fas fa-users"></i><p>Nenhum colaborador cadastrado</p></div>';
    }
    
    let html = '';
    let count = 0;
    
    colaboradores.forEach(c => {
        const checked = selecionados.includes(c.Id) ? 'checked' : '';
        if (checked) count++;
        
        html += `
            <label class="colaborador-checkbox">
                <input type="checkbox" value="${c.Id}" ${checked}>
                <span class="checkbox-label">
                    <i class="fas fa-user-circle"></i>
                    <span><strong>${c.Nome}</strong></span>
                </span>
            </label>
        `;
    });
    
    html += `
        <div class="selecionados-count">
            <i class="fas fa-check-circle"></i>
            <span>${count} colaborador(es) selecionado(s)</span>
        </div>
    `;
    
    return html;
}
async function salvarPlantao(dataISO) {
    // Pega os colaboradores selecionados
    const checkboxes = document.querySelectorAll('#checklistColaboradores input:checked');
    const colaboradoresSelecionados = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (colaboradoresSelecionados.length === 0) {
        mostrarToast("Selecione pelo menos um colaborador", "error");
        return;
    }
    
    try {
        const response = await fetch('http://localhost:3000/api/plantoes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dataISO: dataISO,
                colaboradores: colaboradoresSelecionados
            })
        });
        
        if (!response.ok) throw new Error("Erro ao salvar");
        
        await carregarPlantoes();
        renderLancamentoPlantao(); // Recarrega a tela
        
        mostrarToast("Plantão salvo com sucesso!", "success");
        
    } catch (error) {
        console.error("Erro ao salvar plantão:", error);
        mostrarToast("Erro ao salvar plantão", "error");
    }
}

function fecharPlantaoEditor() {
    const editorPanel = document.getElementById('plantaoEditor');
    if (editorPanel) {
        editorPanel.style.display = 'none';
    }
}

function carregarPlantoesLancadosNaTela() {
    const container = document.getElementById('listaPlantoesLancados');
    if (container) {
        container.innerHTML = renderPlantoesLancados();
    }
}

function editarPlantao(dataISO) {
    // Encontra o sábado correspondente
    const sabado = document.querySelector(`[onclick*="${dataISO}"]`);
    if (sabado) {
        const dataFormatada = new Date(dataISO).toLocaleDateString('pt-BR');
        abrirEditorPlantao(dataISO, dataFormatada);
    }
}

async function excluirPlantao(dataISO) {
    if (!confirm("Tem certeza que deseja excluir este plantão?")) return;
    
    try {
        const response = await fetch(`http://localhost:3000/api/plantoes/${dataISO}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error("Erro ao excluir");
        
        await carregarPlantoes();
        renderLancamentoPlantao(); // Recarrega a tela
        
        mostrarToast("Plantão excluído com sucesso!", "success");
        
    } catch (error) {
        console.error("Erro ao excluir plantão:", error);
        mostrarToast("Erro ao excluir plantão", "error");
    }
}

function renderRelatorios() {
    const hoje = new Date();
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
    
    appContent.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-chart-bar"></i> Relatórios</h1>
            <p>Visualize e exporte relatórios do sistema</p>
        </div>

        <div class="relatorios-grid">
            <!-- CARD RELATÓRIO MENSAL COMPLETO -->
            <div class="relatorio-card">
                <div class="relatorio-card-header">
                    <i class="fas fa-calendar-alt"></i>
                    <h2>Relatório Mensal Completo</h2>
                </div>
                <div class="relatorio-card-body">
                    <p class="relatorio-descricao">
                        Férias, folgas, ausências e feriados do mês selecionado.
                    </p>
                    
                    <div class="relatorio-filtros">
                        <div class="filtro-group">
                            <label><i class="fas fa-calendar"></i> Mês/Ano</label>
                            <div class="mes-selector">
                                <select id="relatorioMesCompleto" class="form-control">
                                    ${gerarOptionsMeses(mesAtual)}
                                </select>
                                <input type="number" id="relatorioAnoCompleto" class="form-control" value="${anoAtual}" min="2020" max="2030">
                            </div>
                        </div>
                    </div>
                    
                    <div class="relatorio-actions">
                        <button onclick="gerarRelatorioCompleto()" class="btn-primary">
                            <i class="fas fa-file-pdf"></i> Visualizar
                        </button>
                        <button onclick="exportarRelatorioCompleto()" class="btn-secondary">
                            <i class="fas fa-download"></i> Exportar
                        </button>
                    </div>
                </div>
            </div>

            <!-- CARD RELATÓRIO DE ESCALA -->
            <div class="relatorio-card">
                <div class="relatorio-card-header">
                    <i class="fas fa-users"></i>
                    <h2>Relatório de Escala</h2>
                </div>
                <div class="relatorio-card-body">
                    <p class="relatorio-descricao">
                        Escala dos colaboradores (segunda a sábado) com resumo de sábados.
                    </p>
                    
                    <div class="relatorio-filtros">
                        <div class="filtro-group">
                            <label><i class="fas fa-calendar"></i> Mês/Ano</label>
                            <div class="mes-selector">
                                <select id="relatorioMesEscala" class="form-control">
                                    ${gerarOptionsMeses(mesAtual)}
                                </select>
                                <input type="number" id="relatorioAnoEscala" class="form-control" value="${anoAtual}" min="2020" max="2030">
                            </div>
                        </div>
                        
                        <div class="filtro-group">
                            <label><i class="fas fa-filter"></i> Tipo</label>
                            <select id="relatorioTipoEscala" class="form-control">
                                <option value="completo">Escala Completa</option>
                                <option value="sabados">Apenas Sábados</option>
                                <option value="resumo">Resumo Geral</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="relatorio-actions">
                        <button onclick="gerarRelatorioEscala()" class="btn-primary">
                            <i class="fas fa-file-pdf"></i> Visualizar
                        </button>
                        <button onclick="exportarRelatorioEscala()" class="btn-secondary">
                            <i class="fas fa-download"></i> Exportar
                        </button>
                    </div>
                </div>
            </div>

            <!-- CARD RELATÓRIO DE PLANTÕES -->
            <div class="relatorio-card">
                <div class="relatorio-card-header">
                    <i class="fas fa-calendar-week"></i>
                    <h2>Relatório de Plantões</h2>
                </div>
                <div class="relatorio-card-body">
                    <p class="relatorio-descricao">
                        Plantões de sábado lançados no período.
                    </p>
                    
                    <div class="relatorio-filtros">
                        <div class="filtro-group">
                            <label><i class="fas fa-calendar"></i> Período</label>
                            <div class="periodo-selector">
                                <input type="month" id="relatorioPlantaoInicio" class="form-control" value="${anoAtual}-${String(mesAtual+1).padStart(2,'0')}">
                                <span>até</span>
                                <input type="month" id="relatorioPlantaoFim" class="form-control" value="${anoAtual}-${String(mesAtual+1).padStart(2,'0')}">
                            </div>
                        </div>
                    </div>
                    
                    <div class="relatorio-actions">
                        <button onclick="gerarRelatorioPlantoes()" class="btn-primary">
                            <i class="fas fa-file-pdf"></i> Visualizar
                        </button>
                        <button onclick="exportarRelatorioPlantoes()" class="btn-secondary">
                            <i class="fas fa-download"></i> Exportar
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- ÁREA DE VISUALIZAÇÃO DO RELATÓRIO -->
        <div id="relatorioVisualizacao" class="relatorio-visualizacao" style="display: none;">
            <div class="relatorio-visualizacao-header">
                <h3><i class="fas fa-file-alt"></i> <span id="relatorioTitulo"></span></h3>
                <button onclick="fecharRelatorio()" class="btn-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div id="relatorioConteudo" class="relatorio-conteudo">
                <!-- Conteúdo do relatório será inserido aqui -->
            </div>
        </div>
    `;
}
function gerarOptionsMeses(mesSelecionado) {
    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    let options = '';
    meses.forEach((mes, index) => {
        const selected = index === mesSelecionado ? 'selected' : '';
        options += `<option value="${index}" ${selected}>${mes}</option>`;
    });
    
    return options;
}

// ========== RELATÓRIO MENSAL COMPLETO ==========
async function gerarRelatorioCompleto() {
    const mes = parseInt(document.getElementById('relatorioMesCompleto').value);
    const ano = parseInt(document.getElementById('relatorioAnoCompleto').value);
    
    console.log("📊 Gerando relatório para:", mes + 1, "/", ano);
    console.log("Recarregando dados...");

    // 🔥 IMPORTANTE: Carregar todos os dados
    await carregarColaboradores();
    await carregarAusencias();
    await carregarFeriadosLocais();
    await carregarFeriadosAPI(ano); // 🔥 Carregar feriados da API

    console.log("Dados carregados:", {
        colaboradores: colaboradores.length,
        ausencias: ausencias.length,
        feriadosLocais: feriadosLocais.length,
        feriadosAPI: feriadosAPI.length
    });

    // Gerar o relatório calendário
    gerarRelatorioCalendarioCompleto(mes, ano);
}

// Função principal para gerar o relatório calendário
function gerarRelatorioCalendarioCompleto(mes, ano) {
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const primeiroDia = new Date(ano, mes, 1).getDay(); // 0 = Domingo
    
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    // Estruturas para armazenar os dados
    const eventosPorData = {};
    const ferias = [];
    const folgas = [];
    const ausenciasLista = [];
    const feriadosLista = [];
    
    // Inicializar eventosPorData para todos os dias do mês
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        eventosPorData[dataISO] = {
            feriado: null,
            colaboradores: []
        };
    }
    
    // 🔥 PROCESSAR FERIADOS DA API (nacionais)
    if (feriadosAPI && feriadosAPI.length > 0) {
        console.log("📅 Processando feriados da API para visualização:", feriadosAPI.length);
        
        feriadosAPI.forEach(f => {
            if (f.date) {
                const [anoF, mesF, diaF] = f.date.split('-').map(Number);
                // Verificar se é do mês/ano selecionado
                if (anoF === ano && mesF === mes + 1) {
                    const dataISO = f.date;
                    if (eventosPorData[dataISO]) {
                        eventosPorData[dataISO].feriado = f.name;
                        feriadosLista.push({
                            nome: f.name,
                            data: dataISO,
                            dataFormatada: formatarDataBR(dataISO),
                            tipo: 'federal'
                        });
                        console.log(`✅ Feriado nacional na visualização: ${f.name} em ${dataISO}`);
                    }
                }
            }
        });
    } else {
        console.log("⚠️ Nenhum feriado da API carregado para visualização");
    }
    
    // 🔥 PROCESSAR FERIADOS LOCAIS (manuais do banco de dados)
    if (window.feriadosLocais && window.feriadosLocais.length > 0) {
        console.log("🏛️ Processando feriados locais para visualização:", window.feriadosLocais.length);
        
        window.feriadosLocais.forEach(f => {
            // Pega a data (pode estar em Data ou data)
            const dataFeriado = f.Data || f.data;
            if (!dataFeriado) return;
            
            const data = new Date(dataFeriado);
            if (isNaN(data.getTime())) return;
            
            // Verifica se é do mês/ano selecionado
            if (data.getMonth() === mes && data.getFullYear() === ano) {
                const dia = data.getDate();
                const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                
                const nome = f.Nome || f.nome || 'Feriado';
                const tipo = f.Tipo || f.tipo || 'municipal';
                
                // Só adicionar se já não tiver um feriado no mesmo dia
                if (!eventosPorData[dataISO].feriado) {
                    eventosPorData[dataISO].feriado = nome;
                    feriadosLista.push({
                        nome: nome,
                        data: dataISO,
                        dataFormatada: formatarDataBR(dataISO),
                        tipo: tipo
                    });
                    console.log(`✅ Feriado local na visualização: ${nome} em ${dataISO} (${tipo})`);
                }
            }
        });
    }
    
    // 🔥 PROCESSAR AUSÊNCIAS (lançamentos dos colaboradores)
    if (window.ausencias && window.ausencias.length > 0 && 
        window.colaboradores && window.colaboradores.length > 0) {
        
        console.log("👥 Processando ausências para visualização:", window.ausencias.length);
        
        window.ausencias.forEach(a => {
            if (!a.DataInicio || !a.DataFim) return;
            
            const dataInicio = new Date(a.DataInicio);
            const dataFim = new Date(a.DataFim);
            
            // Verificar se o período cruza com o mês selecionado
            const primeiroDiaMes = new Date(ano, mes, 1);
            const ultimoDiaMes = new Date(ano, mes + 1, 0);
            
            if (dataFim >= primeiroDiaMes && dataInicio <= ultimoDiaMes) {
                
                const colaborador = window.colaboradores.find(c => c.Id === (a.colaboradorId || a.ColaboradorId));
                if (!colaborador) return;
                
                const tipo = (a.tipo || a.Tipo || '').toLowerCase();
                const nomeColaborador = colaborador.Nome || 'Desconhecido';
                
                // Determinar o período dentro do mês
                const primeiroDiaPeriodo = dataInicio < primeiroDiaMes ? primeiroDiaMes : dataInicio;
                const ultimoDiaPeriodo = dataFim > ultimoDiaMes ? ultimoDiaMes : dataFim;
                
                const diaInicio = primeiroDiaPeriodo.getDate();
                const diaFim = ultimoDiaPeriodo.getDate();
                
                for (let dia = diaInicio; dia <= diaFim; dia++) {
                    const dataDia = new Date(ano, mes, dia);
                    const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                    
                    // Adicionar aos eventos do dia
                    eventosPorData[dataISO].colaboradores.push({
                        nome: nomeColaborador,
                        tipo: tipo
                    });
                    
                    // Adicionar às listas específicas
                    const eventoInfo = {
                        colaborador: nomeColaborador,
                        data: dataISO,
                        dataFormatada: formatarDataBR(dataISO),
                        tipo: tipo
                    };
                    
                    if (tipo === 'ferias') {
                        ferias.push(eventoInfo);
                    } else if (tipo === 'folga') {
                        folgas.push(eventoInfo);
                    } else if (tipo === 'ausencia') {
                        ausenciasLista.push(eventoInfo);
                    }
                }
            }
        });
        
        console.log("📊 Eventos encontrados na visualização:", {
            ferias: ferias.length,
            folgas: folgas.length,
            ausencias: ausenciasLista.length,
            feriados: feriadosLista.length
        });
    }
    
    // Ordenar as listas por data
    ferias.sort((a, b) => a.data.localeCompare(b.data));
    folgas.sort((a, b) => a.data.localeCompare(b.data));
    ausenciasLista.sort((a, b) => a.data.localeCompare(b.data));
    feriadosLista.sort((a, b) => a.data.localeCompare(b.data));
    
    // Mostrar o relatório
    mostrarRelatorioCalendarioCompleto(
        meses[mes], ano, primeiroDia, diasNoMes, 
        eventosPorData, ferias, folgas, ausenciasLista, feriadosLista, mes
    );
}

// Função para mostrar o relatório calendário
function mostrarRelatorioCalendarioCompleto(mesNome, ano, primeiroDia, diasNoMes, eventosPorData, ferias, folgas, ausencias, feriados, mes) {
    const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    
    console.log("📊 Renderizando relatório com:", {
        feriados: feriados.length,
        ferias: ferias.length,
        folgas: folgas.length,
        ausencias: ausencias.length
    });
    
    let html = `
        <div class="relatorio-calendario">
            <div class="calendario-titulo">
                <h2>${ano}</h2>
                <h3>${mesNome.toUpperCase()}</h3>
            </div>
            
            <table class="calendario-tabela">
                <thead>
                    <tr>
                        ${diasSemana.map(dia => `<th>${dia}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    <tr>
    `;
    
    // Preencher dias vazios do início
    for (let i = 0; i < primeiroDia; i++) {
        html += '<td class="vazio"></td>';
    }
    
    // Preencher os dias do mês
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const dataISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const eventos = eventosPorData[dataISO];
        const isFeriado = eventos?.feriado;
        
        // DEBUG: Mostrar feriados no console
        if (isFeriado) {
            console.log(`📅 Dia ${dia}: ${eventos.feriado}`);
        }
        
        // Coletar colaboradores por tipo para este dia
        const colaboradoresDia = eventos?.colaboradores || [];
        const folgasDia = colaboradoresDia.filter(c => c.tipo === 'folga').map(c => c.nome);
        const feriasDia = colaboradoresDia.filter(c => c.tipo === 'ferias').map(c => c.nome);
        const ausenciasDia = colaboradoresDia.filter(c => c.tipo === 'ausencia').map(c => c.nome);
        
        html += `<td class="${isFeriado ? 'feriado' : ''}">`;
        html += `<div class="dia-numero">${dia}</div>`;
        
        // Mostrar feriado se houver (inclui feriados locais e da API)
        if (isFeriado) {
            html += `<div class="dia-feriado" title="${eventos.feriado}">📅 ${eventos.feriado}</div>`;
        }
        
        // Mostrar folgas
        if (folgasDia.length > 0) {
            html += `<div class="dia-folgas">`;
            folgasDia.slice(0, 2).forEach(nome => {
                const nomeCurto = nome.length > 15 ? nome.substring(0, 12) + '...' : nome;
                html += `<span class="folga-tag" title="${nome}">🌸 ${nomeCurto}</span>`;
            });
            if (folgasDia.length > 2) {
                html += `<span class="mais-tag">+${folgasDia.length - 2}</span>`;
            }
            html += `</div>`;
        }
        
        // Mostrar férias
        if (feriasDia.length > 0) {
            html += `<div class="dia-ferias">`;
            feriasDia.slice(0, 2).forEach(nome => {
                const nomeCurto = nome.length > 15 ? nome.substring(0, 12) + '...' : nome;
                html += `<span class="ferias-tag" title="${nome}">🏖️ ${nomeCurto}</span>`;
            });
            if (feriasDia.length > 2) {
                html += `<span class="mais-tag">+${feriasDia.length - 2}</span>`;
            }
            html += `</div>`;
        }
        
        // Mostrar ausências
        if (ausenciasDia.length > 0) {
            html += `<div class="dia-ausencias">`;
            ausenciasDia.slice(0, 2).forEach(nome => {
                const nomeCurto = nome.length > 15 ? nome.substring(0, 12) + '...' : nome;
                html += `<span class="ausencia-tag" title="${nome}">⚠️ ${nomeCurto}</span>`;
            });
            if (ausenciasDia.length > 2) {
                html += `<span class="mais-tag">+${ausenciasDia.length - 2}</span>`;
            }
            html += `</div>`;
        }
        
        html += '</td>';
        
        // Quebrar linha no sábado
        if ((primeiroDia + dia) % 7 === 0) {
            html += '</tr><tr>';
        }
    }
    
    // Preencher dias vazios do final
    const totalCelulas = Math.ceil((primeiroDia + diasNoMes) / 7) * 7;
    const celulasRestantes = totalCelulas - (primeiroDia + diasNoMes);
    for (let i = 0; i < celulasRestantes; i++) {
        html += '<td class="vazio"></td>';
    }
    
    html += `
                    </tr>
                </tbody>
            </table>
            
            <!-- LEGENDAS -->
            <div class="calendario-legendas">
                <div class="legenda-item">
                    <span class="legenda-cor ferias-cor"></span>
                    <span>Férias</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor folga-cor"></span>
                    <span>Folga</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor ausencia-cor"></span>
                    <span>Ausência</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor feriado-cor"></span>
                    <span>Feriado</span>
                </div>
            </div>
    `;
    
    // LISTAS RESUMO (igual ao que você já tem)
    html += `
            <div class="calendario-resumo">
                <!-- FERIADOS -->
                <div class="resumo-coluna">
                    <h4>📅 Feriados (${feriados.length})</h4>
                    <table class="resumo-tabela">
                        <thead>
                            <tr>
                                <th>Feriado</th>
                                <th>Data</th>
                                <th>Tipo</th>
                            </tr>
                        </thead>
                        <tbody>
    `;
    
    if (feriados.length > 0) {
        feriados.slice(0, 10).forEach(f => {
            html += `
                <tr>
                    <td><strong>${f.nome.length > 25 ? f.nome.substring(0, 22) + '...' : f.nome}</strong></td>
                    <td>${f.dataFormatada}</td>
                    <td>${f.tipo || 'municipal'}</td>
                </tr>
            `;
        });
        
        if (feriados.length > 10) {
            html += `<tr><td colspan="3" style="text-align: center; color: var(--text-light);">... e mais ${feriados.length - 10} feriado(s)</td></tr>`;
        }
    } else {
        html += `<tr><td colspan="3" style="text-align: center; color: var(--text-light);">Nenhum feriado no período</td></tr>`;
    }
    
    // Continuar com as outras listas (férias, folgas, ausências)...
    // [Mantenha o resto do código igual]
    
    html += `
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- RESUMO GERAL -->
            <div class="relatorio-total">
                <strong>Total de lançamentos no mês: ${ferias.length + folgas.length + ausencias.length + feriados.length}</strong><br>
                <small>${feriados.length} feriados, ${ferias.length} férias, ${folgas.length} folgas, ${ausencias.length} ausências</small>
            </div>
        </div>
    `;
    
    document.getElementById('relatorioTitulo').innerText = `Relatório de ${mesNome} ${ano}`;
    document.getElementById('relatorioConteudo').innerHTML = html;
    document.getElementById('relatorioVisualizacao').style.display = 'block';
}

// ========== RELATÓRIO DE ESCALA ==========
function gerarRelatorioEscala() {
    const mes = parseInt(document.getElementById('relatorioMesEscala').value);
    const ano = parseInt(document.getElementById('relatorioAnoEscala').value);
    const tipo = document.getElementById('relatorioTipoEscala').value;
    
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const escala = [];
    
    // Cabeçalho da escala
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const data = new Date(ano, mes, dia);
        const diaSemana = data.getDay(); // 0=Dom, 1=Seg, ..., 6=Sáb
        
        // Filtra apenas segunda a sábado (1-6)
        if (diaSemana >= 1 && diaSemana <= 6) {
            const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
            
            const registro = {
                data: `${dia}/${String(mes+1).padStart(2,'0')}`,
                diaSemana: data.toLocaleDateString('pt-BR', { weekday: 'short' }),
                colaboradores: []
            };
            
            // Busca plantão do sábado
            if (diaSemana === 6) {
                const plantao = plantoesLancados?.find(p => p.dataISO === dataISO);
                if (plantao) {
                    plantao.colaboradores.forEach(id => {
                        const colab = colaboradores.find(c => c.Id === id);
                        if (colab) {
                            registro.colaboradores.push({
                                nome: colab.Nome,
                                tipo: 'plantao'
                            });
                        }
                    });
                }
            }
            
            // Busca ausências do dia
            const ausenciasDoDia = ausencias.filter(a => {
                const dataInicio = new Date(a.DataInicio).toISOString().split('T')[0];
                const dataFim = new Date(a.DataFim).toISOString().split('T')[0];
                return dataISO >= dataInicio && dataISO <= dataFim;
            });
            
            ausenciasDoDia.forEach(a => {
                const colaborador = colaboradores.find(c => c.Id === (a.colaboradorId || a.ColaboradorId));
                if (colaborador) {
                    registro.colaboradores.push({
                        nome: colaborador.Nome,
                        tipo: a.tipo
                    });
                }
            });
            
            escala.push(registro);
        }
    }
    
    if (tipo === 'sabados') {
        mostrarRelatorio('Relatório de Sábados', renderRelatorioSabados(escala.filter(d => d.diaSemana.toLowerCase().includes('sáb'))));
    } else if (tipo === 'resumo') {
        mostrarRelatorio('Resumo de Escala', renderResumoEscala(escala));
    } else {
        mostrarRelatorio('Relatório de Escala', renderRelatorioEscala(escala, mes, ano));
    }
}

function renderRelatorioEscala(dados, mes, ano) {
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    let html = `
        <div class="relatorio-tabela-container">
            <h4>${meses[mes]} de ${ano} - Segunda a Sábado</h4>
            <table class="relatorio-tabela">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Dia</th>
                        <th>Colaboradores</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    dados.forEach(d => {
        html += `
            <tr>
                <td><strong>${d.data}</strong></td>
                <td>${d.diaSemana}</td>
                <td>
        `;
        
        if (d.colaboradores.length === 0) {
            html += '<span class="sem-eventos">Nenhum</span>';
        } else {
            d.colaboradores.forEach(c => {
                const tipoClass = c.tipo === 'plantao' ? 'badge-plantao' :
                                 c.tipo === 'ferias' ? 'badge-ferias' : 
                                 c.tipo === 'ausencia' ? 'badge-ausencia' : 
                                 'badge-folga';
                html += `
                    <div class="evento-item">
                        <span class="evento-colaborador">${c.nome}</span>
                        <span class="evento-tipo ${tipoClass}">${c.tipo}</span>
                    </div>
                `;
            });
        }
        
        html += `</td></tr>`;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    return html;
}

function renderRelatorioSabados(dados) {
    let html = `
        <div class="relatorio-tabela-container">
            <h4>Plantões de Sábado</h4>
            <table class="relatorio-tabela">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Colaboradores</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    dados.forEach(d => {
        html += `
            <tr>
                <td><strong>${d.data}</strong></td>
                <td>
        `;
        
        if (d.colaboradores.length === 0) {
            html += '<span class="sem-eventos">Sem plantão</span>';
        } else {
            const plantonistas = d.colaboradores
                .filter(c => c.tipo === 'plantao')
                .map(c => c.nome)
                .join(', ');
            html += plantonistas;
        }
        
        html += `</td></tr>`;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    return html;
}

function renderResumoEscala(dados) {
    // Contagem de eventos por tipo
    const resumo = {
        plantoes: 0,
        ferias: 0,
        ausencias: 0,
        folgas: 0,
        diasComPlantao: 0
    };
    
    dados.forEach(d => {
        if (d.colaboradores.length > 0) {
            let temPlantao = false;
            d.colaboradores.forEach(c => {
                if (c.tipo === 'plantao') {
                    resumo.plantoes++;
                    temPlantao = true;
                } else if (c.tipo === 'ferias') resumo.ferias++;
                else if (c.tipo === 'ausencia') resumo.ausencias++;
                else if (c.tipo === 'folga') resumo.folgas++;
            });
            if (temPlantao) resumo.diasComPlantao++;
        }
    });
    
    let html = `
        <div class="resumo-cards">
            <div class="resumo-card-estatistica">
                <i class="fas fa-calendar-week"></i>
                <div>
                    <strong>${resumo.diasComPlantao}</strong>
                    <span>Dias com plantão</span>
                </div>
            </div>
            <div class="resumo-card-estatistica">
                <i class="fas fa-user-clock"></i>
                <div>
                    <strong>${resumo.plantoes}</strong>
                    <span>Plantões</span>
                </div>
            </div>
            <div class="resumo-card-estatistica">
                <i class="fas fa-umbrella-beach"></i>
                <div>
                    <strong>${resumo.ferias}</strong>
                    <span>Férias</span>
                </div>
            </div>
            <div class="resumo-card-estatistica">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <strong>${resumo.ausencias}</strong>
                    <span>Ausências</span>
                </div>
            </div>
            <div class="resumo-card-estatistica">
                <i class="fas fa-leaf"></i>
                <div>
                    <strong>${resumo.folgas}</strong>
                    <span>Folgas</span>
                </div>
            </div>
        </div>
    `;
    
    return html;
}

// ========== RELATÓRIO DE PLANTÕES ==========
function gerarRelatorioPlantoes() {
    const inicio = document.getElementById('relatorioPlantaoInicio').value;
    const fim = document.getElementById('relatorioPlantaoFim').value;
    
    const [anoInicio, mesInicio] = inicio.split('-').map(Number);
    const [anoFim, mesFim] = fim.split('-').map(Number);
    
    const plantoesFiltrados = plantoesLancados?.filter(p => {
        const [ano, mes] = p.dataISO.split('-').map(Number);
        const dataPlantao = new Date(ano, mes-1, 1);
        const dataInicio = new Date(anoInicio, mesInicio-1, 1);
        const dataFim = new Date(anoFim, mesFim-1, 1);
        return dataPlantao >= dataInicio && dataPlantao <= dataFim;
    }) || [];
    
    mostrarRelatorio('Relatório de Plantões', renderRelatorioPlantoes(plantoesFiltrados));
}

function renderRelatorioPlantoes(dados) {
    if (dados.length === 0) {
        return '<div class="empty-state">Nenhum plantão encontrado no período</div>';
    }
    
    let html = `
        <div class="relatorio-tabela-container">
            <h4>Plantões Lançados</h4>
            <table class="relatorio-tabela">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Colaboradores</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    dados.sort((a, b) => new Date(b.dataISO) - new Date(a.dataISO));
    
    dados.forEach(p => {
        const dataFormatada = new Date(p.dataISO).toLocaleDateString('pt-BR');
        const colaboradoresNomes = p.colaboradores.map(id => {
            const colab = colaboradores.find(c => c.Id === id);
            return colab?.Nome || 'Desconhecido';
        }).join(', ');
        
        html += `
            <tr>
                <td><strong>${dataFormatada}</strong></td>
                <td>${colaboradoresNomes}</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
            <div class="relatorio-total">
                Total de plantões: <strong>${dados.length}</strong>
            </div>
        </div>
    `;
    
    return html;
}

// ========== FUNÇÕES GERAIS ==========
function mostrarRelatorio(titulo, conteudo) {
    document.getElementById('relatorioTitulo').innerText = titulo;
    document.getElementById('relatorioConteudo').innerHTML = conteudo;
    document.getElementById('relatorioVisualizacao').style.display = 'block';
}

function fecharRelatorio() {
    document.getElementById('relatorioVisualizacao').style.display = 'none';
}

// ========== FUNÇÕES DE EXPORTAÇÃO ==========
async function exportarRelatorioCompleto() {
    const mes = parseInt(document.getElementById('relatorioMesCompleto').value);
    const ano = parseInt(document.getElementById('relatorioAnoCompleto').value);
    
    await exportarComoPDF(mes, ano);
}

async function gerarRelatorioCalendarioParaExportar(mes, ano) {
    // Usar as variáveis globais já existentes
    console.log("Gerando relatório para:", mes, ano);
    console.log("Total de ausências:", ausencias?.length);
    console.log("Total de colaboradores:", colaboradores?.length);
    
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const primeiroDia = new Date(ano, mes, 1).getDay();
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    // Estruturas para armazenar os dados
    const eventosPorData = {};
    const ferias = [];
    const folgas = [];
    const ausenciasLista = [];
    const feriadosLista = [];
    
    // Inicializar eventosPorData para todos os dias do mês
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        eventosPorData[dataISO] = { 
            feriado: null, 
            colaboradores: [] 
        };
    }
    
    // Buscar feriados da API
    try {
        const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
        const feriadosAPI = await response.json();
        
        feriadosAPI.forEach(f => {
            if (eventosPorData[f.date]) {
                eventosPorData[f.date].feriado = f.name;
                feriadosLista.push({
                    data: f.date,
                    nome: f.name
                });
            }
        });
    } catch (error) {
        console.error("Erro ao carregar feriados:", error);
    }
    
    // 🔥 CORREÇÃO: Usar as ausências globais
    if (ausencias && ausencias.length > 0) {
        console.log("Processando ausências...");
        
        for (let dia = 1; dia <= diasNoMes; dia++) {
            const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
            
            // Filtrar ausências que incluem este dia
            const ausenciasDoDia = ausencias.filter(a => {
                if (!a.DataInicio || !a.DataFim) return false;
                
                // Extrair as datas no formato YYYY-MM-DD
                const dataInicio = a.DataInicio.split('T')[0];
                const dataFim = a.DataFim.split('T')[0];
                
                // Comparar strings diretamente (YYYY-MM-DD)
                return dataISO >= dataInicio && dataISO <= dataFim;
            });
            
            if (ausenciasDoDia.length > 0) {
                console.log(`Dia ${dia}: ${ausenciasDoDia.length} ausências`);
            }
            
            ausenciasDoDia.forEach(a => {
                const colaborador = colaboradores.find(c => c.Id === (a.colaboradorId || a.ColaboradorId));
                if (colaborador) {
                    const evento = {
                        nome: colaborador.Nome,
                        tipo: a.tipo
                    };
                    
                    eventosPorData[dataISO].colaboradores.push(evento);
                    
                    // Classificar por tipo para as listas
                    const eventoInfo = {
                        colaborador: colaborador.Nome,
                        data: dataISO,
                        dataFormatada: formatarDataBR(dataISO)
                    };
                    
                    if (a.tipo === 'ferias') {
                        ferias.push(eventoInfo);
                    } else if (a.tipo === 'folga') {
                        folgas.push(eventoInfo);
                    } else if (a.tipo === 'ausencia') {
                        ausenciasLista.push(eventoInfo);
                    }
                }
            });
        }
    } else {
        console.log("Nenhuma ausência encontrada");
    }
    
    // Ordenar as listas por data
    ferias.sort((a, b) => a.data.localeCompare(b.data));
    folgas.sort((a, b) => a.data.localeCompare(b.data));
    ausenciasLista.sort((a, b) => a.data.localeCompare(b.data));
    
    console.log("Total de eventos encontrados:", {
        ferias: ferias.length,
        folgas: folgas.length,
        ausencias: ausenciasLista.length,
        feriados: feriadosLista.length
    });
    
    return {
        mesNome: meses[mes],
        ano: ano,
        primeiroDia: primeiroDia,
        diasNoMes: diasNoMes,
        eventosPorData: eventosPorData,
        ferias: ferias,
        folgas: folgas,
        ausencias: ausenciasLista,
        feriados: feriadosLista,
        mes: mes
    };
}
function formatarDataBR(dataISO) {
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
}

async function exportarRelatorioPDF() {
    const elemento = document.querySelector('.relatorio-calendario');
    const titulo = document.getElementById('relatorioTitulo').innerText;
    
    if (!elemento) {
        mostrarToast('Relatório não encontrado!', 'error');
        return;
    }
    
    mostrarToast('Gerando PDF...', 'warning');
    
    try {
        const canvas = await html2canvas(elemento, {
            scale: 2,
            backgroundColor: '#ffffff'
        });
        
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jspdf.jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: [canvas.width * 0.75, canvas.height * 0.75]
        });
        
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width * 0.75, canvas.height * 0.75);
        pdf.save(`${titulo.replace(/ /g, '_')}.pdf`);
        
        mostrarToast('PDF gerado com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        mostrarToast('Erro ao gerar PDF', 'error');
    }
}

function exportarRelatorioEscala() {
    alert('Função de exportação será implementada em breve!');
}

function exportarRelatorioPlantoes() {
    alert('Função de exportação será implementada em breve!');
}

function gerarRelatorioCalendario(mes, ano) {
    // Agora usa mes e ano que vieram como parâmetro
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const primeiroDia = new Date(ano, mes, 1).getDay(); // 0 = Domingo
    
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    // Mapear eventos por data
    const eventosPorData = {};
    const ferias = [];
    const folgas = [];
    const ausencias = [];
    const feriadosLista = [];
    
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        eventosPorData[dataISO] = {
            feriado: null,
            colaboradores: []
        };
        
        // Verifica feriado
        const feriado = feriados?.find(f => f.date === dataISO);
        if (feriado) {
            eventosPorData[dataISO].feriado = feriado.name;
            feriadosLista.push({
                data: dataISO,
                nome: feriado.name
            });
        }
        
        // Verifica ausências do dia
        const ausenciasDoDia = ausencias.filter(a => {
            const dataInicio = new Date(a.DataInicio).toISOString().split('T')[0];
            const dataFim = new Date(a.DataFim).toISOString().split('T')[0];
            return dataISO >= dataInicio && dataISO <= dataFim;
        });
        
        ausenciasDoDia.forEach(a => {
            const colaborador = colaboradores.find(c => c.Id === (a.colaboradorId || a.ColaboradorId));
            if (colaborador) {
                eventosPorData[dataISO].colaboradores.push({
                    nome: colaborador.Nome,
                    tipo: a.tipo
                });
                
                if (a.tipo === 'ferias') {
                    ferias.push({
                        colaborador: colaborador.Nome,
                        data: dataISO
                    });
                } else if (a.tipo === 'folga') {
                    folgas.push({
                        colaborador: colaborador.Nome,
                        data: dataISO
                    });
                } else if (a.tipo === 'ausencia') {
                    ausencias.push({
                        colaborador: colaborador.Nome,
                        data: dataISO
                    });
                }
            }
        });
    }
    
    mostrarRelatorioCalendario(meses[mes], ano, primeiroDia, diasNoMes, eventosPorData, ferias, folgas, ausencias, feriadosLista, mes);
}


function mostrarRelatorioCalendario(mesNome, ano, primeiroDia, diasNoMes, eventosPorData, ferias, folgas, ausencias, feriados, mes) {
    const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    
    let html = `
        <div class="relatorio-calendario">
            <div class="calendario-titulo">
                <h2>${ano}</h2>
                <h3>${mesNome.toUpperCase()}</h3>
            </div>
            
            <table class="calendario-tabela">
                <thead>
                    <tr>
                        ${diasSemana.map(dia => `<th>${dia}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    <tr>
    `;
    
    // Preencher dias vazios do início
    for (let i = 0; i < primeiroDia; i++) {
        html += '<td class="vazio"></td>';
    }
    
    // Preencher os dias do mês
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const dataISO = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const eventos = eventosPorData[dataISO];
        const isFeriado = eventos?.feriado;
        
        // Coletar colaboradores por tipo para este dia
        const colaboradoresDia = eventos?.colaboradores || [];
        const folgasDia = colaboradoresDia.filter(c => c.tipo === 'folga').map(c => c.nome);
        const feriasDia = colaboradoresDia.filter(c => c.tipo === 'ferias').map(c => c.nome);
        const ausenciasDia = colaboradoresDia.filter(c => c.tipo === 'ausencia').map(c => c.nome);
        
        html += `<td class="${isFeriado ? 'feriado' : ''}">`;
        html += `<div class="dia-numero">${dia}</div>`;
        
        // Mostrar feriado se houver
        if (isFeriado) {
            html += `<div class="dia-feriado">${eventos.feriado}</div>`;
        }
        
        // Mostrar folgas
        if (folgasDia.length > 0) {
            html += `<div class="dia-folgas">`;
            folgasDia.forEach(nome => {
                html += `<span class="folga-tag">${nome}</span>`;
            });
            html += `</div>`;
        }
        
        // Mostrar férias
        if (feriasDia.length > 0) {
            html += `<div class="dia-ferias">`;
            feriasDia.forEach(nome => {
                html += `<span class="ferias-tag">${nome}</span>`;
            });
            html += `</div>`;
        }
        
        // Mostrar ausências
        if (ausenciasDia.length > 0) {
            html += `<div class="dia-ausencias">`;
            ausenciasDia.forEach(nome => {
                html += `<span class="ausencia-tag">${nome}</span>`;
            });
            html += `</div>`;
        }
        
        html += '</td>';
        
        // Quebrar linha no sábado
        if ((primeiroDia + dia) % 7 === 0) {
            html += '</tr><tr>';
        }
    }
    
    // Preencher dias vazios do final
    const totalCelulas = Math.ceil((primeiroDia + diasNoMes) / 7) * 7;
    const celulasRestantes = totalCelulas - (primeiroDia + diasNoMes);
    for (let i = 0; i < celulasRestantes; i++) {
        html += '<td class="vazio"></td>';
    }
    
    html += `
                    </tr>
                </tbody>
            </table>
            
            <!-- LEGENDAS -->
            <div class="calendario-legendas">
                <div class="legenda-item">
                    <span class="legenda-cor ferias-cor"></span>
                    <span>Férias</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor folga-cor"></span>
                    <span>Folga</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor ausencia-cor"></span>
                    <span>Ausência</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor feriado-cor"></span>
                    <span>Feriado</span>
                </div>
            </div>
    `;
    
    // LISTAS RESUMO
    html += `
            <div class="calendario-resumo">
                <div class="resumo-coluna">
                    <h4>Férias</h4>
                    <table class="resumo-tabela">
                        <thead>
                            <tr>
                                <th>Colaborador</th>
                                <th>Início</th>
                                <th>Fim</th>
                            </tr>
                        </thead>
                        <tbody>
    `;
    
    // Agrupar férias por colaborador
    const feriasAgrupadas = {};
    ferias.forEach(f => {
        if (!feriasAgrupadas[f.colaborador]) {
            feriasAgrupadas[f.colaborador] = [];
        }
        feriasAgrupadas[f.colaborador].push(f.data);
    });
    
    // Mostrar períodos de férias
    Object.keys(feriasAgrupadas).forEach(colab => {
        const datas = feriasAgrupadas[colab].sort();
        if (datas.length > 0) {
            html += `
                <tr>
                    <td><strong>${colab}</strong></td>
                    <td>${formatarData(datas[0])}</td>
                    <td>${formatarData(datas[datas.length-1])}</td>
                </tr>
            `;
        }
    });
    
    html += `
                        </tbody>
                    </table>
                </div>
                
                <div class="resumo-coluna">
                    <h4>Ausências</h4>
                    <table class="resumo-tabela">
                        <thead>
                            <tr>
                                <th>Colaborador</th>
                                <th>Data</th>
                            </tr>
                        </thead>
                        <tbody>
    `;
    
    // Mostrar ausências pontuais
    ausencias.slice(0, 10).forEach(a => {
        html += `
            <tr>
                <td>${a.colaborador}</td>
                <td>${formatarData(a.data)}</td>
            </tr>
        `;
    });
    
    if (ausencias.length > 10) {
        html += `<tr><td colspan="2">... e mais ${ausencias.length - 10} ausências</td></tr>`;
    }
    
    html += `
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('relatorioTitulo').innerText = `Relatório de ${mesNome} ${ano}`;
    document.getElementById('relatorioConteudo').innerHTML = html;
    document.getElementById('relatorioVisualizacao').style.display = 'block';
}

function formatarData(dataISO) {
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
}

async function exportarRelatorioPDF() {
    const elemento = document.querySelector('.relatorio-calendario');
    const titulo = document.getElementById('relatorioTitulo').innerText;
    
    if (!elemento) return;
    
    mostrarToast('Gerando PDF...', 'warning');
    
    try {
        // Captura o elemento como canvas
        const canvas = await html2canvas(elemento, {
            scale: 2,
            backgroundColor: '#ffffff'
        });
        
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jspdf.jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: [canvas.width * 0.75, canvas.height * 0.75]
        });
        
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width * 0.75, canvas.height * 0.75);
        pdf.save(`${titulo.replace(/ /g, '_')}.pdf`);
        
        mostrarToast('PDF gerado com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        mostrarToast('Erro ao gerar PDF', 'error');
    }
}
async function exportarRelatorioImagem() {
    const elemento = document.querySelector('.relatorio-calendario');
    const titulo = document.getElementById('relatorioTitulo').innerText;
    
    if (!elemento) return;
    
    mostrarToast('Gerando imagem...', 'warning');
    
    try {
        const canvas = await html2canvas(elemento, {
            scale: 2,
            backgroundColor: '#ffffff'
        });
        
        const link = document.createElement('a');
        link.download = `${titulo.replace(/ /g, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        mostrarToast('Imagem gerada com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao gerar imagem:', error);
        mostrarToast('Erro ao gerar imagem', 'error');
    }
}
function exportarRelatorioCSV() {
    const tabelas = document.querySelectorAll('.relatorio-tabela');
    const titulo = document.getElementById('relatorioTitulo').innerText;
    
    let csv = '';
    
    tabelas.forEach((tabela, index) => {
        const linhas = tabela.querySelectorAll('tr');
        
        linhas.forEach(linha => {
            const colunas = linha.querySelectorAll('th, td');
            const dados = Array.from(colunas).map(col => 
                `"${col.innerText.replace(/"/g, '""')}"`
            );
            csv += dados.join(',') + '\n';
        });
        
        if (index < tabelas.length - 1) {
            csv += '\n\n'; // Separa as tabelas
        }
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${titulo.replace(/ /g, '_')}.csv`;
    link.click();
    
    mostrarToast('CSV exportado com sucesso!', 'success');
}

function mostrarOpcoesExportacao(dados, mes, ano) {
    // Cria modal de opções
    const modal = document.createElement('div');
    modal.className = 'exportar-modal-overlay';
    modal.innerHTML = `
        <div class="exportar-modal">
            <div class="exportar-modal-header">
                <h3><i class="fas fa-download"></i> Exportar Relatório</h3>
                <button onclick="this.closest('.exportar-modal-overlay').remove()" class="btn-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="exportar-modal-body">
                <p>Escolha o formato para exportar:</p>
                
                <div class="exportar-opcoes">
                    <button onclick="exportarComoPDF(${mes}, ${ano})" class="exportar-opcao">
                        <i class="fas fa-file-pdf"></i>
                        <span>PDF</span>
                    </button>
                    
                    <button onclick="exportarComoImagem(${mes}, ${ano})" class="exportar-opcao">
                        <i class="fas fa-image"></i>
                        <span>Imagem</span>
                    </button>
                    
                    <button onclick="exportarComoCSV(${mes}, ${ano})" class="exportar-opcao">
                        <i class="fas fa-file-csv"></i>
                        <span>CSV</span>
                    </button>
                    
                    <button onclick="exportarComoJSON(${mes}, ${ano})" class="exportar-opcao">
                        <i class="fas fa-file-code"></i>
                        <span>JSON</span>
                    </button>
                </div>
            </div>
            
            <div class="exportar-modal-footer">
                <button onclick="this.closest('.exportar-modal-overlay').remove()" class="btn-secondary">
                    Cancelar
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}


// ========== FUNÇÕES DE EXPORTAÇÃO POR FORMATO ==========
async function exportarComoPDF(mes, ano) {
    document.querySelector('.exportar-modal-overlay')?.remove();
    mostrarToast('Gerando PDF... Aguarde', 'warning');
    
    try {
        // 🔥 IMPORTANTE: Garantir que todos os dados estão carregados
        await carregarColaboradores();
        await carregarAusencias();
        await carregarFeriadosLocais();
        
        console.log("📊 Exportando PDF para:", mes + 1, "/", ano);
        console.log("Dados carregados:", {
            colaboradores: colaboradores.length,
            ausencias: ausencias.length,
            feriadosLocais: feriadosLocais.length
        });
        
        // 🔥 Usar a MESMA função que gera o relatório na tela
        const dados = await gerarDadosRelatorioCompleto(mes, ano);
        
        console.log("✅ Dados processados:", {
            feriados: dados.feriados.length,
            ferias: dados.ferias.length,
            folgas: dados.folgas.length,
            ausencias: dados.ausencias.length
        });
        
        // Gera o HTML completo para o PDF
        const htmlPDF = gerarHTMLCompletoPDF(dados);
        
        // Cria um iframe temporário
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '1280px';  // Aumentado
        iframe.style.height = '800px';   // Ajustado
        iframe.style.left = '-9999px';
        iframe.style.top = '-9999px';
        document.body.appendChild(iframe);
        
        // Escreve o HTML no iframe
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(htmlPDF);
        iframeDoc.close();
        
        // Aguarda o carregamento
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Gera o PDF
        const canvas = await html2canvas(iframeDoc.body, {
            scale: 1.5,  // Reduzido para caber melhor
            backgroundColor: '#ffffff',
            windowWidth: 1280,
            windowHeight: 800,
            logging: false,
            allowTaint: true,
            useCORS: true
        });
        
        const imgData = canvas.toDataURL('image/png');
        
        // PDF na horizontal (landscape) - A4
        const pdf = new jspdf.jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });
        
        // Dimensões A4 landscape: 297mm x 210mm
        const pageWidth = 297;
        const pageHeight = 210;
        
        // Calcular dimensões da imagem para caber na página
        const imgWidth = pageWidth - 15;  // Margem menor
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // Se a altura exceder, redimensionar proporcionalmente
        if (imgHeight > pageHeight - 15) {
            const ratio = (pageHeight - 15) / imgHeight;
            pdf.addImage(imgData, 'PNG', 7.5, 7.5, imgWidth * ratio, pageHeight - 15);
        } else {
            // Centralizar verticalmente
            const yPos = (pageHeight - imgHeight) / 2;
            pdf.addImage(imgData, 'PNG', 7.5, yPos, imgWidth, imgHeight);
        }
        
        pdf.save(`Relatorio_${dados.mesNome}_${dados.ano}.pdf`);
        
        // Limpa o iframe
        document.body.removeChild(iframe);
        
        mostrarToast('PDF gerado com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao gerar PDF:', error);
        mostrarToast('Erro ao gerar PDF: ' + error.message, 'error');
    }
}

// ========== FUNÇÃO PARA GERAR DADOS DO RELATÓRIO COMPLETO ==========
async function gerarDadosRelatorioCompleto(mes, ano) {
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const primeiroDia = new Date(ano, mes, 1).getDay();
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    // Estruturas para armazenar os dados
    const eventosPorData = {};
    const ferias = [];
    const folgas = [];
    const ausenciasLista = [];
    const feriadosLista = [];
    
    // Inicializar eventosPorData para todos os dias do mês
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        eventosPorData[dataISO] = {
            feriado: null,
            colaboradores: []
        };
    }
    
    // 🔥 PROCESSAR FERIADOS DA API (nacionais)
    try {
        const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
        if (response.ok) {
            const feriadosAPI = await response.json();
            feriadosAPI.forEach(f => {
                if (eventosPorData[f.date]) {
                    eventosPorData[f.date].feriado = f.name;
                    feriadosLista.push({
                        nome: f.name,
                        data: f.date,
                        dataFormatada: formatarDataBR(f.date),
                        tipo: 'federal'
                    });
                }
            });
        }
    } catch (error) {
        console.error("Erro ao carregar feriados da API:", error);
    }
    
    // 🔥 PROCESSAR FERIADOS LOCAIS (manuais)
    if (window.feriadosLocais && window.feriadosLocais.length > 0) {
        window.feriadosLocais.forEach(f => {
            const dataFeriado = f.Data || f.data;
            if (!dataFeriado) return;
            
            const data = new Date(dataFeriado);
            if (isNaN(data.getTime())) return;
            
            if (data.getMonth() === mes && data.getFullYear() === ano) {
                const dia = data.getDate();
                const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                
                const nome = f.Nome || f.nome || 'Feriado';
                const tipo = f.Tipo || f.tipo || 'municipal';
                
                eventosPorData[dataISO].feriado = nome;
                feriadosLista.push({
                    nome: nome,
                    data: dataISO,
                    dataFormatada: formatarDataBR(dataISO),
                    tipo: tipo
                });
            }
        });
    }
    
    // 🔥 PROCESSAR AUSÊNCIAS
    if (window.ausencias && window.ausencias.length > 0 && 
        window.colaboradores && window.colaboradores.length > 0) {
        
        window.ausencias.forEach(a => {
            if (!a.DataInicio || !a.DataFim) return;
            
            const dataInicio = new Date(a.DataInicio);
            const dataFim = new Date(a.DataFim);
            
            const primeiroDiaMes = new Date(ano, mes, 1);
            const ultimoDiaMes = new Date(ano, mes + 1, 0);
            
            if (dataFim >= primeiroDiaMes && dataInicio <= ultimoDiaMes) {
                
                const colaborador = window.colaboradores.find(c => c.Id === (a.colaboradorId || a.ColaboradorId));
                if (!colaborador) return;
                
                const tipo = (a.tipo || a.Tipo || '').toLowerCase();
                const nomeColaborador = colaborador.Nome || 'Desconhecido';
                
                const primeiroDiaPeriodo = dataInicio < primeiroDiaMes ? primeiroDiaMes : dataInicio;
                const ultimoDiaPeriodo = dataFim > ultimoDiaMes ? ultimoDiaMes : dataFim;
                
                const diaInicio = primeiroDiaPeriodo.getDate();
                const diaFim = ultimoDiaPeriodo.getDate();
                
                for (let dia = diaInicio; dia <= diaFim; dia++) {
                    const dataDia = new Date(ano, mes, dia);
                    const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                    
                    eventosPorData[dataISO].colaboradores.push({
                        nome: nomeColaborador,
                        tipo: tipo
                    });
                    
                    const eventoInfo = {
                        colaborador: nomeColaborador,
                        data: dataISO,
                        dataFormatada: formatarDataBR(dataISO),
                        tipo: tipo
                    };
                    
                    if (tipo === 'ferias') {
                        ferias.push(eventoInfo);
                    } else if (tipo === 'folga') {
                        folgas.push(eventoInfo);
                    } else if (tipo === 'ausencia') {
                        ausenciasLista.push(eventoInfo);
                    }
                }
            }
        });
    }
    
    // Ordenar listas
    ferias.sort((a, b) => a.data.localeCompare(b.data));
    folgas.sort((a, b) => a.data.localeCompare(b.data));
    ausenciasLista.sort((a, b) => a.data.localeCompare(b.data));
    feriadosLista.sort((a, b) => a.data.localeCompare(b.data));
    
    return {
        mesNome: meses[mes],
        ano: ano,
        primeiroDia: primeiroDia,
        diasNoMes: diasNoMes,
        eventosPorData: eventosPorData,
        ferias: ferias,
        folgas: folgas,
        ausencias: ausenciasLista,
        feriados: feriadosLista,
        mes: mes
    };
}

async function exportarComoImagem(mes, ano) {
    document.querySelector('.exportar-modal-overlay')?.remove();
    mostrarToast('Gerando imagem...', 'warning');
    
    try {
        const dados = await gerarRelatorioCalendarioParaExportar(mes, ano);
        const relatorioHTML = renderizarRelatorioParaExportar(dados);
        
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.top = '-9999px';
        container.innerHTML = relatorioHTML;
        document.body.appendChild(container);
        
        const canvas = await html2canvas(container, {
            scale: 2,
            backgroundColor: '#ffffff'
        });
        
        const link = document.createElement('a');
        link.download = `Relatorio_${dados.mesNome}_${dados.ano}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        document.body.removeChild(container);
        mostrarToast('Imagem gerada com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao gerar imagem:', error);
        mostrarToast('Erro ao gerar imagem', 'error');
    }
}

function exportarComoCSV(mes, ano) {
    document.querySelector('.exportar-modal-overlay')?.remove();
    mostrarToast('Gerando CSV...', 'warning');
    
    // Coleta dados do mês
    const dados = coletarDadosParaCSV(mes, ano);
    
    // Gera CSV
    let csv = `Mês,${dados.mesNome} ${dados.ano}\n\n`;
    csv += 'Data,Dia da Semana,Feriado,Tipo,Colaborador\n';
    
    dados.eventos.forEach(e => {
        csv += `"${e.data}","${e.diaSemana}","${e.feriado || ''}","${e.tipo}","${e.colaborador}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_${dados.mesNome}_${dados.ano}.csv`;
    link.click();
    
    mostrarToast('CSV gerado com sucesso!', 'success');
}

function exportarComoJSON(mes, ano) {
    document.querySelector('.exportar-modal-overlay')?.remove();
    
    const dados = coletarDadosParaJSON(mes, ano);
    const jsonString = JSON.stringify(dados, null, 2);
    
    const blob = new Blob([jsonString], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_${dados.mesNome}_${dados.ano}.json`;
    link.click();
    
    mostrarToast('JSON gerado com sucesso!', 'success');
}

// ========== FUNÇÕES AUXILIARES ==========

function renderizarRelatorioParaExportar(dados) {
    const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    const { mesNome, ano, primeiroDia, diasNoMes, eventosPorData, mes } = dados;
    
    let html = `
        <div class="relatorio-calendario" style="font-family: Arial; padding: 20px; background: white;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="font-size: 32px; color: #6366f1; margin-bottom: 5px;">${ano}</h1>
                <h2 style="font-size: 24px; color: #1e293b; text-transform: uppercase;">${mesNome}</h2>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr>
                        ${diasSemana.map(dia => `<th style="padding: 12px; background: #6366f1; color: white; border: 1px solid #e2e8f0;">${dia}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    <tr>
    `;
    
    for (let i = 0; i < primeiroDia; i++) html += '<td style="border: 1px solid #e2e8f0; background: #f8fafc; height: 100px;"></td>';
    
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        const eventos = eventosPorData[dataISO];
        const isFeriado = eventos?.feriado;
        
        const colaboradoresDia = eventos?.colaboradores || [];
        const folgasDia = colaboradoresDia.filter(c => c.tipo === 'folga').map(c => c.nome);
        const feriasDia = colaboradoresDia.filter(c => c.tipo === 'ferias').map(c => c.nome);
        const ausenciasDia = colaboradoresDia.filter(c => c.tipo === 'ausencia').map(c => c.nome);
        
        html += `<td style="border: 1px solid #e2e8f0; vertical-align: top; padding: 8px; height: 100px; ${isFeriado ? 'background: #fee2e2;' : ''}">`;
        html += `<div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">${dia}</div>`;
        
        if (isFeriado) html += `<div style="font-size: 10px; color: #ef4444; margin-bottom: 5px;">${eventos.feriado}</div>`;
        
        folgasDia.forEach(nome => html += `<div style="font-size: 9px; background: #d1fae5; color: #10b981; padding: 2px 4px; border-radius: 4px; margin-top: 2px;">${nome}</div>`);
        feriasDia.forEach(nome => html += `<div style="font-size: 9px; background: #e0e7ff; color: #4f52e0; padding: 2px 4px; border-radius: 4px; margin-top: 2px;">${nome}</div>`);
        ausenciasDia.forEach(nome => html += `<div style="font-size: 9px; background: #fee2e2; color: #ef4444; padding: 2px 4px; border-radius: 4px; margin-top: 2px;">${nome}</div>`);
        
        html += '</td>';
        
        if ((primeiroDia + dia) % 7 === 0) html += '</tr><tr>';
    }
    
    html += '</tr></tbody></table></div>';
    
    return html;
}

function coletarDadosParaCSV(mes, ano) {
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const eventos = [];
    
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const data = new Date(ano, mes, dia);
        const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        const diaSemana = data.toLocaleDateString('pt-BR', { weekday: 'long' });
        
        const feriado = feriados?.find(f => f.date === dataISO);
        
        const ausenciasDoDia = ausencias.filter(a => {
            const dataInicio = new Date(a.DataInicio).toISOString().split('T')[0];
            const dataFim = new Date(a.DataFim).toISOString().split('T')[0];
            return dataISO >= dataInicio && dataISO <= dataFim;
        });
        
        if (ausenciasDoDia.length === 0 && !feriado) {
            eventos.push({
                data: `${dia}/${mes+1}/${ano}`,
                diaSemana: diaSemana,
                feriado: '',
                tipo: 'normal',
                colaborador: ''
            });
        }
        
        if (feriado) {
            eventos.push({
                data: `${dia}/${mes+1}/${ano}`,
                diaSemana: diaSemana,
                feriado: feriado.name,
                tipo: 'feriado',
                colaborador: ''
            });
        }
        
        ausenciasDoDia.forEach(a => {
            const colaborador = colaboradores.find(c => c.Id === (a.colaboradorId || a.ColaboradorId));
            eventos.push({
                data: `${dia}/${mes+1}/${ano}`,
                diaSemana: diaSemana,
                feriado: feriado?.name || '',
                tipo: a.tipo,
                colaborador: colaborador?.Nome || 'Desconhecido'
            });
        });
    }
    
    return {
        mesNome: meses[mes],
        ano: ano,
        eventos: eventos
    };
}

function coletarDadosParaJSON(mes, ano) {
    return {
        mes: mes + 1,
        ano: ano,
        colaboradores: colaboradores,
        ausencias: ausencias.filter(a => {
            const dataInicio = new Date(a.DataInicio);
            const dataFim = new Date(a.DataFim);
            return dataInicio.getMonth() === mes || dataFim.getMonth() === mes;
        })
    };
}

function gerarEstiloPDF() {
    return `
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #6366f1; text-align: center; font-size: 32px; margin-bottom: 5px; }
            h2 { color: #1e293b; text-align: center; font-size: 24px; text-transform: uppercase; margin-top: 0; margin-bottom: 30px; }
            
            .calendario-pdf {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 30px;
            }
            
            .calendario-pdf th {
                background: #6366f1;
                color: white;
                padding: 12px;
                font-weight: 600;
                font-size: 14px;
                border: 1px solid #cbd5e1;
            }
            
            .calendario-pdf td {
                border: 1px solid #cbd5e1;
                vertical-align: top;
                height: 100px;
                width: 14.28%;
                padding: 6px;
            }
            
            .calendario-pdf td.vazio {
                background: #f8fafc;
            }
            
            .calendario-pdf td.feriado {
                background: #fee2e2;
            }
            
            .dia-numero {
                font-weight: bold;
                font-size: 16px;
                margin-bottom: 5px;
            }
            
            .dia-feriado {
                font-size: 9px;
                color: #ef4444;
                font-weight: 600;
                margin-bottom: 5px;
            }
            
            .evento-tag {
                font-size: 8px;
                padding: 2px 4px;
                border-radius: 3px;
                margin-top: 2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .folga-tag {
                background: #d1fae5;
                color: #10b981;
            }
            
            .ferias-tag {
                background: #e0e7ff;
                color: #4f52e0;
            }
            
            .ausencia-tag {
                background: #fee2e2;
                color: #ef4444;
            }
            
            .legendas-pdf {
                display: flex;
                gap: 20px;
                margin-top: 20px;
                padding: 10px;
                background: #f8fafc;
                border-radius: 8px;
            }
            
            .legenda-item {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
            }
            
            .legenda-cor {
                width: 16px;
                height: 16px;
                border-radius: 4px;
            }
            
            .legenda-folga { background: #d1fae5; border: 1px solid #10b981; }
            .legenda-ferias { background: #e0e7ff; border: 1px solid #4f52e0; }
            .legenda-ausencia { background: #fee2e2; border: 1px solid #ef4444; }
            .legenda-feriado { background: #fee2e2; border: 1px solid #ef4444; }
        </style>
    `;
}

// ========== FUNÇÃO PARA GERAR HTML COMPLETO DO PDF ==========
// ========== FUNÇÃO PARA GERAR HTML COMPLETO DO PDF ==========
function gerarHTMLCompletoPDF(dados) {
    const { mesNome, ano, primeiroDia, diasNoMes, eventosPorData, mes, ferias, folgas, ausencias, feriados } = dados;
    const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    
    const totalEventos = ferias.length + folgas.length + ausencias.length + feriados.length;
    
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Relatório ${mesNome} ${ano}</title>
            <style>
                * {
                    box-sizing: border-box;
                    margin: 0;
                    padding: 0;
                }
                
                body { 
                    font-family: 'Inter', Arial, sans-serif; 
                    margin: 15px; 
                    background: white;
                    color: #1e293b;
                    width: 1200px; /* Largura fixa para landscape */
                }
                
                h1 { 
                    color: #6366f1; 
                    text-align: center; 
                    font-size: 28px; 
                    margin-bottom: 5px; 
                }
                
                h2 { 
                    color: #1e293b; 
                    text-align: center; 
                    font-size: 20px; 
                    text-transform: uppercase; 
                    margin-top: 0; 
                    margin-bottom: 15px; 
                }
                
                /* Calendário */
                .calendario-pdf {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 15px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    table-layout: fixed;
                }
                
                .calendario-pdf th {
                    background: #6366f1;
                    color: white;
                    padding: 8px;
                    font-weight: 600;
                    font-size: 12px;
                    border: 1px solid #cbd5e1;
                    text-align: center;
                    width: 14.28%;
                }
                
                .calendario-pdf td {
                    border: 1px solid #cbd5e1;
                    vertical-align: top;
                    height: 70px;
                    padding: 4px;
                    font-size: 10px;
                    background: white;
                    overflow: hidden;
                }
                
                .calendario-pdf td.vazio {
                    background: #f8fafc;
                }
                
                .calendario-pdf td.domingo {
                    background-color: #fef9c3 !important;
                }
                
                .calendario-pdf td.feriado {
                    background: #fee2e2;
                }
                
                .dia-numero {
                    font-weight: bold;
                    font-size: 14px;
                    margin-bottom: 2px;
                    color: #1e293b;
                }
                
                .dia-feriado {
                    font-size: 8px;
                    color: #dc2626;
                    font-weight: 600;
                    margin-bottom: 2px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    background: #fee2e2;
                    padding: 1px 3px;
                    border-radius: 3px;
                }
                
                .evento-tag {
                    font-size: 7px;
                    padding: 1px 3px;
                    border-radius: 3px;
                    margin-top: 1px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    font-weight: 500;
                }
                
                .folga-tag { 
                    background: #d1fae5; 
                    color: #059669; 
                    border-left: 2px solid #10b981;
                }
                .ferias-tag { 
                    background: #e0e7ff; 
                    color: #4f52e0; 
                    border-left: 2px solid #6366f1;
                }
                .ausencia-tag { 
                    background: #fee2e2; 
                    color: #dc2626; 
                    border-left: 2px solid #ef4444;
                }
                
                /* Legendas compactas */
                .legendas-pdf {
                    display: flex;
                    gap: 15px;
                    margin: 10px 0;
                    padding: 8px 12px;
                    background: #f8fafc;
                    border-radius: 6px;
                    flex-wrap: wrap;
                    border: 1px solid #e2e8f0;
                    font-size: 10px;
                }
                
                .legenda-item {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                
                .legenda-cor {
                    width: 12px;
                    height: 12px;
                    border-radius: 3px;
                }
                
                .legenda-folga { background: #d1fae5; border: 1px solid #059669; }
                .legenda-ferias { background: #e0e7ff; border: 1px solid #4f52e0; }
                .legenda-ausencia { background: #fee2e2; border: 1px solid #dc2626; }
                .legenda-feriado { background: #fee2e2; border: 1px solid #dc2626; }
                .legenda-domingo { background: #fef9c3; border: 1px solid #b45309; }
                
                /* Listas em grid 2x2 */
                .listas-container {
                    margin-top: 15px;
                }
                
                .listas-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                }
                
                .lista-card {
                    background: #f8fafc;
                    border-radius: 6px;
                    padding: 10px;
                    border: 1px solid #e2e8f0;
                }
                
                .lista-card h3 {
                    font-size: 13px;
                    font-weight: 700;
                    color: #1e293b;
                    margin: 0 0 8px 0;
                    padding-bottom: 5px;
                    border-bottom: 1px solid #e2e8f0;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                
                .lista-card table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 9px;
                }
                
                .lista-card th {
                    text-align: left;
                    padding: 3px;
                    background: #e2e8f0;
                    color: #475569;
                    font-weight: 600;
                    font-size: 8px;
                }
                
                .lista-card td {
                    padding: 2px 3px;
                    border-bottom: 1px solid #e2e8f0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 100px;
                }
                
                .lista-card td:first-child {
                    max-width: 80px;
                }
                
                .lista-card tr:last-child td {
                    border-bottom: none;
                }
                
                .empty-message {
                    text-align: center;
                    color: #64748b;
                    font-size: 9px;
                    padding: 10px;
                    font-style: italic;
                }
                
                /* Resumo rodapé */
                .resumo-rodape {
                    margin-top: 15px;
                    padding: 10px;
                    background: linear-gradient(135deg, #6366f1 0%, #4f52e0 100%);
                    border-radius: 6px;
                    text-align: center;
                    color: white;
                }
                
                .resumo-rodape strong {
                    font-size: 14px;
                }
                
                .resumo-rodape small {
                    display: block;
                    margin-top: 3px;
                    font-size: 10px;
                    opacity: 0.9;
                }
            </style>
        </head>
        <body>
            <h1>${ano}</h1>
            <h2>${mesNome.toUpperCase()}</h2>
            
            <!-- CALENDÁRIO -->
            <table class="calendario-pdf">
                <thead>
                    <tr>
                        ${diasSemana.map(dia => `<th>${dia}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
    `;
    
    let linhaAtual = '<tr>';
    
    // Dias vazios do início
    for (let i = 0; i < primeiroDia; i++) {
        linhaAtual += '<td class="vazio"></td>';
    }
    
    // Dias do mês
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const dataAtual = new Date(ano, mes, dia);
        const diaSemanaNum = dataAtual.getDay();
        const isDomingo = diaSemanaNum === 0;
        
        const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        const eventos = eventosPorData[dataISO];
        const isFeriado = eventos?.feriado;
        
        let classesCelula = [];
        if (isDomingo) classesCelula.push('domingo');
        if (isFeriado) classesCelula.push('feriado');
        
        const colaboradoresDia = eventos?.colaboradores || [];
        const folgasDia = colaboradoresDia.filter(c => c.tipo === 'folga').slice(0, 2); // Limita a 2 por dia
        const feriasDia = colaboradoresDia.filter(c => c.tipo === 'ferias').slice(0, 2);
        const ausenciasDia = colaboradoresDia.filter(c => c.tipo === 'ausencia').slice(0, 2);
        
        const temMais = colaboradoresDia.length > 2;
        
        linhaAtual += `<td class="${classesCelula.join(' ')}">`;
        linhaAtual += `<div class="dia-numero">${dia}</div>`;
        
        if (isFeriado) {
            const nomeFeriado = eventos.feriado.length > 15 ? eventos.feriado.substring(0, 12) + '...' : eventos.feriado;
            linhaAtual += `<div class="dia-feriado" title="${eventos.feriado}">📅 ${nomeFeriado}</div>`;
        }
        
        folgasDia.forEach(e => {
            const nome = e.nome.length > 10 ? e.nome.substring(0, 8) + '...' : e.nome;
            linhaAtual += `<div class="evento-tag folga-tag" title="${e.nome}">🌸 ${nome}</div>`;
        });
        
        feriasDia.forEach(e => {
            const nome = e.nome.length > 10 ? e.nome.substring(0, 8) + '...' : e.nome;
            linhaAtual += `<div class="evento-tag ferias-tag" title="${e.nome}">🏖️ ${nome}</div>`;
        });
        
        ausenciasDia.forEach(e => {
            const nome = e.nome.length > 10 ? e.nome.substring(0, 8) + '...' : e.nome;
            linhaAtual += `<div class="evento-tag ausencia-tag" title="${e.nome}">⚠️ ${nome}</div>`;
        });
        
        if (temMais) {
            linhaAtual += `<div style="font-size: 7px; color: #64748b; margin-top: 1px;">+${colaboradoresDia.length - 2}</div>`;
        }
        
        linhaAtual += '</td>';
        
        if ((primeiroDia + dia) % 7 === 0) {
            linhaAtual += '</tr>';
            html += linhaAtual;
            if (dia < diasNoMes) {
                linhaAtual = '<tr>';
            }
        }
    }
    
    // Completa a última linha
    if (linhaAtual !== '<tr>' && !linhaAtual.endsWith('</tr>')) {
        const celulasUsadas = (primeiroDia + diasNoMes) % 7;
        if (celulasUsadas > 0) {
            for (let i = celulasUsadas; i < 7; i++) {
                linhaAtual += '<td class="vazio"></td>';
            }
        }
        linhaAtual += '</tr>';
        html += linhaAtual;
    }
    
    html += `
                </tbody>
            </table>
            
            <!-- LEGENDAS -->
            <div class="legendas-pdf">
                <div class="legenda-item">
                    <span class="legenda-cor legenda-folga"></span>
                    <span>Folga (🌸)</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor legenda-ferias"></span>
                    <span>Férias (🏖️)</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor legenda-ausencia"></span>
                    <span>Ausência (⚠️)</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor legenda-feriado"></span>
                    <span>Feriado (📅)</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor legenda-domingo"></span>
                    <span>Domingo</span>
                </div>
            </div>
            
            <!-- LISTAS DETALHADAS (2x2) -->
            <div class="listas-container">
                <div class="listas-grid">
    `;
    
    // Card de Feriados
    html += `
                    <div class="lista-card">
                        <h3>📅 Feriados</h3>
                        ${feriados.length > 0 ? `
                        <table>
                            <thead>
                                <tr><th style="width: 60%">Feriado</th><th style="width: 40%">Data</th></tr>
                            </thead>
                            <tbody>
                                ${feriados.slice(0, 8).map(f => `
                                    <tr>
                                        <td title="${f.nome}">${f.nome.length > 18 ? f.nome.substring(0, 15) + '...' : f.nome}</td>
                                        <td>${f.dataFormatada}</td>
                                    </tr>
                                `).join('')}
                                ${feriados.length > 8 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${feriados.length - 8}</td></tr>` : ''}
                            </tbody>
                        </table>
                        ` : '<div class="empty-message">Nenhum feriado</div>'}
                    </div>
    `;
    
    // Card de Férias
    html += `
                    <div class="lista-card">
                        <h3>🏖️ Férias</h3>
                        ${ferias.length > 0 ? `
                        <table>
                            <thead>
                                <tr><th style="width: 60%">Colaborador</th><th style="width: 40%">Data</th></tr>
                            </thead>
                            <tbody>
                                ${ferias.slice(0, 8).map(f => `
                                    <tr>
                                        <td title="${f.colaborador}">${f.colaborador.length > 15 ? f.colaborador.substring(0, 12) + '...' : f.colaborador}</td>
                                        <td>${f.dataFormatada}</td>
                                    </tr>
                                `).join('')}
                                ${ferias.length > 8 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${ferias.length - 8}</td></tr>` : ''}
                            </tbody>
                        </table>
                        ` : '<div class="empty-message">Nenhuma férias</div>'}
                    </div>
    `;
    
    // Card de Folgas
    html += `
                    <div class="lista-card">
                        <h3>🌸 Folgas</h3>
                        ${folgas.length > 0 ? `
                        <table>
                            <thead>
                                <tr><th style="width: 60%">Colaborador</th><th style="width: 40%">Data</th></tr>
                            </thead>
                            <tbody>
                                ${folgas.slice(0, 8).map(f => `
                                    <tr>
                                        <td title="${f.colaborador}">${f.colaborador.length > 15 ? f.colaborador.substring(0, 12) + '...' : f.colaborador}</td>
                                        <td>${f.dataFormatada}</td>
                                    </tr>
                                `).join('')}
                                ${folgas.length > 8 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${folgas.length - 8}</td></tr>` : ''}
                            </tbody>
                        </table>
                        ` : '<div class="empty-message">Nenhuma folga</div>'}
                    </div>
    `;
    
    // Card de Ausências
    html += `
                    <div class="lista-card">
                        <h3>⚠️ Ausências</h3>
                        ${ausencias.length > 0 ? `
                        <table>
                            <thead>
                                <tr><th style="width: 60%">Colaborador</th><th style="width: 40%">Data</th></tr>
                            </thead>
                            <tbody>
                                ${ausencias.slice(0, 8).map(a => `
                                    <tr>
                                        <td title="${a.colaborador}">${a.colaborador.length > 15 ? a.colaborador.substring(0, 12) + '...' : a.colaborador}</td>
                                        <td>${a.dataFormatada}</td>
                                    </tr>
                                `).join('')}
                                ${ausencias.length > 8 ? `<tr><td colspan="2" style="text-align: center; color: #64748b;">... e mais ${ausencias.length - 8}</td></tr>` : ''}
                            </tbody>
                        </table>
                        ` : '<div class="empty-message">Nenhuma ausência</div>'}
                    </div>
                </div>
            </div>
            
            <!-- RESUMO GERAL -->
            <div class="resumo-rodape">
                <strong>Total de lançamentos no mês: ${totalEventos}</strong><br>
                <small>${feriados.length} feriados, ${ferias.length} férias, ${folgas.length} folgas, ${ausencias.length} ausências</small>
            </div>
        </body>
        </html>
    `;
    
    return html;
}
// ================= FERIADOS MUNICIPAIS/ESTADUAIS =================

// Carregar feriados locais do backend
async function carregarFeriadosLocais() {
    try {
        console.log("Carregando feriados do backend...");
        const response = await fetch('http://localhost:3000/api/feriados');
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        feriadosLocais = Array.isArray(data) ? data : [];
        
        // 🔥 ATUALIZAR A VARIÁVEL GLOBAL
        window.feriadosLocais = feriadosLocais;
        
        console.log(`Feriados locais carregados: ${feriadosLocais.length}`);
        return feriadosLocais;
        
    } catch (error) {
        console.error("Erro ao carregar feriados locais:", error);
        feriadosLocais = [];
        window.feriadosLocais = [];
        mostrarToast("Erro ao carregar feriados do banco", "error");
        return [];
    }
}

// Abrir modal de feriado
function abrirModalFeriado() {
    console.log("Abrindo modal de feriado...");

    const modal = document.getElementById('modalFeriado');
    if (!modal) {
        console.error("Modal de feriado não encontrado!");
        return;
    }

    // Mostra loading, esconde outros
    document.getElementById("loadingFeriados").classList.remove("hidden");
    document.getElementById("emptyFeriados").classList.add("hidden");
    document.getElementById("listaFeriados").classList.add("hidden");

    // Limpa formulário
    document.getElementById("feriadoNome").value = "";
    document.getElementById("feriadoData").value = "";
    document.getElementById("feriadoTipo").value = "municipal";

    editandoFeriadoId = null;
    document.getElementById("salvarFeriadoBtn").innerHTML = '<i class="fas fa-save"></i> Salvar Feriado';
    document.getElementById("cancelarEdicaoFeriadoBtn").classList.add("hidden");

    // Carrega a lista de feriados
    carregarListaFeriados();

    // Abre o modal
    modal.classList.remove("hidden");
    modal.classList.add("active");
}

// Carregar listagem de feriados
async function carregarListaFeriados() {

    const lista = document.getElementById("listaFeriados");

    if (!lista) return;

    lista.innerHTML = "";

    try {

        const feriados = await API.getFeriados();

        if (!feriados || feriados.length === 0) return;

        feriados.forEach(f => {

            const div = document.createElement("div");
            div.className = "item-lista";

            div.innerHTML = `
                <strong>${f.Nome}</strong>
                <span>${new Date(f.Data).toLocaleDateString("pt-BR")}</span>
                <button onclick="excluirFeriado(${f.Id})" class="btn-danger">
                    Excluir
                </button>
            `;

            lista.appendChild(div);

        });

    } catch (error) {

        console.error("Erro ao carregar feriados:", error);

    }

}

// Salvar feriado
async function salvarFeriado() {
    try {

        const dataInicio = normalizarData(document.getElementById("dataInicio").value);
        const dataFim = normalizarData(document.getElementById("dataFim").value);
        const nome = document.getElementById("feriadoNome").value;
        const tipo = document.getElementById("feriadoTipo").value;

        const data = {
            Nome: nome,
            Tipo: tipo,
            Data: dataInicio
        };

        await API.salvarFeriado(data);

        await carregarFeriadosLocais();
        await carregarListaFeriados();

        alert("Feriado salvo com sucesso!");

    } catch (error) {
        console.error("Erro ao salvar feriado:", error);
        alert("Erro ao salvar feriado");
    }
}

// Editar feriado
function editarFeriado(id) {
    console.log("Editando feriado ID:", id);
    
    const feriado = feriadosLocais.find(f => (f.Id === id || f.id === id));
    if (!feriado) {
        mostrarToast("Feriado não encontrado", "error");
        return;
    }

    editandoFeriadoId = id;
    
    document.getElementById("feriadoNome").value = feriado.Nome || feriado.nome;
    
    // Formata a data para o input
    if (feriado.Data || feriado.data) {
        const dataObj = new Date(feriado.Data || feriado.data);
        const dataFormatada = dataObj.toISOString().split('T')[0];
        document.getElementById("feriadoData").value = dataFormatada;
    }
    
    document.getElementById("feriadoTipo").value = feriado.Tipo || feriado.tipo || 'municipal';
    
    document.getElementById("salvarFeriadoBtn").innerHTML = '<i class="fas fa-check"></i> Atualizar';
    document.getElementById("cancelarEdicaoFeriadoBtn").classList.remove("hidden");
    
    document.querySelector('.form-section')?.scrollIntoView({ behavior: 'smooth' });
}

// Cancelar edição de feriado
function cancelarEdicaoFeriado() {
    editandoFeriadoId = null;
    document.getElementById("feriadoNome").value = "";
    document.getElementById("feriadoData").value = "";
    document.getElementById("feriadoTipo").value = "municipal";
    document.getElementById("salvarFeriadoBtn").innerHTML = '<i class="fas fa-save"></i> Salvar Feriado';
    document.getElementById("cancelarEdicaoFeriadoBtn").classList.add("hidden");
}

// Excluir feriado
async function excluirFeriado(id) {

    if (!confirm("Deseja realmente excluir este feriado?")) return;

    try {

        await API.excluirFeriado(id);

        await carregarFeriadosLocais();
        await carregarListaFeriados();

        console.log("Feriado removido");

    } catch (error) {

        console.error("Erro ao excluir feriado:", error);
        alert("Erro ao excluir feriado");

    }

}
// Confirmar exclusão de feriado
// app.js - Verifique se a função confirmarExclusao está assim:

async function confirmarExclusao() {
    console.log("🔍 Confirmando exclusão:", { 
        id: window.exclusaoPendenteId, 
        tipo: window.exclusaoTipo 
    });
    
    if (!window.exclusaoPendenteId) {
        console.error("Nenhum ID pendente");
        fecharModal('modalConfirmacao');
        return;
    }
    
    try {
        let url;
        if (window.exclusaoTipo === 'feriado') {
            url = `http://localhost:3000/api/feriados/${window.exclusaoPendenteId}`;
        } else {
            url = `http://localhost:3000/api/ausencias/${window.exclusaoPendenteId}`;
        }
        
        console.log("📤 Enviando DELETE para:", url);
        
        const response = await fetch(url, {
            method: 'DELETE'
        });
        
        const responseText = await response.text();
        console.log("📥 Resposta:", response.status, responseText);
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${responseText}`);
        }
        
        // Recarregar dados
        await atualizarTudo();
        
        // Fechar modal e resetar
        fecharModal('modalConfirmacao');
        window.exclusaoPendenteId = null;
        window.exclusaoTipo = null;
        
        mostrarToast("Excluído com sucesso!", "success");
        
        // Se o modal de lançamento estiver aberto, recarregar listagens
        const modalLancamento = document.getElementById("modalLancamento");
        if (modalLancamento && !modalLancamento.classList.contains('hidden')) {
            await carregarListagens();
        }
        
    } catch (error) {
        console.error("❌ Erro ao excluir:", error);
        mostrarToast(`Erro ao excluir: ${error.message}`, "error");
        fecharModal('modalConfirmacao');
    }
}

// ================= LEGENDA MENSAL =================
function gerarLegendaMensal() {
    const container = document.getElementById("legendaMensalContent");
    if (!container) return;

    // Verificar se os dados existem
    if (!colaboradores) colaboradores = [];
    if (!ausencias) ausencias = [];
    if (!feriados) feriados = [];
    if (!feriadosLocais) feriadosLocais = [];

    const mes = mesAtual;
    const ano = anoAtual;
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();

    // Contadores
    let totalFeriados = 0;
    let totalAusencias = 0;
    let totalFolgas = 0;
    let totalFerias = 0;
    let eventosPorDia = {};

    // Inicializar eventos por dia
    for (let dia = 1; dia <= diasNoMes; dia++) {
        eventosPorDia[dia] = {
            feriados: [],
            ausencias: [],
            folgas: [],
            ferias: []
        };
    }

    // Processar feriados da API
    if (feriados && feriados.length > 0) {
        feriados.forEach(f => {
            if (f.date) {
                const [anoF, mesF, diaF] = f.date.split('-').map(Number);
                if (mesF === mes + 1 && anoF === ano) {
                    eventosPorDia[diaF].feriados.push(f.name);
                    totalFeriados++;
                }
            }
        });
    }

    // Processar feriados locais
    if (feriadosLocais && feriadosLocais.length > 0) {
        feriadosLocais.forEach(f => {
            if (f.Data) {
                const data = new Date(f.Data);
                if (data.getMonth() === mes && data.getFullYear() === ano) {
                    const dia = data.getDate();
                    eventosPorDia[dia].feriados.push(`${f.Nome} (${f.Tipo || 'municipal'})`);
                    totalFeriados++;
                }
            }
        });
    }

    // 🔥 CORREÇÃO: Processar ausências com os tipos corretos
    if (ausencias && ausencias.length > 0 && colaboradores.length > 0) {
        ausencias.forEach(a => {
            if (a.DataInicio && a.DataFim) {
                const dataInicio = new Date(a.DataInicio);
                const dataFim = new Date(a.DataFim);
                const colaborador = colaboradores.find(c => c.Id === (a.colaboradorId || a.ColaboradorId));
                
                if (!colaborador) return;

                // Verificar se o período cruza com o mês atual
                const primeiroDiaMes = new Date(ano, mes, 1);
                const ultimoDiaMes = new Date(ano, mes + 1, 0);
                
                if (dataFim >= primeiroDiaMes && dataInicio <= ultimoDiaMes) {
                    
                    // 🔥 CORREÇÃO: Identificar o tipo corretamente
                    const tipo = (a.tipo || a.Tipo || '').toLowerCase();
                    
                    // Incrementar contadores por tipo
                    if (tipo === 'folga') {
                        totalFolgas++;
                    } else if (tipo === 'ferias') {
                        totalFerias++;
                    } else if (tipo === 'ausencia') {
                        totalAusencias++;
                    }
                    
                    // Adicionar aos dias específicos do mês
                    const diaInicio = Math.max(1, dataInicio.getDate());
                    const diaFim = Math.min(diasNoMes, dataFim.getDate());
                    
                    for (let dia = diaInicio; dia <= diaFim; dia++) {
                        const dataDia = new Date(ano, mes, dia);
                        
                        // Verificar se o dia está dentro do período
                        if (dataDia >= dataInicio && dataDia <= dataFim) {
                            if (tipo === 'folga') {
                                eventosPorDia[dia].folgas.push(colaborador.Nome);
                            } else if (tipo === 'ferias') {
                                eventosPorDia[dia].ferias.push(colaborador.Nome);
                            } else if (tipo === 'ausencia') {
                                eventosPorDia[dia].ausencias.push(colaborador.Nome);
                            }
                        }
                    }
                }
            }
        });
    }

    // Gerar HTML da legenda
    let html = `
        <div class="legenda-resumo">
            <div class="legenda-cards">
                <div class="legenda-card feriado">
                    <i class="fas fa-calendar-day"></i>
                    <div>
                        <strong>${totalFeriados}</strong>
                        <span>Feriados</span>
                    </div>
                </div>
                <div class="legenda-card ferias">
                    <i class="fas fa-umbrella-beach"></i>
                    <div>
                        <strong>${totalFerias}</strong>
                        <span>Férias</span>
                    </div>
                </div>
                <div class="legenda-card folga">
                    <i class="fas fa-leaf"></i>
                    <div>
                        <strong>${totalFolgas}</strong>
                        <span>Folgas</span>
                    </div>
                </div>
                <div class="legenda-card ausencia">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>
                        <strong>${totalAusencias}</strong>
                        <span>Ausências</span>
                    </div>
                </div>
            </div>
    `;

    // Dias com eventos
    const diasComEventos = [];
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const eventos = eventosPorDia[dia];
        if (eventos.feriados.length > 0 || eventos.ausencias.length > 0 || 
            eventos.folgas.length > 0 || eventos.ferias.length > 0) {
            diasComEventos.push({ dia, eventos });
        }
    }

    if (diasComEventos.length > 0) {
        html += `
            <div class="legenda-dias">
                <h5>Detalhamento por dia</h5>
                <div class="legenda-dias-grid">
        `;

        diasComEventos.forEach(({ dia, eventos }) => {
            html += `<div class="legenda-dia-card">`;
            html += `<div class="legenda-dia-numero">${dia}</div>`;
            html += `<div class="legenda-dia-eventos">`;
            
            eventos.feriados.forEach(f => {
                html += `<span class="legenda-evento feriado-tag">📅 ${f}</span>`;
            });
            
            eventos.ferias.forEach(f => {
                html += `<span class="legenda-evento ferias-tag">🏖️ ${f}</span>`;
            });
            
            eventos.folgas.forEach(f => {
                html += `<span class="legenda-evento folga-tag">🌸 ${f}</span>`;
            });
            
            eventos.ausencias.forEach(a => {
                html += `<span class="legenda-evento ausencia-tag">⚠️ ${a}</span>`;
            });
            
            html += `</div></div>`;
        });

        html += `
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="legenda-sem-eventos">
                <i class="fas fa-check-circle"></i>
                <p>Nenhum evento no mês atual</p>
            </div>
        `;
    }

    html += `</div>`;

    container.innerHTML = html;

}


function debugTiposAusencias() {
    console.log("=== DEBUG TIPOS DE AUSÊNCIAS ===");
    if (ausencias && ausencias.length > 0) {
        ausencias.forEach((a, index) => {
            console.log(`Ausência ${index + 1}:`, {
                id: a.id || a.Id,
                tipo: a.tipo || a.Tipo,
                tipoLower: (a.tipo || a.Tipo || '').toLowerCase(),
                colaboradorId: a.colaboradorId || a.ColaboradorId,
                dataInicio: a.DataInicio,
                dataFim: a.DataFim
            });
        });
    } else {
        console.log("Nenhuma ausência encontrada");
    }
}


// Modificar a função renderCalendario para incluir a legenda
function renderCalendario() {
    console.log('Renderizando calendário...');
    
    appContent.innerHTML = `
        <div class="page-header">
            <h1>Calendário Mensal</h1>
            <div class="header-actions">
                <button id="btnLancamentoAjuste" class="btn-primary">
                    <i class="fas fa-plus"></i> Lançamento
                </button>
            </div>
        </div>

        <div class="calendar-wrapper">
            <div class="calendar-header">
                <div class="month-nav">
                    <button id="prevMonth" class="nav-btn">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <h2 id="monthTitle">Carregando...</h2>
                    <button id="nextMonth" class="nav-btn">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>

            <div class="weekdays"></div>
            <div id="calendar" class="calendar-grid"></div>
        </div>
    `;

    // Verificar se os elementos foram criados
    console.log('Elementos do calendário criados');
    console.log('- calendar:', document.getElementById('calendar'));
    console.log('- prevMonth:', document.getElementById('prevMonth'));
    console.log('- nextMonth:', document.getElementById('nextMonth'));

    // Inicializar o calendário após um pequeno delay
    setTimeout(() => {
        if (typeof window.inicializarCalendario === 'function') {
            console.log('Chamando inicializarCalendario...');
            window.inicializarCalendario();
        } else {
            console.error('Função inicializarCalendario não encontrada!');
        }
    }, 200);
}

// Modificar a função abrirModalAusencia para resetar os campos de hora
function abrirModalAusencia(dataISO = null) {
    console.log("Abrindo modal de ausência...", dataISO);
    
    const modal = document.getElementById("modal");
    if (!modal) {
        console.error("Modal não encontrado!");
        return;
    }
    
    dataSelecionada = dataISO;
    
    document.getElementById("loadingAusencias").classList.remove("hidden");
    document.getElementById("emptyAusencias").classList.add("hidden");
    document.getElementById("listaAusencias").classList.add("hidden");
    
    document.getElementById("colaboradorSelect").value = "";
    document.getElementById("tipoSelect").value = "folga";
    document.getElementById("periodoTipo").value = "dia_inteiro";
    document.getElementById("camposHora").classList.add("hidden");
    document.getElementById("horaInicio").value = "";
    document.getElementById("horaFim").value = "";
    
    if (dataISO) {
        let dataFormatada = dataISO;
        if (dataISO.includes('T')) {
            dataFormatada = dataISO.split('T')[0];
        }
        document.getElementById("dataInicio").value = dataFormatada;
        document.getElementById("dataFim").value = dataFormatada;
    } else {
        document.getElementById("dataInicio").value = "";
        document.getElementById("dataFim").value = "";
    }
    
    editandoAusenciaId = null;
    document.getElementById("salvarAusenciaBtn").innerHTML = '<i class="fas fa-save"></i> Salvar';
    document.getElementById("cancelarEdicaoLancamentoBtn").classList.add("hidden");
    
    carregarColaboradoresNoSelect();
    carregarAusenciasDoDia(dataISO);
    
    // 🔥 CHAMAR A CONFIGURAÇÃO DOS CAMPOS DE HORA
    configurarCamposHora();
    
    modal.classList.remove("hidden");
    modal.classList.add("active");
}
// Atualizar configurarModais para incluir o botão de feriado
function configurarModais() {
    console.log("Configurando modais...");
    
    // Botão de lançamento (pessoal)
    document.addEventListener('click', function(e) {
        if (e.target.id === 'btnLLancamentoAjuste' || e.target.closest('#btnLancamentoAjuste')) {
            e.preventDefault();
            window.abrirModalLancamento('pessoal');
        }
    });


    // Fechar modal de lançamento
    const fecharModalLancamentoBtn = document.getElementById('fecharModalLancamentoBtn');
    if (fecharModalLancamentoBtn) {
        fecharModalLancamentoBtn.addEventListener('click', function() {
            fecharModal('modalLancamento');
        });
    }
    
    // Fechar modal de confirmação (botão X)
    const fecharModalConfirmacaoBtn = document.getElementById('fecharModalConfirmacaoBtn');
    if (fecharModalConfirmacaoBtn) {
        fecharModalConfirmacaoBtn.addEventListener('click', function() {
            fecharModal('modalConfirmacao');
            exclusaoPendenteId = null;
        });
    }
    
    // Cancelar exclusão (botão Cancelar)
    const cancelarExclusaoBtn = document.getElementById('cancelarExclusaoBtn');
    if (cancelarExclusaoBtn) {
        cancelarExclusaoBtn.addEventListener('click', function() {
            fecharModal('modalConfirmacao');
            exclusaoPendenteId = null;
        });
    }
    
    // Confirmar exclusão
    const confirmarExclusaoBtn = document.getElementById('confirmarExclusaoBtn');
    if (confirmarExclusaoBtn) {
        confirmarExclusaoBtn.addEventListener('click', confirmarExclusao);
    }
    
    // Fechar modal de horário (botão X)
    const fecharModalHorarioBtn = document.getElementById('fecharModalHorarioBtn');
    if (fecharModalHorarioBtn) {
        fecharModalHorarioBtn.addEventListener('click', function() {
            fecharModal('modalHorario');
        });
    }
    
    // Fechar modal de horário (botão Cancelar)
    const fecharModalHorarioBtn2 = document.getElementById('fecharModalHorarioBtn2');
    if (fecharModalHorarioBtn2) {
        fecharModalHorarioBtn2.addEventListener('click', function() {
            fecharModal('modalHorario');
        });
    }
    
    // Fechar ao clicar fora do modal
    window.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
            e.target.classList.remove('active');
            if (e.target.id === 'modalConfirmacao') {
                exclusaoPendenteId = null;
            }
        }
    });
}


// Atualizar carregamento inicial
document.addEventListener("DOMContentLoaded", async () => {
    console.log("Inicializando aplicação...");
    
    const temaSalvo = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaSalvo);

    try {
        await carregarColaboradores();
        console.log("Colaboradores carregados:", colaboradores.length);
        
        await carregarAusencias();
        console.log("Ausências carregadas:", ausencias.length);
        
        await carregarFeriadosLocais();
        console.log("Feriados locais carregados:", feriadosLocais.length);
        
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        mostrarToast("Erro ao carregar dados do servidor", "error");
    }
    
    configurarNavegacao();
    configurarModais();
    
    renderCalendario();
});

// ================= FUNÇÕES DE DEBUG =================
function debugDados() {
    console.log("=== DEBUG DO SISTEMA ===");
    console.log("Colaboradores:", colaboradores.length);
    console.log("Ausências:", ausencias.length);
    console.log("Feriados API:", feriados?.length || 0);
    console.log("Feriados Locais:", feriadosLocais?.length || 0);
    
    if (ausencias.length > 0) {
        console.log("Primeira ausência:", ausencias[0]);
    }
}

// ================= FUNÇÃO PARA ATUALIZAR TUDO =================
async function atualizarTudo() {
    console.log("Atualizando todos os dados...");
    
    try {
        // Recarregar todos os dados do backend com tratamento de erro individual
        const resultados = await Promise.allSettled([
            carregarColaboradores(),
            carregarAusencias(),
            carregarFeriadosLocais()
        ]);
        
        resultados.forEach((resultado, index) => {
            const nomes = ['Colaboradores', 'Ausências', 'Feriados'];
            if (resultado.status === 'fulfilled') {
                console.log(`✅ ${nomes[index]} atualizados`);
            } else {
                console.error(`❌ Erro ao atualizar ${nomes[index]}:`, resultado.reason);
            }
        });
        
        // Se o calendário estiver visível, atualizar
        if (document.getElementById("calendar")) {
            gerarCalendario(mesAtual, anoAtual);
        }
        
        // Atualizar a legenda mensal
        gerarLegendaMensal();
        
        // Se o modal de ausência estiver aberto, atualizar a listagem
        const modalAusencia = document.getElementById("modal");
        if (modalAusencia && !modalAusencia.classList.contains('hidden')) {
            if (dataSelecionada) {
                await carregarAusenciasDoDia(dataSelecionada);
            }
        }
        
        console.log("Atualização completa!");
        mostrarToast("Dados atualizados!", "success");
        
    } catch (error) {
        console.error("Erro ao atualizar dados:", error);
        mostrarToast("Erro ao atualizar dados", "error");
    }
}

// ================= OBSERVER PARA ATUALIZAÇÃO AUTOMÁTICA =================
function configurarObservers() {
    // Observer para detectar quando o calendário é atualizado
    const calendarObserver = new MutationObserver(() => {
        // Quando o calendário mudar, atualizar a legenda
        setTimeout(() => {
            gerarLegendaMensal();
        }, 100);
    });
    
    const calendar = document.getElementById("calendar");
    if (calendar) {
        calendarObserver.observe(calendar, { 
            childList: true, 
            subtree: true,
            characterData: true 
        });
    }
    
    // Observer para detectar quando modais são fechados
    const modalObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                const modal = mutation.target;
                // Se o modal foi fechado (adicionou hidden)
                if (modal.classList.contains('hidden')) {
                    // Atualizar dados
                    setTimeout(() => {
                        atualizarTudo();
                    }, 300);
                }
            }
        });
    });
    
    // Observar modais
    const modals = ['modal', 'modalFeriado', 'modalConfirmacao'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modalObserver.observe(modal, { attributes: true });
        }
    });
}

function getPaginaFromURL() {
    // Pega o hash da URL, ex: #dashboard, #calendario
    const hash = window.location.hash.substring(1); // Remove o #
    
    // Se não tiver hash ou for inválido, retorna dashboard
    const paginasValidas = ['dashboard', 'calendario', 'colaboradores', 'escala', 'lancamentoPlantao', 'relatorios', 'configuracoes'];
    
    if (hash && paginasValidas.includes(hash)) {
        return hash;
    }
    
    return 'dashboard';
}

// Modifique o DOMContentLoaded para usar essa função
document.addEventListener("DOMContentLoaded", async () => {
    console.log("Inicializando aplicação...");
    
    const temaSalvo = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaSalvo);

    try {
        await carregarColaboradores();
        await carregarAusencias();
        await carregarFeriadosLocais();
        await carregarPlantoes();
        
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        mostrarToast("Erro ao carregar dados do servidor", "error");
    }
    
    configurarNavegacao();
    configurarModais();
    configurarObservers();
    
    const paginaInicial = getPaginaFromURL();
    carregarPagina(paginaInicial);
})


window.addEventListener('popstate', () => {
    const pagina = getPaginaFromURL();
    carregarPagina(pagina);
});

function testarAtualizacao() {
    console.log("Testando atualização...");
    atualizarTudo();
}

// No app.js, adicione esta função
function atualizarCalendario() {
    if (document.getElementById("calendar")) {
        // Atualizar a variável global no calendar.js
        if (typeof window.feriadosLocais !== 'undefined') {
            window.feriadosLocais = feriadosLocais;
        }
        
        // Chamar a função de gerar calendário
        if (typeof gerarCalendario === 'function') {
            gerarCalendario(mesAtual, anoAtual);
        }
    }
}

// E modifique a função atualizarTudo para chamar atualizarCalendario
async function atualizarTudo() {
    console.log("Atualizando todos os dados...");
    
    try {
        const resultados = await Promise.allSettled([
            carregarColaboradores(),
            carregarAusencias(),
            carregarFeriadosLocais()
        ]);
        
        resultados.forEach((resultado, index) => {
            const nomes = ['Colaboradores', 'Ausências', 'Feriados'];
            if (resultado.status === 'fulfilled') {
                console.log(`✅ ${nomes[index]} atualizados`);
            } else {
                console.error(`❌ Erro ao atualizar ${nomes[index]}:`, resultado.reason);
            }
        });
        
        // 🔥 ATUALIZAR O CALENDÁRIO
        atualizarCalendario();
        
        // Atualizar a legenda mensal
        gerarLegendaMensal();
        
        console.log("Atualização completa!");
        
    } catch (error) {
        console.error("Erro ao atualizar dados:", error);
        mostrarToast("Erro ao atualizar dados", "error");
    }
} 

function toggleCamposHora(select) {
    const camposHora = document.getElementById('camposHora');
    if (select.value === 'horas') {
        camposHora.classList.remove('hidden');
    } else {
        camposHora.classList.add('hidden');
    }
}


// ========== FUNÇÃO PARA CARREGAR FERIADOS DA API ==========
async function carregarFeriadosAPI(ano) {
    try {
        console.log(`📡 Carregando feriados da API para ${ano}...`);
        const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
        
        if (response.ok) {
            feriadosAPI = await response.json();
            window.feriadosAPI = feriadosAPI; // Disponibilizar globalmente
            console.log(`✅ Feriados da API carregados: ${feriadosAPI.length}`);
            return feriadosAPI;
        } else {
            console.error("❌ Erro ao carregar feriados da API:", response.status);
            feriadosAPI = [];
            window.feriadosAPI = [];
            return [];
        }
    } catch (error) {
        console.error("❌ Erro na requisição da API:", error);
        feriadosAPI = [];
        window.feriadosAPI = [];
        return [];
    }
}
