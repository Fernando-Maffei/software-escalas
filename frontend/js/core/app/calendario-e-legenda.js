function gerarLegendaMensal() {
    const container = document.getElementById("legendaMensalContent");
    if (!container) {
        return;
    }

    // Verificar se os dados existem
    if (!colaboradores) {
        colaboradores = [];
    }
    if (!ausencias) {
        ausencias = [];
    }
    if (!feriados) {
        feriados = [];
    }
    if (!feriadosLocais) {
        feriadosLocais = [];
    }

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
                
                if (!colaborador) {
                    return;
                }

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

function renderCalendario() {
    
    if (!appContent) {
        console.error("appContent não encontrado!");
        return;
    }
    
    // Usuario comum abre esta tela apenas para consultar folgas e ferias da
    // equipe; o botao de lancamento resultaria em 403 no back-end.
    const podeLancar = typeof window.usuarioEhAdmin !== 'function' || window.usuarioEhAdmin();

    appContent.innerHTML = `
        <div class="page-header">
            <h1>Calendário Mensal</h1>
            <div class="header-actions">
                ${podeLancar ? `
                <button id="btnLancamentoAjuste" class="btn-primary">
                    <i class="fas fa-plus"></i> Lançamento
                </button>
                ` : ''}
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

    // innerHTML e sincrono: o #calendar ja existe aqui. O antigo atraso de
    // 200 ms "para o DOM atualizar" so abria uma corrida — trocar de tela
    // nesse intervalo registrava "Elemento calendar nao foi criado!".
    window.inicializarCalendario();
}

function getPaginaFromURL() {
    // Pega o hash da URL, ex: #dashboard, #calendario
    const hash = window.location.hash.substring(1); // Remove o #
    
    // Se não tiver hash ou for inválido, retorna dashboard
    const paginasValidas = ['dashboard', 'calendario', 'colaboradores', 'escala', 'lancamentoPlantao', 'bancoHoras', 'relatorios', 'configuracoes', 'usuarios'];
    
    if (hash && paginasValidas.includes(hash)) {
        return hash;
    }
    
    return 'dashboard';
}

// carregarPagina troca window.location.hash, e no navegador isso tambem dispara
// popstate: cada navegacao montava a tela duas vezes (na Escala do Dia, duas
// requisicoes que gravam a escala do mesmo dia ao mesmo tempo). Aqui so
// recarrega quando a URL aponta para outra pagina — o "voltar" do navegador.
