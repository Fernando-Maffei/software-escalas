
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


// lancamentos.js - Deve estar no início do arquivo

function formatarHoraParaExibicao(hora) {
    if (!hora) return '';
    
    try {
        let horaStr = String(hora);
        
        // Se vier no formato ISO (ex: 2025-03-06T13:00:00.000Z)
        if (horaStr.includes('T')) {
            const data = new Date(horaStr);
            if (!isNaN(data.getTime())) {
                const horas = data.getHours().toString().padStart(2, '0');
                const minutos = data.getMinutes().toString().padStart(2, '0');
                return `${horas}:${minutos}`;
            }
            
            // Fallback: extrair direto da string
            const match = horaStr.match(/T(\d{2}:\d{2})/);
            if (match) return match[1];
        }
        
        // Se já estiver no formato HH:mm:ss
        if (horaStr.includes(':')) {
            return horaStr.substring(0, 5);
        }
        
        return horaStr;
    } catch (e) {
        console.error("Erro ao formatar hora:", e);
        return '';
    }
}

async function carregarListaPessoal() {
    console.log("Carregando lista pessoal...");
    
    const container = document.getElementById("listaPessoal");
    if (!container) {
        console.error("Container listaPessoal não encontrado!");
        return;
    }
    
    // Mostrar loading
    const loadingEl = document.getElementById("loadingLancamentos");
    if (loadingEl) loadingEl.classList.remove("hidden");
    
    container.innerHTML = '';
    
    try {
        // Garantir que as ausências estão carregadas
        if (typeof carregarAusencias === 'function') {
            await carregarAusencias();
        }
        
        if (!window.ausencias || window.ausencias.length === 0) {
            if (loadingEl) loadingEl.classList.add("hidden");
            container.innerHTML = '<div class="empty-state">Nenhum lançamento encontrado</div>';
            return;
        }
        
        // Pegar mês e ano atuais
        const mesAtual = window.mesAtual !== undefined ? window.mesAtual : new Date().getMonth();
        const anoAtual = window.anoAtual !== undefined ? window.anoAtual : new Date().getFullYear();
        
        console.log(`Filtrando lançamentos para ${mesAtual+1}/${anoAtual}`);
        
        // Filtrar ausências do mês atual
        const ausenciasFiltradas = window.ausencias.filter(a => {
            if (!a.DataInicio || !a.DataFim) return false;
            
            const dataInicio = new Date(a.DataInicio);
            const dataFim = new Date(a.DataFim);
            
            const primeiroDiaMes = new Date(anoAtual, mesAtual, 1);
            const ultimoDiaMes = new Date(anoAtual, mesAtual + 1, 0);
            
            return dataFim >= primeiroDiaMes && dataInicio <= ultimoDiaMes;
        });
        
        console.log(`Ausências filtradas: ${ausenciasFiltradas.length} de ${window.ausencias.length}`);
        
        if (loadingEl) loadingEl.classList.add("hidden");
        
        if (ausenciasFiltradas.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum lançamento neste mês</div>';
            return;
        }
        
        // Ordenar por data (mais recente primeiro)
        ausenciasFiltradas.sort((a, b) => new Date(b.DataInicio) - new Date(a.DataInicio));
        
        let html = '';
        
        ausenciasFiltradas.forEach(a => {
            const colaborador = window.colaboradores?.find(c => c.Id === (a.colaboradorId || a.ColaboradorId));
            const tipo = (a.tipo || a.Tipo || '').toLowerCase();
            const periodoTipo = a.periodoTipo || 'dia_inteiro';
            
            // Definir ícone e cor baseado no tipo
            let icone = '📅';
            let classe = '';
            let texto = tipo;
            let cor = '#6366f1';
            
            if (tipo === 'folga') {
                icone = '🌸';
                classe = 'folga';
                texto = 'Folga';
                cor = '#10b981';
            } else if (tipo === 'ausencia') {
                icone = '⚠️';
                classe = 'ausencia';
                texto = 'Ausência';
                cor = '#ef4444';
            } else if (tipo === 'ferias') {
                icone = '🏖️';
                classe = 'ferias';
                texto = 'Férias';
                cor = '#3b82f6';
            }
            
            // Formatar datas
            const dataInicio = new Date(a.DataInicio);
            const dataFim = new Date(a.DataFim);
            
            const dataInicioStr = dataInicio.toLocaleDateString('pt-BR');
            const dataFimStr = dataFim.toLocaleDateString('pt-BR');
            
            // ===== NOVO CÁLCULO DE DURAÇÃO =====
            let duracao = '';
            if (periodoTipo === 'horas' && (a.horaInicio || a.HoraInicio) && (a.horaFim || a.HoraFim)) {
                const horaInicioRaw = a.horaInicio || a.HoraInicio;
                const horaFimRaw = a.horaFim || a.HoraFim;
                
                const horaInicioStr = formatarHoraParaExibicao(horaInicioRaw);
                const horaFimStr = formatarHoraParaExibicao(horaFimRaw);
                
                if (horaInicioStr && horaFimStr) {
                    const [hInicio, mInicio] = horaInicioStr.split(':').map(Number);
                    const [hFim, mFim] = horaFimStr.split(':').map(Number);
                    
                    const minutosInicio = hInicio * 60 + (mInicio || 0);
                    const minutosFim = hFim * 60 + (mFim || 0);
                    
                    const diffMinutos = minutosFim - minutosInicio;
                    const horas = Math.floor(diffMinutos / 60);
                    const minutos = diffMinutos % 60;
                    
                    if (horas > 0 && minutos > 0) {
                        duracao = `${horas}h${minutos}m`;
                    } else if (horas > 0) {
                        duracao = `${horas}h`;
                    } else {
                        duracao = `${minutos}min`;
                    }
                } else {
                    duracao = 'Horário inválido';
                }
            } else {
                const diffTime = Math.abs(dataFim - dataInicio);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                duracao = diffDays === 1 ? '1 dia' : `${diffDays} dias`;
            }
            
            // ===== NOVA FORMATAÇÃO DE HORÁRIO =====
            let infoHorario = '';
            if (periodoTipo === 'horas' && (a.horaInicio || a.HoraInicio) && (a.horaFim || a.HoraFim)) {
                const horaInicioRaw = a.horaInicio || a.HoraInicio;
                const horaFimRaw = a.horaFim || a.HoraFim;
                
                const horaInicioFormatada = formatarHoraParaExibicao(horaInicioRaw);
                const horaFimFormatada = formatarHoraParaExibicao(horaFimRaw);
                
                if (horaInicioFormatada && horaFimFormatada) {
                    infoHorario = `<span class="info-horario"><i class="fas fa-clock"></i> ${horaInicioFormatada} - ${horaFimFormatada}</span>`;
                } else {
                    infoHorario = `<span class="info-horario"><i class="fas fa-clock"></i> Horário não especificado</span>`;
                }
            } else {
                infoHorario = `<span class="info-horario"><i class="fas fa-sun"></i> Dia inteiro</span>`;
            }
            
            const id = a.id || a.Id;
            
            html += `
                <div class="lancamento-card pessoal" data-id="${id}" style="border-left-color: ${cor};">
                    <div class="lancamento-header">
                        <div class="lancamento-titulo">
                            <i class="fas fa-user-circle" style="color: ${cor};"></i>
                            <span><strong>${colaborador?.Nome || 'Desconhecido'}</strong></span>
                        </div>
                        <span class="lancamento-badge ${classe}" style="background: ${cor}20; color: ${cor}; border-color: ${cor}40;">
                            ${icone} ${texto}
                        </span>
                    </div>
                    
                    <div class="lancamento-info-grid">
                        <div class="info-item">
                            <i class="fas fa-calendar-alt" style="color: ${cor};"></i>
                            <div class="info-detalhes">
                                <span class="info-label">Período</span>
                                <span class="info-valor">${dataInicioStr} - ${dataFimStr}</span>
                            </div>
                        </div>
                        
                        <div class="info-item">
                            <i class="fas fa-hourglass-half" style="color: ${cor};"></i>
                            <div class="info-detalhes">
                                <span class="info-label">Duração</span>
                                <span class="info-valor">${duracao}</span>
                            </div>
                        </div>
                        
                        <div class="info-item">
                            <i class="fas fa-clock" style="color: ${cor};"></i>
                            <div class="info-detalhes">
                                <span class="info-label">Horário</span>
                                <span class="info-valor">${infoHorario}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="lancamento-actions">
                        <button onclick="editarLancamento('pessoal', ${id})" class="btn-icon-sm edit" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="excluirLancamento('pessoal', ${id})" class="btn-icon-sm delete" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        console.log("✅ Lista pessoal renderizada com sucesso!");
        
    } catch (error) {
        console.error("❌ Erro ao carregar lista pessoal:", error);
        if (loadingEl) loadingEl.classList.add("hidden");
        container.innerHTML = '<div class="empty-state">Erro ao carregar dados</div>';
    }
}

// lancamentos.js - Função carregarListaFeriados CORRIGIDA

// lancamentos.js - Função carregarListaFeriados DEFINITIVA

async function carregarListaFeriados() {
    console.log("=== CARREGANDO FERIADOS (API + MANUAIS) ===");
    
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
        // ===== IMPORTANTE: window.mesAtual já é 0-11 (Janeiro=0, Dezembro=11) =====
        const mesAtual = window.mesAtual !== undefined ? window.mesAtual : new Date().getMonth();
        const anoAtual = window.anoAtual !== undefined ? window.anoAtual : new Date().getFullYear();
        
        // Para exibição, mostramos mes+1
        console.log(`📅 Filtrando feriados para mês ${mesAtual} (que é ${mesAtual+1}/${anoAtual})`);
        
        // ===== 1. BUSCAR FERIADOS DA API =====
        console.log(`📡 Buscando feriados da API para ${anoAtual}...`);
        let feriadosAPI = [];
        
        try {
            const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${anoAtual}`);
            if (response.ok) {
                feriadosAPI = await response.json();
                console.log(`✅ API retornou ${feriadosAPI.length} feriados`);
            }
        } catch (e) {
            console.error("❌ Erro ao chamar API:", e);
        }
        
        // ===== 2. BUSCAR FERIADOS MANUAIS =====
        console.log("📝 Buscando feriados manuais...");
        let feriadosManuais = [];
        
        try {
            feriadosManuais = await window.API.getFeriados();
            console.log(`✅ Manuais: ${feriadosManuais.length} feriados`);
        } catch (e) {
            console.error("❌ Erro ao buscar manuais:", e);
        }
        
        // ===== 3. COMBINAR TODOS OS FERIADOS =====
        const todosFeriados = [];
        
        // Adicionar feriados da API (com mês em JavaScript: 0-11)
        feriadosAPI.forEach(f => {
            const data = new Date(f.date + 'T12:00:00'); // Forçar meio-dia para evitar problemas de fuso
            todosFeriados.push({
                id: `api-${f.date}`,
                nome: f.name,
                data: data,
                dataStr: f.date,
                tipo: f.type || 'federal',
                origem: 'api',
                icone: '🇧🇷',
                cor: '#2563eb',
                mes: data.getMonth(), // 0-11
                ano: data.getFullYear()
            });
        });
        
        // Adicionar feriados manuais
        feriadosManuais.forEach(f => {
            const dataFeriado = f.Data || f.data;
            if (!dataFeriado) return;
            
            const data = new Date(dataFeriado + 'T12:00:00');
            
            todosFeriados.push({
                id: f.Id || f.id,
                nome: f.Nome || f.nome || 'Feriado',
                data: data,
                dataStr: dataFeriado,
                tipo: f.Tipo || f.tipo || 'municipal',
                origem: 'manual',
                icone: '📝',
                cor: '#f59e0b',
                mes: data.getMonth(), // 0-11
                ano: data.getFullYear()
            });
        });
        
        console.log(`📊 Total de feriados: ${todosFeriados.length}`);
        
        // Atualizar variável global (apenas manuais)
        window.feriadosLocais = feriadosManuais || [];
        
        if (loadingEl) loadingEl.classList.add("hidden");
        
        if (todosFeriados.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum feriado encontrado</div>';
            return;
        }
        
        // ===== 4. FILTRAR APENAS OS DO MÊS ATUAL =====
        // IMPORTANTE: Comparar mesAtual (que já é 0-11) com data.getMonth() (que também é 0-11)
        const feriadosDoMes = todosFeriados.filter(f => {
            return f.mes === mesAtual && f.ano === anoAtual;
        });
        
        console.log(`✅ Feriados do mês ${mesAtual} (${mesAtual+1}/${anoAtual}): ${feriadosDoMes.length}`);
        console.log("📋 Lista:", feriadosDoMes.map(f => `${f.nome} - ${f.data.toLocaleDateString('pt-BR')}`));
        
        if (feriadosDoMes.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum feriado neste mês</div>';
            return;
        }
        
        // ===== 5. ORDENAR POR DATA =====
        feriadosDoMes.sort((a, b) => a.data - b.data);
        
        // ===== 6. GERAR HTML =====
        let html = '';
        
        feriadosDoMes.forEach(f => {
            const dataFormatada = f.data.toLocaleDateString('pt-BR');
            
            const isManual = f.origem === 'manual';
            const cor = f.cor;
            const bgCor = isManual ? '#f59e0b20' : '#2563eb20';
            
            html += `
                <div class="lancamento-card" style="border-left: 4px solid ${cor}; margin-bottom: 10px;">
                    <div class="lancamento-header">
                        <div class="lancamento-titulo">
                            <i class="fas ${isManual ? 'fa-city' : 'fa-globe'}" style="color: ${cor};"></i>
                            <span><strong>${f.nome}</strong></span>
                        </div>
                        <span class="lancamento-badge" style="background: ${bgCor}; color: ${cor};">
                            ${f.icone} ${isManual ? f.tipo : 'Federal'}
                        </span>
                    </div>
                    
                    <div style="display: flex; gap: 12px; margin: 8px 0; padding: 8px; background: var(--card-dark); border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-calendar-alt" style="color: ${cor};"></i>
                            <span>${dataFormatada}</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 8px; justify-content: flex-end; padding-top: 8px; border-top: 1px dashed var(--border);">
                        ${isManual ? `
                            <button onclick="editarLancamento('feriado', '${f.id}')" class="btn-icon-sm edit" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="excluirLancamento('feriado', '${f.id}')" class="btn-icon-sm delete" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : `
                            <span style="background: #e2e8f0; color: #64748b; padding: 4px 12px; border-radius: 16px; font-size: 11px;">
                                <i class="fas fa-lock"></i> Feriado oficial
                            </span>
                        `}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        console.log("✅ Lista de feriados renderizada!");
        
    } catch (error) {
        console.error("❌ Erro geral:", error);
        if (loadingEl) loadingEl.classList.add("hidden");
        container.innerHTML = `<div class="empty-state">Erro: ${error.message}</div>`;
    }
}


// Diagnóstico de feriados
async function diagnosticarFeriados() {
    console.log("🔍 DIAGNÓSTICO DE FERIADOS");
    
    const ano = window.anoAtual || new Date().getFullYear();
    const mes = window.mesAtual || new Date().getMonth();
    
    console.log("📅 Mês atual:", mes + 1, "Ano:", ano);
    
    // Testar API
    try {
        const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
        const data = await response.json();
        console.log("✅ API respondeu:", data.length, "feriados");
        console.log("📋 Feriados da API:", data);
    } catch (e) {
        console.error("❌ API falhou:", e);
    }
    
    // Testar manuais
    console.log("📝 Feriados manuais:", window.feriadosLocais);
}

diagnosticarFeriados();

// ================= EDITAR LANÇAMENTO =================

function editarLancamento(tipo, id) {
    if (tipo === 'feriado') {
        if (id && id.toString().startsWith('api-')) {
            mostrarToast("Feriados nacionais não podem ser editados", "warning");
            return;
        }
        
        const item = window.feriadosLocais.find(f => (f.Id === id || f.id === id));
        if (!item) {
            mostrarToast("Feriado não encontrado", "error");
            return;
        }
        
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
        
        console.log("✏️ Editando lançamento pessoal:", item);
        
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
        
        // Preencher período
        const periodoTipo = item.periodoTipo || item.PeriodoTipo || 'dia_inteiro';
        document.getElementById("periodoTipo").value = periodoTipo;
        document.getElementById("periodoTipo").dispatchEvent(new Event('change'));
        
        // ===== CORREÇÃO AQUI: Usar a MESMA função dos cards =====
        if (periodoTipo === 'horas') {
            // Extrair horas usando a função que já funciona nos cards
            const horaInicioFormatada = formatarHoraParaExibicao(item.horaInicio || item.HoraInicio);
            const horaFimFormatada = formatarHoraParaExibicao(item.horaFim || item.HoraFim);
            
            console.log("⏰ Horas para edição (corrigidas):", { 
                horaInicioFormatada, 
                horaFimFormatada 
            });
            
            document.getElementById("horaInicio").value = horaInicioFormatada;
            document.getElementById("horaFim").value = horaFimFormatada;
        }
        
        editandoLancamentoId = id;
        editandoTipoLancamento = 'pessoal';
        document.getElementById("salvarLancamentoBtn").innerHTML = '<i class="fas fa-check"></i> Atualizar';
        document.getElementById("cancelarEdicaoLancamentoBtn").classList.remove("hidden");
        document.getElementById("formTitulo").innerHTML = '<i class="fas fa-pen"></i> Editar Lançamento';
    }
}

// ================= SALVAR LANÇAMENTO =================
async function salvarLancamento() {
    console.log("=== SALVANDO LANÇAMENTO ===");
    
    const tipo = document.getElementById("tipoLancamento").value;
    const dataInicio = document.getElementById("dataInicio").value;
    const dataFim = document.getElementById("dataFim").value;
    
    if (!dataInicio || !dataFim) {
        mostrarToast("Preencha as datas", "error");
        return;
    }
    
    if (dataFim < dataInicio) {
        mostrarToast("Data fim deve ser maior ou igual à data início", "error");
        return;
    }
    
    try {
        let resultado;
        
        if (tipo === 'feriado') {
            resultado = await salvarFeriado();
        } else {
            resultado = await salvarAusencia(tipo, dataInicio, dataFim);
        }
        
        console.log("✅ Salvo com sucesso:", resultado);
        
        // 🔥 IMPORTANTE: Recarregar todos os dados
        await Promise.all([
            carregarColaboradores(),
            carregarAusencias(),
            carregarFeriadosLocais()
        ]);
        
        // 🔥 Recarregar as listagens do modal
        await carregarListagens();
        
        // 🔥 Atualizar o calendário se estiver visível
        if (document.getElementById("calendar") && typeof gerarCalendario === 'function') {
            gerarCalendario(window.mesAtual || new Date().getMonth(), 
                           window.anoAtual || new Date().getFullYear());
        }
        
        // 🔥 Se estiver no dashboard, atualizar também
        if (typeof renderDashboard === 'function' && 
            window.location.hash === '#dashboard') {
            renderDashboard();
        }
        
        mostrarToast("Salvo com sucesso!", "success");
        
        // 🔥 Resetar o formulário APÓS recarregar tudo
        resetarFormularioLancamento();
        
        // 🔥 Fechar o modo de edição se estiver aberto
        if (editandoTipoLancamento) {
            cancelarEdicaoLancamento();
        }
        
    } catch (error) {
        console.error("❌ Erro ao salvar:", error);
        mostrarToast(`Erro: ${error.message}`, "error");
    }
}

// ================= EXCLUIR LANÇAMENTO =================
function excluirLancamento(tipo, id) {
     if (tipo === 'feriado' && id && id.toString().startsWith('api-')) {
        mostrarToast("Feriados nacionais não podem ser excluídos", "warning");
        return;
    }
    
    console.log("🗑️ Excluindo lançamento:", { tipo, id });
    
    const item = tipo === 'feriado' 
        ? window.feriadosLocais?.find(f => (f.Id === id || f.id === id))
        : window.ausencias?.find(a => (a.id || a.Id) === id);
    
    if (!item) {
        console.error("Item não encontrado!");
        mostrarToast("Item não encontrado", "error");
        return;
    }
    
    // Pegar nome para mostrar na confirmação
    let nome = '';
    if (tipo === 'feriado') {
        nome = item.Nome || item.nome || 'Feriado';
    } else {
        const colaborador = window.colaboradores?.find(c => c.Id === (item.colaboradorId || item.ColaboradorId));
        nome = colaborador?.Nome || 'Desconhecido';
    }
    
    // Salvar nos locais CORRETOS que o app.js espera
    window.exclusaoPendenteId = id;
    window.exclusaoTipo = tipo; // 'feriado' ou 'ausencia'
    
    // Mostrar informações no modal
    const infoEl = document.getElementById("confirmacaoInfo");
    if (infoEl) {
        const dataInfo = item.DataInicio || item.dataInicio || item.Data || item.data;
        const dataStr = dataInfo ? new Date(dataInfo).toLocaleDateString('pt-BR') : '';
        infoEl.innerText = `${nome} - ${dataStr}`;
    }
    
    // Abrir modal de confirmação
    const modal = document.getElementById("modalConfirmacao");
    if (modal) {
        modal.classList.remove("hidden");
        modal.classList.add("active");
    } else {
        console.error("Modal de confirmação não encontrado!");
    }
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

// Adicione esta função no lancamentos.js

function formatarHoraParaAPI(hora) {
    if (!hora) return null;
    // Se já tiver no formato HH:mm (ex: 10:00), adiciona :00
    if (hora.length === 5 && hora.includes(':')) {
        return hora + ':00';
    }
    return hora;
}

// E na função salvarAusencia, use assim:
if (periodoTipo === 'horas') {
    dados.horaInicio = formatarHoraParaAPI(horaInicio);
    dados.horaFim = formatarHoraParaAPI(horaFim);
}


// ================= EXPORTAR FUNÇÕES =================
window.abrirModalLancamento = abrirModalLancamento;
window.editarLancamento = editarLancamento;
window.excluirLancamento = excluirLancamento;
window.salvarLancamento = salvarLancamento;
window.cancelarEdicaoLancamento = cancelarEdicaoLancamento;
window.fecharModalLancamento = fecharModalLancamento;
window.debugFeriados = debugFeriados;