
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

function fecharRelatorio() {
    document.getElementById('relatorioVisualizacao').style.display = 'none';
}

// ========== FUNÇÕES DE EXPORTAÇÃO ==========
async function exportarRelatorioCompleto() {
    const mes = parseInt(document.getElementById('relatorioMesCompleto').value);
    const ano = parseInt(document.getElementById('relatorioAnoCompleto').value);
    
    await exportarComoPDF(mes, ano);
}

