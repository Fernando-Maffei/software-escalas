// ========== FUNÇÕES AUXILIARES ==========

// Abrir modal de feriado
function abrirModalFeriado() {

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
    
    const container = document.getElementById("listaFeriados");
    if (!container) {
        return;
    }
    
    const loadingEl = document.getElementById("loadingLancamentos");
    if (loadingEl) {
        loadingEl.classList.remove("hidden");
    }
    container.innerHTML = '';
    
    try {
        const mesAtual = window.mesAtual !== undefined ? window.mesAtual : new Date().getMonth();
        const anoAtual = window.anoAtual !== undefined ? window.anoAtual : new Date().getFullYear();
        
        // ===== 1. FERIADOS NACIONAIS (calculados pelo servidor) =====
        let feriadosAPI = [];
        try {
            feriadosAPI = await window.buscarFeriadosNacionais(anoAtual);
        } catch (e) {
            console.error("❌ Erro ao carregar feriados nacionais:", e);
        }
        
        // ===== 2. FERIADOS MANUAIS (do banco) =====
        let feriadosManuais = window.feriadosLocais || [];
        
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
                cor: '#0d9488',
                mes: data.getMonth(),
                ano: data.getFullYear()
            });
        });
        
        // Manuais (do banco)
        feriadosManuais.forEach(f => {
            // 🔥 USAR OS CAMPOS CORRETOS (maiúsculos)
            const dataFeriado = f.Data || f.data;
            if (!dataFeriado) {
                return;
            }
            
            // Extrair apenas a data (remover o T00:00:00.000Z)
            const dataStr = dataFeriado.split('T')[0];
            const data = new Date(dataStr + 'T12:00:00');
            
            todosFeriados.push({
                id: f.Id || f.id,
                nome: f.Nome || f.nome || 'Feriado',
                data: data,
                dataStr: dataStr,
                tipo: f.Tipo || f.tipo || 'municipal',
                origem: 'manual',
                icone: '📝',
                cor: '#e0973a',
                mes: data.getMonth(),
                ano: data.getFullYear()
            });
        });
        
        if (loadingEl) {
            loadingEl.classList.add("hidden");
        }
        
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
            const bgCor = isManual ? '#e0973a20' : '#0d948820';
            
            html += `
                <div class="lancamento-card" style="border-left: 4px solid ${cor}; margin-bottom: 10px;">
                    <div class="lancamento-header">
                        <div class="lancamento-titulo">
                            <i class="fas ${isManual ? 'fa-city' : 'fa-globe'}" style="color: ${cor};"></i>
                            <span><strong>${escapeHtml(f.nome)}</strong></span>
                        </div>
                        <span class="lancamento-badge" style="background: ${bgCor}; color: ${cor};">
                            ${f.icone} ${isManual ? escapeHtml(f.tipo) : 'Federal'}
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
        
    } catch (error) {
        console.error("❌ Erro:", error);
        if (loadingEl) {
            loadingEl.classList.add("hidden");
        }
        container.innerHTML = `<div class="empty-state">Erro: ${error.message}</div>`;
    }
}

// Excluir feriado
async function excluirFeriado(id) {

    if (!confirm("Deseja realmente excluir este feriado?")) {
        return;
    }

    try {

        await API.excluirFeriado(id);

        await carregarFeriadosLocais();
        await carregarListaFeriados();

    } catch (error) {

        console.error("Erro ao excluir feriado:", error);
        alert("Erro ao excluir feriado");

    }

}
