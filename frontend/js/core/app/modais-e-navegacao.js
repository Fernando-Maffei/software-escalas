

/* ===========================
   CONFIGURAÇÃO DE MODAIS
=========================== */
// Função para fechar modal
function fecharModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('active');
    }
}

let dataSelecionada = null;

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


// Adicione no início do app.js
function corrigirDataISO(dataStr) {
    if (!dataStr) return dataStr;
    
    // Se já estiver no formato YYYY-MM-DD, retorna
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
        return dataStr;
    }
    
    // Se tiver T, extrai só a parte da data
    if (dataStr.includes('T')) {
        return dataStr.split('T')[0];
    }
    
    return dataStr;
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




/* ===========================
   NAVEGAÇÃO
=========================== */
function configurarNavegacao() {
   console.log('Navegação configurada');
}

// Pagina que esta montada agora. O popstate abaixo usa para ignorar o eco da
// propria troca de hash (ver comentario no listener).
let paginaCarregadaAtual = null;

function carregarPagina(pagina) {
    console.log('Carregando página:', pagina);

    if (!appContent) return;

    paginaCarregadaAtual = pagina;

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
        case "usuarios":
            renderUsuarios();
            break;
        case "relatorios":
            renderRelatorios();
            break;
        case "bancoHoras":
            if (typeof window.renderBancoHoras === 'function') {
                window.renderBancoHoras();
            } else {
                console.error('renderBancoHoras nao carregado');
                renderDashboard();
            }
            break;
        default:
            console.log("Página não encontrada:", pagina);
            renderDashboard(); // Fallback para dashboard
    }
}

function getDiaSemana(dataISO) {
    if (!dataISO) return new Date().getDay();
    const [ano, mes, dia] = dataISO.split('-').map(Number);
    const data = new Date(ano, mes - 1, dia); // mês em JS é 0-11
    return data.getDay(); // 0 = Domingo, 6 = Sábado
}


function buscarPlantaoDoDia(dataISO) {
    console.log('🔍 ===== INICIANDO BUSCA DE PLANTÃO =====');
    console.log('📅 Data recebida:', dataISO);
    
    // 🔥 USAR plantoesLancados DIRETAMENTE, não window.plantoesLancados
    if (!plantoesLancados || plantoesLancados.length === 0) {
        console.log('❌ Nenhum plantão carregado');
        return null;
    }
    
    console.log('📋 Total de plantões:', plantoesLancados.length);
    
    const dataBusca = String(dataISO).trim().split('T')[0];
    console.log('📅 Data de busca limpa:', dataBusca);
    
    // O dia pode ter varios turnos (registros), cada um com sua equipe. Quem
    // esta em QUALQUER turno esta de plantao naquele dia, entao a busca junta
    // todos — pegar so o primeiro registro deixaria de fora quem entrou no
    // turno da tarde.
    const doDia = plantoesLancados.filter(p => {
        let dataPlantao = p.dataISO || p.data_plantao || '';
        dataPlantao = String(dataPlantao).trim().split('T')[0];
        return dataPlantao === dataBusca;
    });

    if (doDia.length > 0) {
        const colaboradoresDoDia = [...new Set(
            doDia.flatMap(p => Array.isArray(p.colaboradores) ? p.colaboradores : [])
        )];

        console.log('✅ Plantão encontrado! Colaboradores:', colaboradoresDoDia);
        return colaboradoresDoDia;
    }

    console.log('❌ Nenhum plantão encontrado para', dataBusca);
    return null;
}


function gerarResumoHorariosVazio() {
    const resumoGrid = document.getElementById('resumoGrid');
    if (!resumoGrid) return;
    
    resumoGrid.innerHTML = `
        <div class="resumo-card" style="grid-column: span 12; text-align: center; padding: 40px;">
            <i class="fas fa-sun" style="font-size: 48px; color: var(--primary); margin-bottom: 16px;"></i>
            <h3 style="color: var(--text); margin-bottom: 8px;">Domingo - Não há expediente</h3>
            <p style="color: var(--text-light);">Nenhum colaborador trabalha aos domingos</p>
        </div>
    `;
}

/* ===========================
   TELA COLABORADORES
=========================== */
