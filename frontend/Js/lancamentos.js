
if (typeof API === 'undefined') {
    console.error('API não encontrada! Verifique se api.js foi carregado antes de lancamentos.js');
    // Criar uma API fallback para não quebrar o código
    window.API = {
        salvarFeriado: async (data) => { throw new Error('API não configurada'); },
        salvarAusencia: async (data) => { throw new Error('API não configurada'); },
        getFeriados: async () => { return []; },
        getAusencias: async () => { return []; },
        getColaboradores: async () => { return []; }
    };
}



let editandoLancamentoId = null;
let editandoTipoLancamento = null; 

// Garantir que os eventos são configurados quando a página carrega
document.addEventListener('DOMContentLoaded', function() {
    console.log("Inicializando eventos das abas no DOMContentLoaded");
    setTimeout(configurarEventosAbas, 500); // Pequeno delay para garantir que o DOM está pronto
});

// Também configurar quando o modal for aberto
document.addEventListener('click', function(e) {
    if (e.target.id === 'btnLancamentoAjuste' || e.target.closest('#btnLancamentoAjuste') ||
        e.target.id === 'btnFeriadoMunicipal' || e.target.closest('#btnFeriadoMunicipal')) {
        // Pequeno delay para garantir que o modal foi renderizado
        setTimeout(configurarEventosAbas, 300);
    }
});

// ================= ABRIR MODAL =================
function abrirModalLancamento(tipo = 'pessoal', dataISO = null) {
    console.log("Abrindo modal de lançamento...", tipo, dataISO);
    
    const modal = document.getElementById("modalLancamento");
    if (!modal) return;
    
    // 🔥 CONFIGURAR EVENTOS
    configurarEventosAbas();
    configurarBotoesFormulario();
    
    // Resetar formulário
    resetarFormularioLancamento();
    
    // Ativar aba correta
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const abaAtiva = document.getElementById(`tab${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`);
    if (abaAtiva) {
        abaAtiva.classList.add('active');
    }
    
    // Mostrar conteúdo da aba correta
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const containerAtivo = document.getElementById(`lista${tipo.charAt(0).toUpperCase() + tipo.slice(1)}Container`);
    if (containerAtivo) {
        containerAtivo.classList.add('active');
    }
    
    // Carregar dados
    carregarColaboradoresNoSelect();
    carregarListagens();
    
    // Se tiver data, preencher
    if (dataISO) {
        const dataFormatada = dataISO.split('T')[0];
        document.getElementById("dataInicio").value = dataFormatada;
        document.getElementById("dataFim").value = dataFormatada;
    }
    
    // Configurar tipo de lançamento baseado na aba
    if (tipo === 'feriados') {
        document.getElementById('tipoLancamento').value = 'feriado';
    } else {
        document.getElementById('tipoLancamento').value = 'folga';
    }
    
    // Disparar evento de mudança para atualizar campos
    document.getElementById('tipoLancamento').dispatchEvent(new Event('change'));
    
    modal.classList.remove("hidden");
    modal.classList.add("active");
}

// ================= RESETAR FORMULÁRIO =================
// ================= RESETAR FORMULÁRIO =================
function resetarFormularioLancamento() {
    console.log("Resetando formulário");
    
    // Valores padrão
    document.getElementById("tipoLancamento").value = "folga";
    document.getElementById("colaboradorSelect").value = "";
    document.getElementById("feriadoNome").value = "";
    document.getElementById("feriadoTipo").value = "municipal";
    document.getElementById("periodoTipo").value = "dia_inteiro";
    document.getElementById("dataInicio").value = "";
    document.getElementById("dataFim").value = "";
    document.getElementById("horaInicio").value = "";
    document.getElementById("horaFim").value = "";
    
    // 🔥 IMPORTANTE: Esconder TODOS os campos condicionais primeiro
    document.getElementById("camposPessoal").classList.add("hidden");
    document.getElementById("camposFeriado").classList.add("hidden");
    document.getElementById("campoNomeFeriado").classList.add("hidden");
    document.getElementById("camposHora").classList.add("hidden");
    
    // Por padrão, mostrar campos pessoais (já que o tipo inicial é 'folga')
    document.getElementById("camposPessoal").classList.remove("hidden");
    
    editandoLancamentoId = null;
    editandoTipoLancamento = null;
    document.getElementById("salvarLancamentoBtn").innerHTML = '<i class="fas fa-save"></i> Salvar';
    document.getElementById("cancelarEdicaoLancamentoBtn").classList.add("hidden");
    document.getElementById("formTitulo").innerHTML = '<i class="fas fa-pen"></i> Novo Lançamento';
}

// ================= EVENTO DE MUDANÇA DO TIPO =================
document.getElementById("tipoLancamento")?.addEventListener('change', function(e) {
    const tipo = e.target.value;
    console.log("Tipo alterado para:", tipo);
    
    // Esconder todos os campos primeiro
    document.getElementById("camposPessoal").classList.add("hidden");
    document.getElementById("camposFeriado").classList.add("hidden");
    document.getElementById("campoNomeFeriado").classList.add("hidden");
    document.getElementById("camposHora").classList.add("hidden");
    
    if (tipo === 'feriado') {
        // Modo feriado - mostrar apenas campos de feriado
        document.getElementById("camposFeriado").classList.remove("hidden");
        document.getElementById("campoNomeFeriado").classList.remove("hidden");
        document.getElementById("formTitulo").innerHTML = '<i class="fas fa-city"></i> Novo Feriado';
        
        // Desabilitar período de horas (não se aplica a feriados)
        document.getElementById("periodoTipo").value = "dia_inteiro";
        
    } else {
        // Modo pessoal (folga, ausencia, ferias) - mostrar campos de colaborador
        document.getElementById("camposPessoal").classList.remove("hidden");
        document.getElementById("formTitulo").innerHTML = '<i class="fas fa-pen"></i> Novo Lançamento';
        
        // Se for período de horas, mostrar campos de hora
        if (document.getElementById("periodoTipo").value === 'horas') {
            document.getElementById("camposHora").classList.remove("hidden");
        }
    }
});

// ================= EVENTO DE MUDANÇA DO PERÍODO =================
document.getElementById("periodoTipo")?.addEventListener('change', function(e) {
    if (e.target.value === 'horas') {
        document.getElementById("camposHora").classList.remove("hidden");
    } else {
        document.getElementById("camposHora").classList.add("hidden");
    }
});

// ================= EVENTO DAS ABAS =================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const tab = this.dataset.tab;
        
        // Atualizar abas
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        // Atualizar conteúdo
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`lista${tab.charAt(0).toUpperCase() + tab.slice(1)}Container`).classList.add('active');
    });
});

// ================= CONFIGURAÇÃO DAS ABAS =================
// ================= CONFIGURAÇÃO DAS ABAS =================
document.addEventListener('DOMContentLoaded', function() {
    configurarAbas();
});

function configurarAbas() {
    const tabPessoal = document.getElementById('tabPessoal');
    const tabFeriados = document.getElementById('tabFeriados');
    
    if (tabPessoal) {
        // Remove eventos antigos clonando e substituindo
        const newTabPessoal = tabPessoal.cloneNode(true);
        tabPessoal.parentNode.replaceChild(newTabPessoal, tabPessoal);
        
        newTabPessoal.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Aba Pessoal clicada");
            
            // Atualizar classes das abas
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
            
            // Mostrar conteúdo pessoal
            document.getElementById('listaPessoalContainer').classList.add('active');
            document.getElementById('listaFeriadosContainer').classList.remove('active');
            
            // Resetar formulário para modo pessoal
            document.getElementById('tipoLancamento').value = 'folga';
            
            // Disparar evento de mudança para atualizar campos
            const event = new Event('change', { bubbles: true });
            document.getElementById('tipoLancamento').dispatchEvent(event);
            
            // Recarregar listagem pessoal
            carregarListaPessoal();
        });
    }
    
    if (tabFeriados) {
        // Remove eventos antigos clonando e substituindo
        const newTabFeriados = tabFeriados.cloneNode(true);
        tabFeriados.parentNode.replaceChild(newTabFeriados, tabFeriados);
        
        newTabFeriados.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Aba Feriados clicada");
            
            // Atualizar classes das abas
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
            
            // Mostrar conteúdo feriados
            document.getElementById('listaFeriadosContainer').classList.add('active');
            document.getElementById('listaPessoalContainer').classList.remove('active');
            
            // Mudar formulário para modo feriado
            document.getElementById('tipoLancamento').value = 'feriado';
            
            // Disparar evento de mudança para atualizar campos
            const event = new Event('change', { bubbles: true });
            document.getElementById('tipoLancamento').dispatchEvent(event);
            
            // Recarregar listagem de feriados
            carregarListaFeriados();
        });
    }
}

// ================= CONFIGURAR EVENTOS DAS ABAS =================
function configurarEventosAbas() {
    console.log("Configurando eventos das abas");
    
    const tabPessoal = document.getElementById('tabPessoal');
    const tabFeriados = document.getElementById('tabFeriados');
    
    if (tabPessoal) {
        // Remover eventos anteriores
        const newTabPessoal = tabPessoal.cloneNode(true);
        tabPessoal.parentNode.replaceChild(newTabPessoal, tabPessoal);
        
        newTabPessoal.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Aba Pessoal clicada (evento novo)");
            
            // Atualizar classes
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Mostrar conteúdo
            document.getElementById('listaPessoalContainer').classList.add('active');
            document.getElementById('listaFeriadosContainer').classList.remove('active');
            
            // Atualizar formulário
            document.getElementById('tipoLancamento').value = 'folga';
            document.getElementById('tipoLancamento').dispatchEvent(new Event('change'));
            
            // Recarregar listagem
            carregarListaPessoal();
        });
    }
    
    if (tabFeriados) {
        // Remover eventos anteriores
        const newTabFeriados = tabFeriados.cloneNode(true);
        tabFeriados.parentNode.replaceChild(newTabFeriados, tabFeriados);
        
        newTabFeriados.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Aba Feriados clicada (evento novo)");
            
            // Atualizar classes
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Mostrar conteúdo
            document.getElementById('listaFeriadosContainer').classList.add('active');
            document.getElementById('listaPessoalContainer').classList.remove('active');
            
            // Atualizar formulário
            document.getElementById('tipoLancamento').value = 'feriado';
            document.getElementById('tipoLancamento').dispatchEvent(new Event('change'));
            
            // Recarregar listagem
            carregarListaFeriados();
        });
    }
}

// ================= CARREGAR LISTAGENS =================
async function carregarListagens() {
    const loadingEl = document.getElementById("loadingLancamentos");
    const emptyEl = document.getElementById("emptyLancamentos");
    
    loadingEl.classList.remove("hidden");
    emptyEl.classList.add("hidden");
    
    try {
        await Promise.all([
            carregarListaPessoal(),
            carregarListaFeriados()
        ]);
        
        loadingEl.classList.add("hidden");
        
        // Verificar se ambas as listas estão vazias
        const listaPessoal = document.getElementById("listaPessoal");
        const listaFeriados = document.getElementById("listaFeriados");
        
        if ((!listaPessoal.children || listaPessoal.children.length === 0) && 
            (!listaFeriados.children || listaFeriados.children.length === 0)) {
            emptyEl.classList.remove("hidden");
        }
        
    } catch (error) {
        console.error("Erro ao carregar listagens:", error);
        loadingEl.classList.add("hidden");
        emptyEl.classList.remove("hidden");
        emptyEl.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>
            <p style="color: var(--danger);">Erro ao carregar dados</p>
            <button onclick="carregarListagens()" class="btn-primary">
                <i class="fas fa-sync"></i> Tentar novamente
            </button>
        `;
    }
}

// ================= CARREGAR LISTA PESSOAL =================
async function carregarListaPessoal() {
    console.log("Carregando lista pessoal...");
    
    const container = document.getElementById("listaPessoal");
    if (!container) {
        console.error("Container listaPessoal não encontrado");
        return;
    }
    
    // Mostrar loading
    document.getElementById("loadingLancamentos").classList.remove("hidden");
    container.innerHTML = '';
    
    try {
        await carregarAusencias();
        
        if (!window.ausencias || window.ausencias.length === 0) {
            console.log("Nenhuma ausência encontrada");
            document.getElementById("loadingLancamentos").classList.add("hidden");
            container.innerHTML = '<div class="empty-state">Nenhum lançamento encontrado</div>';
            return;
        }
        
        // 🔥 PEGAR MÊS E ANO ATUAIS DO CALENDÁRIO
        const mesAtual = window.mesAtual !== undefined ? window.mesAtual : new Date().getMonth();
        const anoAtual = window.anoAtual !== undefined ? window.anoAtual : new Date().getFullYear();
        
        console.log(`Filtrando lançamentos para ${mesAtual+1}/${anoAtual}`);
        
        // Filtrar ausências do mês atual
        const ausenciasFiltradas = window.ausencias.filter(a => {
            if (!a.DataInicio || !a.DataFim) return false;
            
            const dataInicio = new Date(a.DataInicio);
            const dataFim = new Date(a.DataFim);
            
            // Verificar se o período cruza com o mês atual
            const primeiroDiaMes = new Date(anoAtual, mesAtual, 1);
            const ultimoDiaMes = new Date(anoAtual, mesAtual + 1, 0);
            
            return dataFim >= primeiroDiaMes && dataInicio <= ultimoDiaMes;
        });
        
        console.log(`Ausências filtradas: ${ausenciasFiltradas.length} de ${window.ausencias.length}`);
        
        document.getElementById("loadingLancamentos").classList.add("hidden");
        
        if (ausenciasFiltradas.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum lançamento neste mês</div>';
            return;
        }
        
        // Gerar HTML dos cards
        let html = '';
        
        ausenciasFiltradas.forEach(a => {
            const colaborador = window.colaboradores?.find(c => c.Id === (a.colaboradorId || a.ColaboradorId));
            const tipo = a.tipo || a.Tipo || '';
            
            let icone = '📅';
            let classe = '';
            let texto = tipo;
            
            if (tipo === 'folga') {
                icone = '🌸';
                classe = 'folga';
                texto = 'Folga';
            } else if (tipo === 'ausencia') {
                icone = '⚠️';
                classe = 'ausencia';
                texto = 'Ausência';
            } else if (tipo === 'ferias') {
                icone = '🏖️';
                classe = 'ferias';
                texto = 'Férias';
            }
            
            const dataInicio = new Date(a.DataInicio);
            const dataFim = new Date(a.DataFim);
            
            const dataInicioStr = dataInicio.toLocaleDateString('pt-BR');
            const dataFimStr = dataFim.toLocaleDateString('pt-BR');
            
            const id = a.id || a.Id;
            
            html += `
                <div class="lancamento-card pessoal" data-id="${id}">
                    <div class="lancamento-header">
                        <div class="lancamento-titulo">
                            <i class="fas fa-user-circle"></i>
                            <span>${colaborador?.Nome || 'Desconhecido'}</span>
                        </div>
                        <span class="lancamento-badge ${classe}">${icone} ${texto}</span>
                    </div>
                    <div class="lancamento-data">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${dataInicioStr} - ${dataFimStr}</span>
                    </div>
                    <div class="lancamento-actions">
                        <button onclick="editarLancamento('pessoal', ${id})" class="btn-icon-sm edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="excluirLancamento('pessoal', ${id})" class="btn-icon-sm delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error("Erro ao carregar lista pessoal:", error);
        document.getElementById("loadingLancamentos").classList.add("hidden");
        container.innerHTML = '<div class="empty-state">Erro ao carregar dados</div>';
    }
}
// ================= CARREGAR LISTA DE FERIADOS =================
async function carregarListaFeriados() {
    console.log("=== CARREGANDO FERIADOS LANÇADOS ===");
    
    const container = document.getElementById("listaFeriados");
    if (!container) {
        console.error("Container listaFeriados não encontrado");
        return;
    }
    
    // Mostrar loading
    const loadingEl = document.getElementById("loadingLancamentos");
    if (loadingEl) loadingEl.classList.remove("hidden");
    container.innerHTML = '';
    
    try {
        // Buscar feriados do backend (os que foram lançados)
        console.log("Buscando feriados lançados do backend...");
        const feriadosData = await window.API.getFeriados();
        console.log("Feriados recebidos do backend:", feriadosData);
        
        // Atualizar variável global
        window.feriadosLocais = feriadosData || [];
        
        if (loadingEl) loadingEl.classList.add("hidden");
        
        if (!window.feriadosLocais || window.feriadosLocais.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>Nenhum feriado lançado</p><small>Clique em "Novo Feriado" para adicionar</small></div>';
            return;
        }
        
        // PEGAR MÊS E ANO ATUAIS DO CALENDÁRIO
        const mesAtual = window.mesAtual !== undefined ? window.mesAtual : new Date().getMonth();
        const anoAtual = window.anoAtual !== undefined ? window.anoAtual : new Date().getFullYear();
        
        console.log(`Filtrando feriados para ${mesAtual+1}/${anoAtual}`);
        
        // Filtrar feriados do mês atual
        const feriadosFiltrados = window.feriadosLocais.filter(f => {
            // Pega a data do feriado (pode estar em Data ou data)
            const dataFeriado = f.Data || f.data;
            if (!dataFeriado) return false;
            
            // Converte para Date
            const data = new Date(dataFeriado);
            if (isNaN(data.getTime())) return false;
            
            // Compara mês e ano
            return data.getMonth() === mesAtual && data.getFullYear() === anoAtual;
        });
        
        console.log(`Feriados filtrados: ${feriadosFiltrados.length} de ${window.feriadosLocais.length}`);
        
        if (feriadosFiltrados.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>Nenhum feriado neste mês</p></div>';
            return;
        }
        
        // Gerar HTML dos cards
        let html = '';
        
        feriadosFiltrados.forEach(f => {
            // Pega a data (pode estar em Data ou data)
            const dataFeriado = f.Data || f.data;
            const data = new Date(dataFeriado);
            const dataFormatada = data.toLocaleDateString('pt-BR');
            
            // Pega o ID (pode estar em Id ou id)
            const id = f.Id || f.id;
            
            // Pega o tipo (municipal/estadual)
            const tipo = f.Tipo || f.tipo || 'municipal';
            
            // Pega o nome
            const nome = f.Nome || f.nome || 'Feriado';
            
            console.log("Renderizando feriado:", { id, nome, data: dataFormatada, tipo });
            
            html += `
                <div class="lancamento-card feriado" data-id="${id}">
                    <div class="lancamento-header">
                        <div class="lancamento-titulo">
                            <i class="fas fa-city"></i>
                            <span>${nome}</span>
                        </div>
                        <span class="lancamento-badge ${tipo}">🏛️ ${tipo}</span>
                    </div>
                    <div class="lancamento-data">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${dataFormatada}</span>
                    </div>
                    <div class="lancamento-actions">
                        <button onclick="editarLancamento('feriado', ${id})" class="btn-icon-sm edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="excluirLancamento('feriado', ${id})" class="btn-icon-sm delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        console.log("Lista de feriados renderizada com sucesso");
        
    } catch (error) {
        console.error("Erro ao carregar lista de feriados:", error);
        if (loadingEl) loadingEl.classList.add("hidden");
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar feriados</p><small>${error.message}</small></div>`;
    }
}
// ================= EDITAR LANÇAMENTO =================
function editarLancamento(tipo, id) {
    if (tipo === 'feriado') {
        const item = window.feriadosLocais.find(f => (f.Id === id || f.id === id));
        if (!item) return;
        
        // Mudar para aba de feriados
        document.querySelector('[data-tab="feriados"]').click();
        
        // Preencher formulário
        document.getElementById("tipoLancamento").value = "feriado";
        document.getElementById("tipoLancamento").dispatchEvent(new Event('change'));
        
        document.getElementById("feriadoNome").value = item.Nome || item.nome;
        document.getElementById("feriadoTipo").value = item.Tipo || item.tipo || 'municipal';
        
        const data = new Date(item.Data || item.data);
        const dataFormatada = data.toISOString().split('T')[0];
        document.getElementById("dataInicio").value = dataFormatada;
        document.getElementById("dataFim").value = dataFormatada;
        
        editandoLancamentoId = id;
        editandoTipoLancamento = 'feriado';
        document.getElementById("salvarLancamentoBtn").innerHTML = '<i class="fas fa-check"></i> Atualizar';
        document.getElementById("cancelarEdicaoLancamentoBtn").classList.remove("hidden");
        document.getElementById("formTitulo").innerHTML = '<i class="fas fa-city"></i> Editar Feriado';
        
    } else {
        const item = window.ausencias.find(a => (a.id || a.Id) === id);
        if (!item) return;
        
        // Mudar para aba pessoal
        document.querySelector('[data-tab="pessoal"]').click();
        
        // Preencher formulário
        document.getElementById("tipoLancamento").value = item.tipo || item.Tipo;
        document.getElementById("tipoLancamento").dispatchEvent(new Event('change'));
        
        document.getElementById("colaboradorSelect").value = item.colaboradorId || item.ColaboradorId;
        
        const dataInicio = new Date(item.DataInicio || item.dataInicio);
        const dataFim = new Date(item.DataFim || item.dataFim);
        document.getElementById("dataInicio").value = dataInicio.toISOString().split('T')[0];
        document.getElementById("dataFim").value = dataFim.toISOString().split('T')[0];
        
        if (item.periodoTipo === 'horas') {
            document.getElementById("periodoTipo").value = 'horas';
            document.getElementById("periodoTipo").dispatchEvent(new Event('change'));
            document.getElementById("horaInicio").value = item.horaInicio?.substring(0, 5);
            document.getElementById("horaFim").value = item.horaFim?.substring(0, 5);
        }
        
        editandoLancamentoId = id;
        editandoTipoLancamento = 'pessoal';
        document.getElementById("salvarLancamentoBtn").innerHTML = '<i class="fas fa-check"></i> Atualizar';
        document.getElementById("cancelarEdicaoLancamentoBtn").classList.remove("hidden");
        document.getElementById("formTitulo").innerHTML = '<i class="fas fa-pen"></i> Editar Lançamento';
    }
}

// ================= SALVAR LANÇAMENTO =================
// ================= SALVAR LANÇAMENTO =================
async function salvarLancamento() {
    console.log("=== SALVANDO LANÇAMENTO ===");
    console.log("API disponível?", !!window.API);
    
    const tipo = document.getElementById("tipoLancamento").value;
    const dataInicio = document.getElementById("dataInicio").value;
    const dataFim = document.getElementById("dataFim").value;
    
    console.log("Tipo:", tipo);
    console.log("Data início:", dataInicio);
    console.log("Data fim:", dataFim);
    
    if (!dataInicio || !dataFim) {
        mostrarToast("Preencha as datas", "error");
        return;
    }
    
    if (dataFim < dataInicio) {
        mostrarToast("Data fim deve ser maior ou igual à data início", "error");
        return;
    }
    
    // Verificar se a API existe
    if (!window.API) {
        console.error("API não encontrada!");
        mostrarToast("Erro: API não configurada", "error");
        return;
    }
    
    try {
        if (tipo === 'feriado') {
            // ===== SALVAR FERIADO =====
            const nome = document.getElementById("feriadoNome").value;
            const abrangencia = document.getElementById("feriadoTipo").value;
            
            console.log("Salvando feriado:", { nome, dataInicio, abrangencia });
            
            if (!nome) {
                mostrarToast("Digite o nome do feriado", "error");
                return;
            }
            
            // Preparar dados para a API
            const feriadoData = {
                nome: nome,
                data: dataInicio,
                tipo: abrangencia
            };
            
            // Se estiver editando, adicionar ID
            if (editandoTipoLancamento === 'feriado' && editandoLancamentoId) {
                feriadoData.id = editandoLancamentoId;
            }
            
            console.log("Enviando feriado para API:", feriadoData);
            
            // Usar a API
            const resultado = await window.API.salvarFeriado(feriadoData);
            console.log("Resposta da API:", resultado);
            
        } else {
            // ===== SALVAR AUSÊNCIA (folga, ausencia, ferias) =====
            const colaboradorId = document.getElementById("colaboradorSelect").value;
            const periodoTipo = document.getElementById("periodoTipo").value;
            const horaInicio = document.getElementById("horaInicio").value;
            const horaFim = document.getElementById("horaFim").value;
            
            console.log("Salvando ausência:", { 
                colaboradorId, 
                tipo, 
                dataInicio, 
                dataFim,
                periodoTipo,
                horaInicio,
                horaFim
            });
            
            if (!colaboradorId) {
                mostrarToast("Selecione um colaborador", "error");
                return;
            }
            
            if (periodoTipo === 'horas' && (!horaInicio || !horaFim)) {
                mostrarToast("Preencha as horas", "error");
                return;
            }
            
            // Preparar dados para a API
            const ausenciaData = {
                colaboradorId: parseInt(colaboradorId),
                tipo: tipo,
                dataInicio: dataInicio,
                dataFim: dataFim,
                periodoTipo: periodoTipo,
                horaInicio: periodoTipo === 'horas' ? horaInicio : null,
                horaFim: periodoTipo === 'horas' ? horaFim : null
            };
            
            // Se estiver editando, adicionar ID
            if (editandoTipoLancamento === 'pessoal' && editandoLancamentoId) {
                ausenciaData.id = editandoLancamentoId;
            }
            
            console.log("Enviando ausência para API:", ausenciaData);
            
            // Usar a API
            const resultado = await window.API.salvarAusencia(ausenciaData);
            console.log("Resposta da API:", resultado);
        }
        
        // ===== SUCESSO - RECARREGAR DADOS =====
        mostrarToast("Salvo com sucesso!", "success");
        
        // Recarregar dados
        await Promise.all([
            carregarColaboradores(),
            carregarAusencias(),
            carregarFeriadosLocais()
        ]);
        
        // Recarregar listagens
        await carregarListagens();
        
        // Resetar formulário
        resetarFormularioLancamento();
        
        // Atualizar calendário se necessário
        if (document.getElementById("calendar") && typeof gerarCalendario === 'function') {
            gerarCalendario(window.mesAtual || new Date().getMonth(), window.anoAtual || new Date().getFullYear());
        }
        
    } catch (error) {
        console.error("Erro detalhado ao salvar:", error);
        mostrarToast(`Erro: ${error.message}`, "error");
    }
}
// ================= EXCLUIR LANÇAMENTO =================
function excluirLancamento(tipo, id) {
    const item = tipo === 'feriado' 
        ? window.feriadosLocais.find(f => (f.Id === id || f.id === id))
        : window.ausencias.find(a => (a.id || a.Id) === id);
    
    if (!item) return;
    
    const nome = tipo === 'feriado' 
        ? (item.Nome || item.nome)
        : (window.colaboradores.find(c => c.Id === (item.colaboradorId || item.ColaboradorId))?.Nome || 'Desconhecido');
    
    document.getElementById("confirmacaoInfo").innerText = nome;
    window.exclusaoPendenteId = id;
    window.exclusaoTipo = tipo === 'feriado' ? 'feriado' : 'ausencia';
    
    document.getElementById("modalConfirmacao").classList.remove("hidden");
    document.getElementById("modalConfirmacao").classList.add("active");
}



// ================= CONFIGURAR BOTÕES DO FORMULÁRIO =================
function configurarBotoesFormulario() {
    console.log("Configurando botões do formulário");
    
    const salvarBtn = document.getElementById("salvarLancamentoBtn");
    const cancelarBtn = document.getElementById("cancelarEdicaoLancamentoBtn");
    
    if (salvarBtn) {
        // Remover eventos anteriores clonando
        const newSalvarBtn = salvarBtn.cloneNode(true);
        salvarBtn.parentNode.replaceChild(newSalvarBtn, salvarBtn);
        
        newSalvarBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Botão salvar clicado");
            salvarLancamento();
        });
    }
    
    if (cancelarBtn) {
        const newCancelarBtn = cancelarBtn.cloneNode(true);
        cancelarBtn.parentNode.replaceChild(newCancelarBtn, cancelarBtn);
        
        newCancelarBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Botão cancelar clicado");
            cancelarEdicaoLancamento();
        });
    }
}

// ================= MOSTRAR TOAST =================
function mostrarToast(mensagem, tipo = "success") {
    console.log(`Toast: ${mensagem} (${tipo})`);
    
    const container = document.getElementById("toastContainer");
    if (!container) {
        alert(mensagem); // Fallback se não tiver toast container
        return;
    }
    
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

// Exportar globalmente se necessário
window.mostrarToast = mostrarToast;

// ================= CANCELAR EDIÇÃO =================
function cancelarEdicaoLancamento() {
    resetarFormularioLancamento();
}

// ================= FECHAR MODAL =================
function fecharModalLancamento() {
    const modal = document.getElementById("modalLancamento");
    if (modal) {
        modal.classList.add("hidden");
        modal.classList.remove("active");
        resetarFormularioLancamento();
    }
}
// Adicione esta função no lancamentos.js
// ================= CARREGAR DADOS USANDO API =================
async function carregarColaboradores() {
    try {
        const data = await API.getColaboradores();
        colaboradores = Array.isArray(data) ? data : [];
        window.colaboradores = colaboradores;
        console.log(`Colaboradores carregados: ${colaboradores.length}`);
        return colaboradores;
    } catch (error) {
        console.error("Erro ao carregar colaboradores:", error);
        colaboradores = [];
        window.colaboradores = [];
        return [];
    }
}

async function carregarAusencias() {
    try {
        const data = await API.getAusencias();
        ausencias = Array.isArray(data) ? data : [];
        window.ausencias = ausencias;
        console.log(`Ausências carregadas: ${ausencias.length}`);
        return ausencias;
    } catch (error) {
        console.error("Erro ao carregar ausências:", error);
        ausencias = [];
        window.ausencias = [];
        return [];
    }
}

// ================= CARREGAR FERIADOS LOCAIS =================
async function carregarFeriadosLocais() {
    console.log("=== CARREGANDO FERIADOS LOCAIS ===");
    
    try {
        // Usar a API para buscar feriados
        const data = await window.API.getFeriados();
        console.log("Feriados recebidos:", data);
        
        feriadosLocais = Array.isArray(data) ? data : [];
        window.feriadosLocais = feriadosLocais;
        
        console.log(`Feriados carregados: ${feriadosLocais.length}`);
        return feriadosLocais;
        
    } catch (error) {
        console.error("Erro ao carregar feriados locais:", error);
        
        // Tentar carregar do localStorage como fallback
        try {
            const feriadosSalvos = localStorage.getItem('feriadosLocais');
            if (feriadosSalvos) {
                feriadosLocais = JSON.parse(feriadosSalvos);
                console.log(`Feriados recuperados do localStorage: ${feriadosLocais.length}`);
            } else {
                feriadosLocais = [];
            }
        } catch (e) {
            console.error("Erro ao recuperar do localStorage:", e);
            feriadosLocais = [];
        }
        
        window.feriadosLocais = feriadosLocais;
        return feriadosLocais;
    }
}


// ================= DEBUG: VERIFICAR FERIADOS =================
async function debugFeriados() {
    console.log("=== DEBUG FERIADOS ===");
    console.log("window.feriadosLocais:", window.feriadosLocais);
    console.log("mesAtual:", window.mesAtual);
    console.log("anoAtual:", window.anoAtual);
    
    // Buscar direto da API
    try {
        const data = await window.API.getFeriados();
        console.log("Feriados da API:", data);
    } catch (error) {
        console.error("Erro ao buscar feriados da API:", error);
    }
}


function normalizarData(data) {
    if (!data) return null;

    const d = new Date(data);
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');

    return `${ano}-${mes}-${dia}`;
}
async function carregarFeriadosLocais() {
    try {
        const feriados = await API.getFeriados();
        window.feriadosLocais = feriados || [];

        if (typeof gerarCalendario === "function") {
            gerarCalendario(mesAtual, anoAtual);
        }

    } catch (error) {
        console.error("Erro ao carregar feriados locais:", error);
    }
}
window.debugFeriados = debugFeriados;

// ================= EXPORTAR FUNÇÕES =================
window.abrirModalLancamento = abrirModalLancamento;
window.editarLancamento = editarLancamento;
window.excluirLancamento = excluirLancamento;
window.salvarLancamento = salvarLancamento;
window.cancelarEdicaoLancamento = cancelarEdicaoLancamento;
window.fecharModalLancamento = fecharModalLancamento;