let ausencias = [];
let colaboradores = [];
let editandoId = null;
let editandoAusenciaId = null;
let plantoesLancados = [];

// EXPOR FUNÇÕES GLOBAIS (já está correto)
window.carregarPagina = carregarPagina;
window.abrirModalAusencia = abrirModalAusencia;
window.abrirModalHorario = abrirModalHorario;

// Elemento principal onde o conteúdo será renderizado
const appContent = document.getElementById("appContent");

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Inicializando aplicação...");
    
    const temaSalvo = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaSalvo);

    await carregarColaboradores();
    await carregarAusencias();
    configurarNavegacao();
    configurarModais();
    
    renderCalendario();
});



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


async function carregarAusenciasDoDia(dataISO) {
    const loadingEl = document.getElementById("loadingAusencias");
    const emptyEl = document.getElementById("emptyAusencias");
    const listaEl = document.getElementById("listaAusencias");
    
    if (!loadingEl || !emptyEl || !listaEl) return;
    
    try {
        await carregarAusencias();
        
        loadingEl.classList.add("hidden");
        
        if (!ausencias || ausencias.length === 0 || !dataISO) {
            emptyEl.classList.remove("hidden");
            listaEl.classList.add("hidden");
            return;
        }
        
        // 🔥 Garantir que dataISO está no formato YYYY-MM-DD
        const dataAlvoStr = dataISO.split('T')[0];
        
        console.log("Buscando ausências para:", dataAlvoStr);
        
        // Filtra as ausências comparando STRINGS diretamente
        const ausenciasDoDia = ausencias.filter(a => {
            const dataInicioStr = (a.DataInicio || a.dataInicio).split('T')[0];
            const dataFimStr = (a.DataFim || a.dataFim).split('T')[0];
            
            // Comparação como string YYYY-MM-DD
            return dataAlvoStr >= dataInicioStr && dataAlvoStr <= dataFimStr;
        });
        
        console.log("Ausências encontradas:", ausenciasDoDia.length);
        
        if (ausenciasDoDia.length === 0) {
            emptyEl.classList.remove("hidden");
            listaEl.classList.add("hidden");
            return;
        }
        
        emptyEl.classList.add("hidden");
        listaEl.classList.remove("hidden");
        
        // Ordena por data (mais recentes primeiro)
        const ausenciasOrdenadas = [...ausenciasDoDia].sort((a, b) => {
            const dataA = a.DataInicio || a.dataInicio;
            const dataB = b.DataInicio || b.dataInicio;
            return dataB.localeCompare(dataA);
        });
        
        listaEl.innerHTML = "";
        
        ausenciasOrdenadas.forEach(a => {
            const id = a.id || a.Id;
            const colaboradorId = a.colaboradorId || a.ColaboradorId;
            const dataInicio = (a.DataInicio || a.dataInicio).split('T')[0];
            const dataFim = (a.DataFim || a.dataFim).split('T')[0];
            const tipo = a.tipo || a.Tipo;
            
            const colaborador = colaboradores.find(c => c.Id === colaboradorId);
            
            const card = document.createElement("div");
            card.className = "ausencia-card";
            card.setAttribute('data-id', id);
            
            // Formatar datas para exibição
            const [anoInicio, mesInicio, diaInicio] = dataInicio.split('-');
            const [anoFim, mesFim, diaFim] = dataFim.split('-');
            
            const dataInicioFormatada = `${diaInicio}/${mesInicio}/${anoInicio}`;
            const dataFimFormatada = `${diaFim}/${mesFim}/${anoFim}`;
            
            const tipoConfig = {
                folga: { icon: '🌸', classe: 'folga', texto: 'Folga' },
                ausencia: { icon: '⚠️', classe: 'ausencia', texto: 'Ausência' },
                ferias: { icon: '🏖️', classe: 'ferias', texto: 'Férias' }
            };
            
            const config = tipoConfig[tipo] || tipoConfig.ausencia;
            
            card.innerHTML = `
                <div class="ausencia-header">
                    <div class="ausencia-colaborador">
                        <i class="fas fa-user-circle"></i>
                        ${colaborador?.Nome || 'Colaborador não encontrado'}
                    </div>
                    <span class="ausencia-tipo-badge ${config.classe}">
                        ${config.icon} ${config.texto}
                    </span>
                </div>
                <div class="ausencia-datas">
                    <div class="ausencia-data-item">
                        <i class="fas fa-calendar-day"></i>
                        <span>Início: <strong>${dataInicioFormatada}</strong></span>
                    </div>
                    <div class="ausencia-data-item">
                        <i class="fas fa-calendar-check"></i>
                        <span>Fim: <strong>${dataFimFormatada}</strong></span>
                    </div>
                </div>
                <div class="ausencia-actions">
                    <button onclick="editarAusencia(${id})" class="btn-icon-sm edit" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="excluirAusencia(${id})" class="btn-icon-sm delete" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            listaEl.appendChild(card);
        });
        
    } catch (error) {
        console.error("Erro ao carregar lista:", error);
        loadingEl.classList.add("hidden");
        emptyEl.classList.remove("hidden");
        emptyEl.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>
            <p style="color: var(--danger);">Erro ao carregar lançamentos</p>
            <button onclick="carregarAusenciasDoDia('${dataISO}')" class="btn-primary" style="margin-top: 10px;">
                <i class="fas fa-sync"></i> Tentar novamente
            </button>
        `;
    }
}

// Função para salvar ausência
async function salvarAusencia() {
    const colaboradorId = document.getElementById("colaboradorSelect")?.value;
    const tipo = document.getElementById("tipoSelect")?.value;
    const dataInicio = document.getElementById("dataInicio")?.value;
    const dataFim = document.getElementById("dataFim")?.value;
    
    console.log("Dados do formulário:", { colaboradorId, tipo, dataInicio, dataFim });
    
    if (!colaboradorId || !dataInicio || !dataFim) {
        mostrarToast("Preencha todos os campos", "error");
        return;
    }
    
    // Valida se data fim é maior ou igual a data início
    if (dataFim < dataInicio) {
        mostrarToast("Data fim deve ser maior ou igual à data início", "error");
        return;
    }
    
    try {
        let response;
        const url = editandoAusenciaId 
            ? `http://localhost:3000/api/ausencias/${editandoAusenciaId}`
            : 'http://localhost:3000/api/ausencias';
        
        const metodo = editandoAusenciaId ? 'PUT' : 'POST';
        
        // 🔥 ENVIAR AS DATAS EXATAMENTE COMO ESTÃO NO INPUT
        // Sem converter para Date, sem mexer no fuso horário
        const payload = {
            colaboradorId: parseInt(colaboradorId),
            tipo: tipo,
            dataInicio: dataInicio, // Exatamente "2026-02-09"
            dataFim: dataFim         // Exatamente "2026-02-09"
        };
        
        console.log("Enviando payload:", payload);
        
        response = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ${response.status}: ${errorText}`);
        }
        
        await carregarAusencias();
        
        await carregarAusenciasDoDia(dataInicio);
        
        cancelarEdicaoAusencia();
        
        mostrarToast(
            editandoAusenciaId ? "Lançamento atualizado!" : "Lançamento salvo com sucesso!", 
            "success"
        );
        
        
        if (document.getElementById("calendar")) {
                gerarCalendario(mesAtual, anoAtual);
        }
        
    } catch (error) {
        console.error("Erro ao salvar ausência:", error);
        mostrarToast(`Erro ao salvar: ${error.message}`, "error");
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

async function carregarListaAusencias() {
    const loadingEl = document.getElementById("loadingAusencias");
    const emptyEl = document.getElementById("emptyAusencias");
    const listaEl = document.getElementById("listaAusencias");
    
    if (!loadingEl || !emptyEl || !listaEl) return;
    
    try {
        await carregarAusencias();
        
        // Esconde loading
        loadingEl.classList.add("hidden");
        
        if (!ausencias || ausencias.length === 0) {
            // Mostra empty state
            emptyEl.classList.remove("hidden");
            listaEl.classList.add("hidden");
            return;
        }
        
        // Mostra lista
        emptyEl.classList.add("hidden");
        listaEl.classList.remove("hidden");
        
        const ausenciasOrdenadas = [...ausencias].sort((a, b) => 
            new Date(b.DataInicio) - new Date(a.DataInicio)
        );
        
        listaEl.innerHTML = "";
        
        ausenciasOrdenadas.forEach(a => {
            const colaborador = colaboradores.find(c => c.Id === a.colaboradorId);
            const card = document.createElement("div");
            card.className = "ausencia-card";
            card.setAttribute('data-id', a.id);
            
            const dataInicio = new Date(a.DataInicio).toLocaleDateString('pt-BR');
            const dataFim = new Date(a.DataFim).toLocaleDateString('pt-BR');
            
            const tipoConfig = {
                folga: { icon: '🌸', classe: 'folga', texto: 'Folga' },
                ausencia: { icon: '⚠️', classe: 'ausencia', texto: 'Ausência' },
                ferias: { icon: '🏖️', classe: 'ferias', texto: 'Férias' }
            };
            
            const config = tipoConfig[a.tipo] || tipoConfig.ausencia;
            
            card.innerHTML = `
                <div class="ausencia-header">
                    <div class="ausencia-colaborador">
                        <i class="fas fa-user-circle"></i>
                        ${colaborador?.Nome || 'Colaborador não encontrado'}
                    </div>
                    <span class="ausencia-tipo-badge ${config.classe}">
                        ${config.icon} ${config.texto}
                    </span>
                </div>
                <div class="ausencia-datas">
                    <div class="ausencia-data-item">
                        <i class="fas fa-calendar-day"></i>
                        <span>Início: <strong>${dataInicio}</strong></span>
                    </div>
                    <div class="ausencia-data-item">
                        <i class="fas fa-calendar-check"></i>
                        <span>Fim: <strong>${dataFim}</strong></span>
                    </div>
                </div>
                <div class="ausencia-actions">
                    <button onclick="editarAusencia(${a.id})" class="btn-icon-sm edit" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="excluirAusencia(${a.id})" class="btn-icon-sm delete" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            listaEl.appendChild(card);
        });
        
    } catch (error) {
        console.error("Erro ao carregar lista:", error);
        loadingEl.classList.add("hidden");
        emptyEl.classList.remove("hidden");
        emptyEl.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>
            <p style="color: var(--danger);">Erro ao carregar lançamentos</p>
            <button onclick="carregarListaAusencias()" class="btn-primary" style="margin-top: 10px;">
                <i class="fas fa-sync"></i> Tentar novamente
            </button>
        `;
    }
}

async function editarAusencia(id) {
    console.log("Editando ausência ID:", id);
    
    const ausencia = ausencias.find(a => {
        const aId = a.id || a.Id;
        return aId === id;
    });
    
    if (!ausencia) {
        console.error("Ausência não encontrada:", id);
        mostrarToast("Erro ao carregar lançamento para edição", "error");
        return;
    }
    
    console.log("Ausência encontrada:", ausencia);
    
    editandoAusenciaId = id;
    
    // Pega os campos considerando ambas nomenclaturas
    const colaboradorId = ausencia.colaboradorId || ausencia.ColaboradorId;
    const tipo = ausencia.tipo || ausencia.Tipo;
    let dataInicio = ausencia.DataInicio || ausencia.dataInicio;
    let dataFim = ausencia.DataFim || ausencia.dataFim;
    
    // Garante o formato YYYY-MM-DD para o input date
    if (dataInicio) {
        const date = new Date(dataInicio);
        dataInicio = date.toISOString().split('T')[0];
    }
    
    if (dataFim) {
        const date = new Date(dataFim);
        dataFim = date.toISOString().split('T')[0];
    }
    
    document.getElementById("colaboradorSelect").value = colaboradorId || "";
    document.getElementById("tipoSelect").value = tipo || "folga";
    document.getElementById("dataInicio").value = dataInicio || "";
    document.getElementById("dataFim").value = dataFim || "";
    
    // 🔥 MUDA O BOTÃO PARA MODO EDIÇÃO
    document.getElementById("salvarAusenciaBtn").innerHTML = '<i class="fas fa-check"></i> Atualizar';
    document.getElementById("cancelarEdicaoLancamentoBtn").classList.remove("hidden");
    
    document.querySelector('.form-section')?.scrollIntoView({ behavior: 'smooth' });
}

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
    
    // 🔥 VOLTA O BOTÃO PARA MODO NORMAL E ESCONDE CANCELAR
    if (salvarBtn) salvarBtn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    if (cancelarBtn) cancelarBtn.classList.add("hidden");
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
let exclusaoPendenteId = null;

async function excluirAusencia(id) {
    const ausencia = ausencias.find(a => {
        const aId = a.id || a.Id;
        return aId === id;
    });
    
    if (!ausencia) {
        mostrarToast("Lançamento não encontrado", "error");
        return;
    }
    
    // Busca o colaborador
    const colaboradorId = ausencia.colaboradorId || ausencia.ColaboradorId;
    const colaborador = colaboradores.find(c => c.Id === colaboradorId);
    
    // Prepara informações para o modal
    const dataInicio = new Date(ausencia.DataInicio || ausencia.dataInicio).toLocaleDateString('pt-BR');
    const info = `${colaborador?.Nome || 'Colaborador'} - ${dataInicio}`;
    
    document.getElementById("confirmacaoInfo").innerText = info;
    
    // Armazena o ID para exclusão
    exclusaoPendenteId = id;
    
    // Abre modal de confirmação
    const modal = document.getElementById("modalConfirmacao");
    modal.classList.remove("hidden");
    modal.classList.add("active");
}

async function confirmarExclusao() {
    if (!exclusaoPendenteId) {
        fecharModal('modalConfirmacao');
        return;
    }
    
    try {
        console.log("Excluindo ausência ID:", exclusaoPendenteId);
        
        const response = await fetch(`http://localhost:3000/api/ausencias/${exclusaoPendenteId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ${response.status}: ${errorText}`);
        }
        
        await carregarAusencias();
        
        // Recarrega apenas os lançamentos do dia selecionado
        await carregarAusenciasDoDia(dataSelecionada);
        
        if (editandoAusenciaId === exclusaoPendenteId) {
            cancelarEdicaoAusencia();
        }
        
        mostrarToast("Lançamento excluído com sucesso!", "success");
        
        // Atualiza o calendário se estiver visível
        if (document.getElementById("calendar")) {
            if (typeof inicializarCalendario === 'function') {
                inicializarCalendario();
            }
        }
        
    } catch (error) {
        console.error("Erro ao excluir:", error);
        mostrarToast(`Erro ao excluir: ${error.message}`, "error");
    } finally {
        // Fecha o modal e limpa o ID pendente
        fecharModal('modalConfirmacao');
        exclusaoPendenteId = null;
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
    
    // Atualiza o botão ativo na sidebar
    if (typeof window.setActiveButton === 'function') {
        window.setActiveButton(pagina);
    }
    
    switch (pagina) {
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
        const metodo = id ? "PUT" : "POST";
        const url = id 
            ? `http://localhost:3000/api/colaboradores/${id}`
            : `http://localhost:3000/api/colaboradores`;

        const payload = {
            nome,
            trabalhoInicio,
            trabalhoFim,
            almocoInicio,
            almocoFim
        };

        const response = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Erro ao salvar");

        await carregarColaboradores();
        renderListaColaboradores();
        fecharColaboradorEditor();
        
        mostrarToast(
            id ? "Colaborador atualizado!" : "Colaborador salvo com sucesso!", 
            "success"
        );
        
    } catch (error) {
        console.error("Erro ao salvar:", error);
        mostrarToast("Erro ao salvar colaborador", "error");
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
        const response = await fetch(`http://localhost:3000/api/colaboradores/${id}`, { 
            method: 'DELETE' 
        });
        
        if (!response.ok) throw new Error("Erro ao excluir");
        
        await carregarColaboradores();
        renderColaboradores();
        gerarResumoHorarios();
        mostrarToast("Colaborador excluído com sucesso!", "success");
        
    } catch (error) {
        console.error("Erro ao excluir:", error);
        mostrarToast("Erro ao excluir colaborador", "error");
    }
}

/* ===========================
   CARREGAR DADOS
=========================== */
async function carregarColaboradores() {
    try {
        const res = await fetch('http://localhost:3000/api/colaboradores');
        if (!res.ok) throw new Error("Erro na requisição");
        const data = await res.json();
        colaboradores = Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Erro ao carregar colaboradores:", error);
        colaboradores = [];
    }
}

async function carregarAusencias() {
    try {
        const res = await fetch('http://localhost:3000/api/ausencias');
        if (!res.ok) throw new Error("Erro na requisição");
        ausencias = await res.json();
    } catch (error) {
        console.error("Erro ao carregar ausências:", error);
        ausencias = [];
    }
}

/* ===========================
   TELA ESCALA DO DIA
=========================== */
async function renderEscalaDia() {
    await carregarColaboradores();

    const hoje = new Date();
    const dataFormatada = hoje.toLocaleDateString("pt-BR", {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    appContent.innerHTML = `
        <div class="page-header">
            <h1>Escala do Dia</h1>
            <p>${dataFormatada}</p>
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

        <!-- RESUMO POR HORÁRIO OCUPANDO O ESPAÇO TODO -->
        <div class="resumo-container" id="resumoContainer">
            <div class="resumo-header">
                <i class="fas fa-chart-pie"></i>
                <h4>Resumo por Horário</h4>
            </div>
            <div class="resumo-grid" id="resumoGrid"></div>
        </div>
    `;

    gerarHeaderTimeline();
    gerarTimelineVisual();
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

function gerarHeaderTimeline() {
    const header = document.getElementById("timelineHeader");
    if (!header) return;

    header.innerHTML = '<div class="timeline-name-header">Colaborador</div>';

    for (let hora = 7; hora <= 18; hora++) {
        header.innerHTML += `
            <div class="hora-header">
                <span>${hora}:00</span>
            </div>
        `;
    }
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
        gerarTimelineVisual();
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

function mostrarToast(mensagem, tipo = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${tipo}`;
    
    const icone = tipo === "success" ? "fa-check-circle" : 
                  tipo === "error" ? "fa-exclamation-circle" : 
                  "fa-info-circle";
    
    toast.innerHTML = `<i class="fas ${icone}"></i> ${mensagem}`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = "slideOut 0.3s ease";
        setTimeout(() => toast.remove(), 300);
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

    // Cria array para contar colaboradores por hora
    const contagemPorHora = [];

    for (let hora = 7; hora <= 18; hora++) {
        contagemPorHora.push({
            hora: hora,
            trabalhando: 0,
            almoco: 0,
            fora: 0
        });
    }

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

    // Gera o HTML do resumo
    let html = '';
    
    contagemPorHora.forEach(item => {
        const total = item.trabalhando + item.almoco + item.fora;
        
        html += `
            <div class="resumo-card">
                <div class="resumo-hora">${item.hora}:00</div>
                <div class="resumo-barras">
                    <div class="resumo-barra-container">
                        <div class="resumo-barra trabalhando" style="width: ${(item.trabalhando / total) * 100}%" title="Trabalhando: ${item.trabalhando}"></div>
                        <div class="resumo-barra almoco" style="width: ${(item.almoco / total) * 100}%" title="Almoço: ${item.almoco}"></div>
                        <div class="resumo-barra fora" style="width: ${(item.fora / total) * 100}%" title="Fora: ${item.fora}"></div>
                    </div>
                </div>
                <div class="resumo-numeros">
                    <span class="resumo-num trabalhando-num" title="Trabalhando">
                        <i class="fas fa-briefcase"></i> ${item.trabalhando}
                    </span>
                    <span class="resumo-num almoco-num" title="Almoço">
                        <i class="fas fa-utensils"></i> ${item.almoco}
                    </span>
                    <span class="resumo-num fora-num" title="Fora">
                        <i class="fas fa-clock"></i> ${item.fora}
                    </span>
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
                    
                    <div class="info-item">
                        <i class="fas fa-heart" style="color: var(--danger);"></i>
                        <span>Feito com dedicação</span>
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
    
    // Atualiza o ícone do botão na sidebar se existir
    const configBtn = document.querySelector('[data-page="configuracoes"] i');
    if (configBtn) {
        configBtn.className = tema === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    }
    
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
        const res = await fetch('http://localhost:3000/api/plantoes');
        if (!res.ok) throw new Error("Erro na requisição");
        plantoesLancados = await res.json();
    } catch (error) {
        console.error("Erro ao carregar plantões:", error);
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
    
    console.log("Recarregando dados antes de gerar relatório...");

    await carregarColaboradores();
    await carregarAusencias();

    console.log("Dados recarregados:", {
        colaboradores: colaboradores.length,
        ausencias: ausencias.length
    });

    gerarRelatorioCalendario(mes, ano);
    
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const relatorio = [];
    
    for (let dia = 1; dia <= diasNoMes; dia++) {
        const data = new Date(ano, mes, dia);
        const dataISO = `${ano}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
        const diaSemana = data.toLocaleDateString('pt-BR', { weekday: 'long' });
        

        const registro = {
            data: `${dia}/${String(mes+1).padStart(2,'0')}/${ano}`,
            diaSemana: diaSemana,
            feriado: null,
            eventos: []
        };
        
        // Verifica feriado
        const feriado = feriados?.find(f => f.date === dataISO);
        if (feriado) {
            registro.feriado = feriado.name;
        }
        
        // Verifica ausências do dia
        const ausenciasDoDia = ausencias.filter(a => {
            const dataInicio = new Date(a.DataInicio).toISOString().split('T')[0];
            const dataFim = new Date(a.DataFim).toISOString().split('T')[0];
            return dataISO >= dataInicio && dataISO <= dataFim;
        });
        
        ausenciasDoDia.forEach(a => {
            const colaborador = colaboradores.find(c => c.Id === (a.colaboradorId || a.ColaboradorId));
            registro.eventos.push({
                tipo: a.tipo,
                colaborador: colaborador?.Nome || 'Desconhecido'
            });
        });
        
        relatorio.push(registro);
    }
    
    mostrarRelatorio('Relatório Mensal Completo', renderRelatorioCompleto(relatorio, mes, ano));
}

function renderRelatorioCompleto(dados, mes, ano) {
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    let html = `
        <div class="relatorio-tabela-container">
            <h4>${meses[mes]} de ${ano}</h4>
            <table class="relatorio-tabela">
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Dia</th>
                        <th>Feriado</th>
                        <th>Eventos</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    dados.forEach(d => {
        const feriadoClass = d.feriado ? 'feriado' : '';
        html += `
            <tr class="${feriadoClass}">
                <td><strong>${d.data}</strong></td>
                <td>${d.diaSemana}</td>
                <td>${d.feriado || '-'}</td>
                <td>
        `;
        
        if (d.eventos.length === 0) {
            html += '<span class="sem-eventos">-</span>';
        } else {
            d.eventos.forEach(e => {
                const tipoClass = e.tipo === 'ferias' ? 'badge-ferias' : 
                                 e.tipo === 'ausencia' ? 'badge-ausencia' : 
                                 'badge-folga';
                html += `
                    <div class="evento-item">
                        <span class="evento-tipo ${tipoClass}">${e.tipo}</span>
                        <span class="evento-colaborador">${e.colaborador}</span>
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
    
    // Gera o relatório em memória (sem mostrar na tela)
    const relatorioHTML = await gerarRelatorioCalendarioParaExportar(mes, ano);
    
    // Mostra opções de exportação
    mostrarOpcoesExportacao(relatorioHTML, mes, ano);
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
        // Garantir que os dados estão carregados
        await carregarColaboradores();
        await carregarAusencias();
        
        console.log("Dados carregados:", {
            colaboradores: colaboradores.length,
            ausencias: ausencias.length
        });
        
        // Gera os dados do relatório
        const dados = await gerarRelatorioCalendarioParaExportar(mes, ano);
        
        console.log("Dados do relatório gerados");
        
        // Gera o HTML completo para o PDF
        const htmlPDF = gerarHTMLCalendarioPDF(dados);
        
        // Cria um iframe temporário
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '1200px';
        iframe.style.height = '900px'; // Altura menor para landscape
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
            scale: 2,
            backgroundColor: '#ffffff',
            windowWidth: 1200,
            windowHeight: 900,
            logging: true,
            allowTaint: true,
            useCORS: true
        });
        
        const imgData = canvas.toDataURL('image/png');
        
        // 🔥 PDF NA HORIZONTAL (landscape)
        const pdf = new jspdf.jsPDF({
            orientation: 'landscape', // Horizontal
            unit: 'mm',
            format: 'a4'
        });
        
        // Dimensões A4 landscape: 297mm x 210mm
        const pageWidth = 297;
        const pageHeight = 210;
        
        // Calcular dimensões da imagem para caber na página
        const imgWidth = pageWidth - 20; // Margem de 10mm de cada lado
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // Centralizar verticalmente se necessário
        const yPos = (pageHeight - imgHeight) / 2;
        
        pdf.addImage(imgData, 'PNG', 10, yPos, imgWidth, imgHeight);
        pdf.save(`Relatorio_${dados.mesNome}_${dados.ano}.pdf`);
        
        // Limpa o iframe
        document.body.removeChild(iframe);
        
        mostrarToast('PDF gerado com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        mostrarToast('Erro ao gerar PDF: ' + error.message, 'error');
    }
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

function gerarHTMLCalendarioPDF(dados) {
    const { mesNome, ano, primeiroDia, diasNoMes, eventosPorData, mes, ferias, folgas, ausencias, feriados } = dados;
    const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #6366f1; text-align: center; font-size: 32px; margin-bottom: 5px; }
                h2 { color: #1e293b; text-align: center; font-size: 24px; text-transform: uppercase; margin-top: 0; margin-bottom: 20px; }
                
                .calendario-pdf {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                }
                
                .calendario-pdf th {
                    background: #6366f1;
                    color: white;
                    padding: 10px;
                    font-weight: 600;
                    font-size: 12px;
                    border: 1px solid #cbd5e1;
                }
                
                .calendario-pdf td {
                    border: 1px solid #cbd5e1;
                    vertical-align: top;
                    height: 80px;
                    width: 14.28%;
                    padding: 4px;
                    font-size: 11px;
                }
                
                .calendario-pdf td.vazio {
                    background: #f8fafc;
                }
                
                /* DESTAQUE PARA DOMINGOS */
                .calendario-pdf td.domingo {
                    background-color: #fef9c3 !important;
                }
                
                .calendario-pdf td.domingo .dia-numero {
                    color: #b45309;
                    font-weight: 800;
                }
                
                .calendario-pdf td.feriado {
                    background: #fee2e2;
                }
                
                .dia-numero {
                    font-weight: bold;
                    font-size: 14px;
                    margin-bottom: 3px;
                }
                
                .dia-feriado {
                    font-size: 8px;
                    color: #ef4444;
                    font-weight: 600;
                    margin-bottom: 3px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .evento-tag {
                    font-size: 7px;
                    padding: 2px 3px;
                    border-radius: 3px;
                    margin-top: 2px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .folga-tag { background: #d1fae5; color: #059669; }
                .ferias-tag { background: #e0e7ff; color: #4f52e0; }
                .ausencia-tag { background: #fee2e2; color: #dc2626; }
                
                /* Legendas */
                .legendas-calendario {
                    display: flex;
                    gap: 15px;
                    margin-top: 10px;
                    margin-bottom: 25px;
                    padding: 10px;
                    background: #f8fafc;
                    border-radius: 8px;
                    flex-wrap: wrap;
                }
                
                .legenda-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                }
                
                .legenda-cor {
                    width: 14px;
                    height: 14px;
                    border-radius: 4px;
                }
                
                .legenda-folga { background: #d1fae5; border: 1px solid #059669; }
                .legenda-ferias { background: #e0e7ff; border: 1px solid #4f52e0; }
                .legenda-ausencia { background: #fee2e2; border: 1px solid #dc2626; }
                .legenda-feriado { background: #fee2e2; border: 1px solid #dc2626; }
                .legenda-domingo { background: #fef9c3; border: 1px solid #b45309; }
                
                /* Listas de eventos */
                .eventos-listas {
                    margin-top: 25px;
                }
                
                .eventos-coluna {
                    margin-bottom: 20px;
                }
                
                .eventos-coluna h3 {
                    font-size: 14px;
                    font-weight: 700;
                    color: #1e293b;
                    margin-bottom: 10px;
                    padding-bottom: 5px;
                    border-bottom: 2px solid #e2e8f0;
                }
                
                .eventos-tabela {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                }
                
                .eventos-tabela th {
                    text-align: left;
                    padding: 6px;
                    background: #f1f5f9;
                    color: #475569;
                    font-weight: 600;
                }
                
                .eventos-tabela td {
                    padding: 4px 6px;
                    border-bottom: 1px solid #e2e8f0;
                }
                
                .resumo-rodape {
                    margin-top: 20px;
                    padding: 10px;
                    background: #f8fafc;
                    border-radius: 8px;
                    text-align: center;
                    font-size: 11px;
                    color: #475569;
                }
                
                .resumo-rodape strong {
                    color: #6366f1;
                    font-size: 13px;
                }
            </style>
        </head>
        <body>
            <h1>${ano}</h1>
            <h2>${mesNome.toUpperCase()}</h2>
            
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
        
        // Determinar classes da célula
        let classesCelula = [];
        if (isDomingo) classesCelula.push('domingo');
        if (isFeriado) classesCelula.push('feriado');
        
        const colaboradoresDia = eventos?.colaboradores || [];
        const folgasDia = colaboradoresDia.filter(c => c.tipo === 'folga');
        const feriasDia = colaboradoresDia.filter(c => c.tipo === 'ferias');
        const ausenciasDia = colaboradoresDia.filter(c => c.tipo === 'ausencia');
        
        linhaAtual += `<td class="${classesCelula.join(' ')}">`;
        linhaAtual += `<div class="dia-numero">${dia}</div>`;
        
        if (isFeriado) {
            linhaAtual += `<div class="dia-feriado">${eventos.feriado}</div>`;
        }
        
        // Adiciona eventos
        folgasDia.forEach(e => {
            linhaAtual += `<div class="evento-tag folga-tag">${e.nome}</div>`;
        });
        
        feriasDia.forEach(e => {
            linhaAtual += `<div class="evento-tag ferias-tag">${e.nome}</div>`;
        });
        
        ausenciasDia.forEach(e => {
            linhaAtual += `<div class="evento-tag ausencia-tag">${e.nome}</div>`;
        });
        
        linhaAtual += '</td>';
        
        // Quebra linha no sábado
        if ((primeiroDia + dia) % 7 === 0) {
            linhaAtual += '</tr>';
            html += linhaAtual;
            if (dia < diasNoMes) {
                linhaAtual = '<tr>';
            }
        }
    }
    
    // Completa a última linha se necessário
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
            
            <!-- Legendas do calendário -->
            <div class="legendas-calendario">
                <div class="legenda-item">
                    <span class="legenda-cor legenda-folga"></span>
                    <span>Folga</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor legenda-ferias"></span>
                    <span>Férias</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor legenda-ausencia"></span>
                    <span>Ausência</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor legenda-feriado"></span>
                    <span>Feriado</span>
                </div>
                <div class="legenda-item">
                    <span class="legenda-cor legenda-domingo"></span>
                    <span>Domingo</span>
                </div>
            </div>
            
            <!-- Listas detalhadas de eventos -->
            <div class="eventos-listas">
    `;
    
    // Lista de Férias
    if (ferias && ferias.length > 0) {
        html += `
                <div class="eventos-coluna">
                    <h3>🌸 Férias</h3>
                    <table class="eventos-tabela">
                        <thead>
                            <tr><th>Colaborador</th><th>Data</th></tr>
                        </thead>
                        <tbody>
        `;
        
        ferias.forEach(f => {
            html += `
                <tr>
                    <td>${f.colaborador}</td>
                    <td>${f.dataFormatada}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table></div>';
    }
    
    // Lista de Folgas
    if (folgas && folgas.length > 0) {
        html += `
                <div class="eventos-coluna">
                    <h3>🌸 Folgas</h3>
                    <table class="eventos-tabela">
                        <thead>
                            <tr><th>Colaborador</th><th>Data</th></tr>
                        </thead>
                        <tbody>
        `;
        
        folgas.forEach(f => {
            html += `
                <tr>
                    <td>${f.colaborador}</td>
                    <td>${f.dataFormatada}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table></div>';
    }
    
    // Lista de Ausências
    if (ausencias && ausencias.length > 0) {
        html += `
                <div class="eventos-coluna">
                    <h3>⚠️ Ausências</h3>
                    <table class="eventos-tabela">
                        <thead>
                            <tr><th>Colaborador</th><th>Data</th></tr>
                        </thead>
                        <tbody>
        `;
        
        ausencias.forEach(a => {
            html += `
                <tr>
                    <td>${a.colaborador}</td>
                    <td>${a.dataFormatada}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table></div>';
    }
    
    // Lista de Feriados
    if (feriados && feriados.length > 0) {
        html += `
                <div class="eventos-coluna">
                    <h3>📅 Feriados</h3>
                    <table class="eventos-tabela">
                        <thead>
                            <tr><th>Feriado</th><th>Data</th></tr>
                        </thead>
                        <tbody>
        `;
        
        feriados.forEach(f => {
            html += `
                <tr>
                    <td>${f.nome}</td>
                    <td>${formatarDataBR(f.data)}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table></div>';
    }
    
    // Resumo
    const totalEventos = (ferias?.length || 0) + (folgas?.length || 0) + (ausencias?.length || 0) + (feriados?.length || 0);
    
    html += `
            </div>
            
            <div class="resumo-rodape">
                <strong>Total de lançamentos no mês: ${totalEventos}</strong> 
                (${ferias?.length || 0} férias, ${folgas?.length || 0} folgas, ${ausencias?.length || 0} ausências, ${feriados?.length || 0} feriados)
            </div>
        </body>
        </html>
    `;
    
    return html;
}