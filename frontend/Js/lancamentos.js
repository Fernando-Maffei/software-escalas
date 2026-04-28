
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

function inicializarLancamentosUmaVez() {
    if (window.__lancamentosBootstrapDone) {
        return;
    }

    window.__lancamentosBootstrapDone = true;
    console.log("Inicializando eventos das abas no DOMContentLoaded");

    setTimeout(() => {
        configurarEventosAbas();
        configurarAbas();
    }, 500);
}

// Garantir que os eventos são configurados quando a página carrega
document.addEventListener('DOMContentLoaded', function() {
    inicializarLancamentosUmaVez();
    return;
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
function abrirModalLancamento(tipo = 'pessoal', dataISO = null, filtrarPorData = true) {
    console.log("Abrindo modal de lançamento...", tipo, dataISO, "Filtrar por data:", filtrarPorData);
    
    const modal = document.getElementById("modalLancamento");
    if (!modal) return;
    
    // 🔥 CONFIGURAR EVENTOS
    configurarEventosAbas();
    configurarBotoesFormulario();
    
    // Resetar formulário
    resetarFormularioLancamento();
    
    // Guardar o modo de filtro
    window.modalFiltroData = filtrarPorData;
    window.modalDataSelecionada = dataISO;
    
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
    
    // 🔥 REMOVER O BOTÃO DE TOGGLE (não precisa mais)
    const botaoAntigo = document.getElementById('toggleFiltroBtn');
    if (botaoAntigo) botaoAntigo.remove();
    
    // Carregar dados com o filtro apropriado
    carregarColaboradoresNoSelect();
    
    if (filtrarPorData && dataISO) {
        // Se clicou no dia, carrega apenas os lançamentos daquele dia
        carregarListagensPorDia(dataISO);
    } else {
        // Se clicou no botão, carrega todos os lançamentos do mês
        carregarListagens();
    }
    
    // Se tiver data, preencher o formulário com ela (apenas como sugestão)
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


// ================= CARREGAR LISTAGENS POR DIA =================
async function carregarListagensPorDia(dataISO) {
    const loadingEl = document.getElementById("loadingLancamentos");
    const emptyEl = document.getElementById("emptyLancamentos");
    
    loadingEl.classList.remove("hidden");
    emptyEl.classList.add("hidden");
    
    try {
        await Promise.all([
            carregarListaPessoalPorDia(dataISO),
            carregarListaFeriadosPorDia(dataISO)
        ]);
        
        loadingEl.classList.add("hidden");
        
        // Verificar se as listas estão vazias
        const listaPessoal = document.getElementById("listaPessoal");
        const listaFeriados = document.getElementById("listaFeriados");
        
        if ((!listaPessoal.children || listaPessoal.children.length === 0) && 
            (!listaFeriados.children || listaFeriados.children.length === 0)) {
            emptyEl.classList.remove("hidden");
            emptyEl.innerHTML = `
                <i class="fas fa-calendar-times"></i>
                <p>Nenhum lançamento neste dia</p>
                <small>Clique em "Novo Lançamento" para adicionar</small>
            `;
        }
        
    } catch (error) {
        console.error("Erro ao carregar listagens:", error);
        loadingEl.classList.add("hidden");
        emptyEl.classList.remove("hidden");
        emptyEl.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>
            <p style="color: var(--danger);">Erro ao carregar dados</p>
            <button onclick="carregarListagensPorDia('${dataISO}')" class="btn-primary">
                <i class="fas fa-sync"></i> Tentar novamente
            </button>
        `;
    }
}

// Função para adicionar botão de toggle de filtro
function adicionarToggleFiltro(dataISO) {
    const header = document.querySelector('#modalLancamento .modal-header h3');
    if (!header || !dataISO) return;
    
    // Remover botão antigo se existir
    const botaoAntigo = document.getElementById('toggleFiltroBtn');
    if (botaoAntigo) botaoAntigo.remove();
    
    // Criar botão de toggle
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggleFiltroBtn';
    toggleBtn.className = 'btn-toggle-filtro';
    toggleBtn.innerHTML = window.modalFiltroData ? 
        '<i class="fas fa-calendar-day"></i> Apenas este dia' : 
        '<i class="fas fa-calendar-alt"></i> Mês todo';
    
    toggleBtn.onclick = function() {
        window.modalFiltroData = !window.modalFiltroData;
        this.innerHTML = window.modalFiltroData ? 
            '<i class="fas fa-calendar-day"></i> Apenas este dia' : 
            '<i class="fas fa-calendar-alt"></i> Mês todo';
        
        // Recarregar listagens com o novo filtro
        carregarListagensComFiltro(window.modalDataSelecionada, window.modalFiltroData);
    };
    
    // Adicionar ao lado do título
    header.parentNode.insertBefore(toggleBtn, header.nextSibling);
}

// Função para carregar listagens com filtro
async function carregarListagensComFiltro(dataISO, filtrarPorData) {
    const loadingEl = document.getElementById("loadingLancamentos");
    const emptyEl = document.getElementById("emptyLancamentos");
    
    loadingEl.classList.remove("hidden");
    emptyEl.classList.add("hidden");
    
    try {
        if (filtrarPorData && dataISO) {
            // Filtrar apenas pelo dia selecionado
            await Promise.all([
                carregarListaPessoalPorDia(dataISO),
                carregarListaFeriadosPorDia(dataISO)
            ]);
        } else {
            // Carregar do mês todo
            await Promise.all([
                carregarListaPessoal(),
                carregarListaFeriados()
            ]);
        }
        
        loadingEl.classList.add("hidden");
        
        // Verificar se as listas estão vazias
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

function formatarDataParaExibicao(dataStr) {
    if (!dataStr) return 'Data inválida';
    
    // Se vier no formato ISO (2026-03-17T00:00:00.000Z)
    if (dataStr.includes('T')) {
        const [dataPart] = dataStr.split('T');
        const [ano, mes, dia] = dataPart.split('-');
        return `${dia}/${mes}/${ano}`;
    }
    
    // Se já vier no formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
        const [ano, mes, dia] = dataStr.split('-');
        return `${dia}/${mes}/${ano}`;
    }
    
    // Fallback: retorna a string original
    return dataStr;
}

async function carregarListaPessoalPorDia(dataISO) {
    console.log("Carregando lista pessoal para o dia:", dataISO);
    
    const container = document.getElementById("listaPessoal");
    if (!container) return;
    
    const loadingEl = document.getElementById("loadingLancamentos");
    container.innerHTML = '';
    
    try {
        if (!window.ausencias || window.ausencias.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum lançamento neste dia</div>';
            return;
        }
        
        // Filtrar ausências que incluem este dia
        const dataAlvoStr = dataISO.split('T')[0];
        const ausenciasDoDia = window.ausencias.filter(a => {
            if (!a.DataInicio || !a.DataFim) return false;
            
            const dataInicioStr = (a.DataInicio || '').split('T')[0];
            const dataFimStr = (a.DataFim || '').split('T')[0];
            
            return dataAlvoStr >= dataInicioStr && dataAlvoStr <= dataFimStr;
        });
        
        if (ausenciasDoDia.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum lançamento neste dia</div>';
            return;
        }
        
        // Ordenar
        ausenciasDoDia.sort((a, b) => new Date(b.DataInicio) - new Date(a.DataInicio));
        
        // Renderizar cards
        let html = '';
        ausenciasDoDia.forEach(a => {
            const colaborador = window.colaboradores?.find(c => c.Id === (a.colaboradorId || a.ColaboradorId));
            const tipo = (a.tipo || a.Tipo || '').toLowerCase();
            
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
            
            // 🔥 FORMATAR DATAS CORRETAMENTE
            const dataInicioStr = formatarDataParaExibicao(a.DataInicio || a.dataInicio);
            const dataFimStr = formatarDataParaExibicao(a.DataFim || a.dataFim);
            
            html += `
                <div class="lancamento-card pessoal" data-id="${a.id || a.Id}" style="border-left-color: ${cor};">
                    <div class="lancamento-header">
                        <div class="lancamento-titulo">
                            <i class="fas fa-user-circle" style="color: ${cor};"></i>
                            <span><strong>${colaborador?.Nome || 'Desconhecido'}</strong></span>
                        </div>
                        <span class="lancamento-badge ${classe}" style="background: ${cor}20; color: ${cor};">
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
                    </div>
                    
                    <div class="lancamento-actions">
                        <button onclick="editarLancamento('pessoal', ${a.id || a.Id})" class="btn-icon-sm edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="excluirLancamento('pessoal', ${a.id || a.Id})" class="btn-icon-sm delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error("Erro:", error);
        container.innerHTML = '<div class="empty-state">Erro ao carregar</div>';
    }
}

// Função para carregar feriados filtrados por dia
async function carregarListaFeriadosPorDia(dataISO) {
    console.log("Carregando feriados para o dia:", dataISO);
    
    const container = document.getElementById("listaFeriados");
    if (!container) return;
    
    container.innerHTML = '';
    
    try {
        const dataAlvo = dataISO.split('T')[0];
        const feriadosDoDia = [];
        
        // Feriados da API
        if (window.feriados) {
            window.feriados.forEach(f => {
                if (f.date === dataAlvo) {
                    feriadosDoDia.push({
                        id: `api-${f.date}`,
                        nome: f.name,
                        data: f.date,
                        tipo: 'federal',
                        origem: 'api',
                        icone: '🇧🇷',
                        cor: '#2563eb'
                    });
                }
            });
        }
        
        // Feriados manuais
        if (window.feriadosLocais) {
            window.feriadosLocais.forEach(f => {
                const dataFeriado = (f.Data || f.data || '').split('T')[0];
                if (dataFeriado === dataAlvo) {
                    feriadosDoDia.push({
                        id: f.Id || f.id,
                        nome: f.Nome || f.nome || 'Feriado',
                        data: dataFeriado,
                        tipo: f.Tipo || f.tipo || 'municipal',
                        origem: 'manual',
                        icone: '📝',
                        cor: '#f59e0b'
                    });
                }
            });
        }
        
        if (feriadosDoDia.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum feriado neste dia</div>';
            return;
        }
        
        // Renderizar
        let html = '';
        feriadosDoDia.forEach(f => {
            const dataFormatada = formatarDataBR(f.data);
            const isManual = f.origem === 'manual';
            
            html += `
                <div class="lancamento-card" style="border-left: 4px solid ${f.cor};">
                    <div class="lancamento-header">
                        <div class="lancamento-titulo">
                            <i class="fas ${isManual ? 'fa-city' : 'fa-globe'}" style="color: ${f.cor};"></i>
                            <span><strong>${f.nome}</strong></span>
                        </div>
                        <span class="lancamento-badge" style="background: ${f.cor}20; color: ${f.cor};">
                            ${f.icone} ${isManual ? f.tipo : 'Federal'}
                        </span>
                    </div>
                    
                    <div style="display: flex; gap: 12px; margin: 8px 0; padding: 8px; background: var(--card-dark); border-radius: 8px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <i class="fas fa-calendar-alt" style="color: ${f.cor};"></i>
                            <span>${dataFormatada}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error("Erro:", error);
        container.innerHTML = '<div class="empty-state">Erro ao carregar</div>';
    }
}
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


document.addEventListener('DOMContentLoaded', function() {
    inicializarLancamentosUmaVez();
    return;
});

// ================= CONFIGURAÇÃO DAS ABAS =================
function configurarAbas() {
    console.log("Configurando abas...");
    
    const tabPessoal = document.getElementById('tabPessoal');
    const tabFeriados = document.getElementById('tabFeriados');
    
    if (tabPessoal) {
        // Remove eventos antigos
        tabPessoal.replaceWith(tabPessoal.cloneNode(true));
    }
    if (tabFeriados) {
        tabFeriados.replaceWith(tabFeriados.cloneNode(true));
    }
    
    // Pegar os elementos NOVAMENTE (após o clone)
    const newTabPessoal = document.getElementById('tabPessoal');
    const newTabFeriados = document.getElementById('tabFeriados');
    const salvarBtn = document.getElementById('salvarLancamentoBtn');
    
    if (newTabPessoal) {
        newTabPessoal.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("✅ Aba Pessoal clicada");
            
            // Atualizar classes
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
            
            // Mostrar conteúdo pessoal
            const pessoalContainer = document.getElementById('listaPessoalContainer');
            const feriadosContainer = document.getElementById('listaFeriadosContainer');
            
            if (pessoalContainer) pessoalContainer.classList.add('active');
            if (feriadosContainer) feriadosContainer.classList.remove('active');
            
            // Atualizar formulário
            const tipoLancamento = document.getElementById('tipoLancamento');
            if (tipoLancamento) {
                tipoLancamento.value = 'folga';
                tipoLancamento.dispatchEvent(new Event('change'));
            }
            
            // Recarregar listagem
            carregarListaPessoal();
        });
    }
    
    if (newTabFeriados) {
        newTabFeriados.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("✅ Aba Feriados clicada");
            
            // Atualizar classes
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
            
            // Mostrar conteúdo feriados
            const pessoalContainer = document.getElementById('listaPessoalContainer');
            const feriadosContainer = document.getElementById('listaFeriadosContainer');
            
            if (pessoalContainer) pessoalContainer.classList.remove('active');
            if (feriadosContainer) feriadosContainer.classList.add('active');
            
            // Atualizar formulário
            const tipoLancamento = document.getElementById('tipoLancamento');
            if (tipoLancamento) {
                tipoLancamento.value = 'feriado';
                tipoLancamento.dispatchEvent(new Event('change'));
            }
            
            // Recarregar listagem
            carregarListaFeriados();
        });
    }
    
    // Configurar botão salvar
    if (salvarBtn) {
        salvarBtn.replaceWith(salvarBtn.cloneNode(true));
        document.getElementById('salvarLancamentoBtn').addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Botão salvar clicado");
            salvarLancamento();
        });
    }
}

// ================= CONFIGURAR QUANDO O MODAL ABRIR =================
function configurarEventosModal() {
    console.log("Configurando eventos do modal");
    
    // Aguardar um pouco para o modal estar completamente renderizado
    setTimeout(() => {
        configurarAbas();
        
        // Configurar botão de fechar
        const fecharBtn = document.getElementById('fecharModalLancamentoBtn');
        if (fecharBtn) {
            fecharBtn.replaceWith(fecharBtn.cloneNode(true));
            document.getElementById('fecharModalLancamentoBtn').addEventListener('click', function() {
                fecharModalLancamento();
            });
        }
        
        // Configurar select de período
        const periodoTipo = document.getElementById('periodoTipo');
        if (periodoTipo) {
            periodoTipo.replaceWith(periodoTipo.cloneNode(true));
            document.getElementById('periodoTipo').addEventListener('change', function(e) {
                const camposHora = document.getElementById('camposHora');
                if (camposHora) {
                    if (e.target.value === 'horas') {
                        camposHora.classList.remove('hidden');
                    } else {
                        camposHora.classList.add('hidden');
                    }
                }
            });
        }
        
        // Configurar select de tipo
        const tipoLancamento = document.getElementById('tipoLancamento');
        if (tipoLancamento) {
            tipoLancamento.replaceWith(tipoLancamento.cloneNode(true));
            document.getElementById('tipoLancamento').addEventListener('change', function(e) {
                const tipo = e.target.value;
                console.log("Tipo alterado para:", tipo);
                
                document.getElementById("camposPessoal")?.classList.add("hidden");
                document.getElementById("camposFeriado")?.classList.add("hidden");
                document.getElementById("campoNomeFeriado")?.classList.add("hidden");
                document.getElementById("camposHora")?.classList.add("hidden");
                
                if (tipo === 'feriado') {
                    document.getElementById("camposFeriado")?.classList.remove("hidden");
                    document.getElementById("campoNomeFeriado")?.classList.remove("hidden");
                } else {
                    document.getElementById("camposPessoal")?.classList.remove("hidden");
                }
            });
        }
        
    }, 300);
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
        if (hora instanceof Date && !isNaN(hora.getTime())) {
            const isTimeOnlyDate = hora.getUTCFullYear() === 1970
                && hora.getUTCMonth() === 0
                && hora.getUTCDate() === 1;
            const horas = String(isTimeOnlyDate ? hora.getUTCHours() : hora.getHours()).padStart(2, '0');
            const minutos = String(isTimeOnlyDate ? hora.getUTCMinutes() : hora.getMinutes()).padStart(2, '0');
            return `${horas}:${minutos}`;
        }

        const horaStr = String(hora).trim();
        
        // Se vier no formato ISO (ex: 2025-03-06T13:00:00.000Z)
        const matchIso = horaStr.match(/T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?/);
        if (matchIso) return matchIso[1];
        
        // Se já estiver no formato HH:mm:ss
        const matchTime = horaStr.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
        if (matchTime) {
            return matchTime[1];
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
        
        // Filtrar ausências do mês atual - USANDO STRINGS PARA EVITAR FUSO
        const ausenciasFiltradas = window.ausencias.filter(a => {
            if (!a.DataInicio || !a.DataFim) return false;
            
            // Pegar apenas a parte da data (YYYY-MM-DD)
            const dataInicioStr = (a.DataInicio || '').split('T')[0];
            const dataFimStr = (a.DataFim || '').split('T')[0];
            
            if (!dataInicioStr || !dataFimStr) return false;
            
            // Criar datas no formato YYYY-MM-DD para comparação
            const primeiroDiaMesStr = `${anoAtual}-${String(mesAtual+1).padStart(2,'0')}-01`;
            const ultimoDiaMesStr = `${anoAtual}-${String(mesAtual+1).padStart(2,'0')}-${new Date(anoAtual, mesAtual + 1, 0).getDate()}`;
            
            // Comparar strings (funciona porque YYYY-MM-DD é ordenável)
            return dataFimStr >= primeiroDiaMesStr && dataInicioStr <= ultimoDiaMesStr;
        });
        
        console.log(`Ausências filtradas: ${ausenciasFiltradas.length} de ${window.ausencias.length}`);
        
        if (loadingEl) loadingEl.classList.add("hidden");
        
        if (ausenciasFiltradas.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum lançamento neste mês</div>';
            return;
        }
        
        // Ordenar por data (mais recente primeiro) - USANDO STRINGS
        ausenciasFiltradas.sort((a, b) => {
            const dataA = (a.DataInicio || '').split('T')[0];
            const dataB = (b.DataInicio || '').split('T')[0];
            return dataB.localeCompare(dataA);
        });
        
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
            
            // ===== FUNÇÃO SEGURA PARA FORMATAR DATA =====
            function formatarDataBR(dataStr) {
                if (!dataStr) return '??/??/????';
                const dataLimpa = dataStr.split('T')[0];
                if (/^\d{4}-\d{2}-\d{2}$/.test(dataLimpa)) {
                    const [ano, mes, dia] = dataLimpa.split('-');
                    return `${dia}/${mes}/${ano}`;
                }
                return dataStr;
            }
            
            const dataInicioStr = formatarDataParaExibicao(a.DataInicio || a.dataInicio);
            const dataFimStr = formatarDataParaExibicao(a.DataFim || a.dataFim);    
            
            // ===== CÁLCULO DE DURAÇÃO SIMPLIFICADO E SEGURO =====
            let duracao = '';
            if (periodoTipo === 'horas' && (a.horaInicio || a.HoraInicio) && (a.horaFim || a.HoraFim)) {
                // Cálculo para horas (mantido igual)
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
                // CÁLCULO SIMPLIFICADO USANDO STRINGS
                const dataInicioLimpa = (a.DataInicio || a.dataInicio || '').split('T')[0];
                const dataFimLimpa = (a.DataFim || a.dataFim || '').split('T')[0];
                
                if (dataInicioLimpa && dataFimLimpa && /^\d{4}-\d{2}-\d{2}$/.test(dataInicioLimpa) && /^\d{4}-\d{2}-\d{2}$/.test(dataFimLimpa)) {
                    const [anoI, mesI, diaI] = dataInicioLimpa.split('-').map(Number);
                    const [anoF, mesF, diaF] = dataFimLimpa.split('-').map(Number);
                    
                    // Criar datas UTC para evitar fuso
                    const dataInicioUTC = Date.UTC(anoI, mesI - 1, diaI);
                    const dataFimUTC = Date.UTC(anoF, mesF - 1, diaF);
                    
                    const diffDias = Math.floor((dataFimUTC - dataInicioUTC) / (1000 * 60 * 60 * 24)) + 1;
                    
                    duracao = diffDias === 1 ? '1 dia' : `${diffDias} dias`;
                } else {
                    duracao = 'Duração desconhecida';
                }
            }
            
            // ===== FORMATAÇÃO DE HORÁRIO =====
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
async function carregarListaFeriados() {
    console.log("=== CARREGANDO FERIADOS (API + MANUAIS) ===");
    
    const container = document.getElementById("listaFeriados");
    if (!container) return;
    
    const loadingEl = document.getElementById("loadingLancamentos");
    if (loadingEl) loadingEl.classList.remove("hidden");
    container.innerHTML = '';
    
    try {
        const mesAtual = window.mesAtual !== undefined ? window.mesAtual : new Date().getMonth();
        const anoAtual = window.anoAtual !== undefined ? window.anoAtual : new Date().getFullYear();
        
        // ===== 1. FERIADOS DA API =====
        let feriadosAPI = [];
        try {
            const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${anoAtual}`);
            if (response.ok) {
                feriadosAPI = await response.json();
            }
        } catch (e) {
            console.error("❌ Erro API:", e);
        }
        
        // ===== 2. FERIADOS MANUAIS (do banco) =====
        let feriadosManuais = window.feriadosLocais || [];
        console.log("📝 Feriados manuais (do banco):", feriadosManuais);
        
        // ===== 3. COMBINAR TODOS OS FERIADOS =====
        const todosFeriados = [];
        
        // API feriados
        feriadosAPI.forEach(f => {
            const data = new Date(f.date + 'T12:00:00');
            todosFeriados.push({
                id: `api-${f.date}`,
                nome: f.name,
                data: data,
                dataStr: f.date,
                tipo: 'federal',
                origem: 'api',
                icone: '🇧🇷',
                cor: '#2563eb',
                mes: data.getMonth(),
                ano: data.getFullYear()
            });
        });
        
        // Manuais (do banco)
        feriadosManuais.forEach(f => {
            // 🔥 USAR OS CAMPOS CORRETOS
            const dataFeriado = f.Data || f.data;
            if (!dataFeriado) return;
            
            // Extrair apenas a data (YYYY-MM-DD)
            let dataStr = dataFeriado;
            if (dataFeriado.includes('T')) {
                dataStr = dataFeriado.split('T')[0];
            }
            
            // 🔥 IMPORTANTE: Criar data ao meio-dia UTC para evitar fuso
            const [ano, mes, dia] = dataStr.split('-').map(Number);
            const data = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
            
            todosFeriados.push({
                id: f.Id || f.id,
                nome: f.Nome || f.nome || 'Feriado',
                data: data,
                dataStr: dataStr,
                tipo: f.Tipo || f.tipo || 'municipal',
                origem: 'manual',
                icone: '📝',
                cor: '#f59e0b',
                mes: mes - 1, // 0-11 (JS months)
                ano: ano
            });
        });
        
        if (loadingEl) loadingEl.classList.add("hidden");
        
        if (todosFeriados.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum feriado encontrado</div>';
            return;
        }
        
        // Filtrar apenas do mês atual
        const feriadosDoMes = todosFeriados.filter(f => f.mes === mesAtual && f.ano === anoAtual);
        
        if (feriadosDoMes.length === 0) {
            container.innerHTML = '<div class="empty-state">Nenhum feriado neste mês</div>';
            return;
        }
        
        // Ordenar
        feriadosDoMes.sort((a, b) => a.data - b.data);
        
        // Gerar HTML
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
        console.error("❌ Erro:", error);
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
        
        mostrarToast("Salvo com sucesso!", "success");
        
        // 🔥 Resetar o formulário
        resetarFormularioLancamento();
        
        // 🔥 Fechar o modo de edição
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


function normalizarData(dataStr) {
    if (!dataStr) return null;
    
    // Se já estiver no formato YYYY-MM-DD, retorna
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
        return dataStr;
    }
    
    try {
        const data = new Date(dataStr);
        if (isNaN(data.getTime())) return null;
        
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        
        return `${ano}-${mes}-${dia}`;
    } catch (e) {
        console.error("Erro ao normalizar data:", dataStr, e);
        return null;
    }
}


function formatarDataSegura(dataStr) {
    if (!dataStr) return 'Data inválida';
    
    // Se já vier no formato ISO (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
        const [ano, mes, dia] = dataStr.split('-');
        return `${dia}/${mes}/${ano}`;
    }
    
    // Se vier com T (formato ISO completo)
    if (dataStr.includes('T')) {
        const [dataPart] = dataStr.split('T');
        const [ano, mes, dia] = dataPart.split('-');
        return `${dia}/${mes}/${ano}`;
    }
    
    // Fallback: tenta com Date corrigindo fuso
    try {
        const data = new Date(dataStr);
        // Ajustar fuso manualmente
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${dia}/${mes}/${ano}`;
    } catch (e) {
        return dataStr;
    }
}

function formatarHoraParaAPI(hora) {
    if (!hora) return null;
    // Se já tiver no formato HH:mm (ex: 10:00), adiciona :00
    if (hora.length === 5 && hora.includes(':')) {
        return hora + ':00';
    }
    return hora;
}



// ================= EXPORTAR FUNÇÕES =================
// Garantir que as funções estão no escopo global
window.abrirModalLancamento = abrirModalLancamento;
window.editarLancamento = editarLancamento;
window.excluirLancamento = excluirLancamento;
window.salvarLancamento = salvarLancamento;
window.cancelarEdicaoLancamento = cancelarEdicaoLancamento;
window.fecharModalLancamento = fecharModalLancamento;
window.debugFeriados = debugFeriados;

// Inicializar configurações quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    inicializarLancamentosUmaVez();
});
