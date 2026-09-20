
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

