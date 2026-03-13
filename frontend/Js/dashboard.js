// dashboard.js
// Variáveis globais para o dashboard
let dashboardInterval = null;

// Função principal para renderizar o dashboard
async function renderDashboard() {
    console.log("📊 Renderizando dashboard...");
    
    const appContent = document.getElementById("appContent");
    
    // Garantir que os dados estão atualizados
    await Promise.all([
        carregarColaboradores(),
        carregarAusencias(),
        carregarFeriadosLocais()
    ]);
    
    // Obter dados do dia atual
    const hoje = new Date();
    const dataHoje = hoje.toISOString().split('T')[0];
    
    // Calcular métricas
    const metricas = calcularMetricas(hoje, dataHoje);
    
    // Gerar alertas
    const alertas = gerarAlertas();
    
    // Buscar próximos eventos
    const proximosEventos = await buscarProximosEventos();
    
    appContent.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-chart-line"></i> Dashboard</h1>
            <p>${hoje.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <!-- CARDS DE MÉTRICAS -->
        <div class="dashboard-grid">
            ${gerarCardMetrica('Colaboradores', metricas.totalColaboradores, 'users', 'Total ativos', metricas.ativos)}
            ${gerarCardMetrica('Hoje', metricas.trabalhandoHoje, 'briefcase', 'Trabalhando agora', metricas.trabalhandoAgora, 'trabalhando')}
            ${gerarCardMetrica('Ausências', metricas.ausenciasHoje, 'calendar-times', 'Férias/Folgas', metricas.feriasHoje)}
            ${gerarCardMetrica('Plantões', metricas.proximosPlantoes, 'calendar-check', 'Próximos 30 dias', metricas.proximosPlantoes)}
        </div>

        <!-- ALERTAS E PROBLEMAS -->
        <div class="alerts-section">
            <div class="alerts-header">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Alertas e Atenção</h3>
            </div>
            <div class="alerts-list" id="alertsList">
                ${alertas.length > 0 ? alertas.map(a => gerarAlertItem(a)).join('') : `
                    <div class="alert-item success">
                        <i class="fas fa-check-circle"></i>
                        <div class="alert-content">
                            <span class="alert-title">Tudo certo!</span>
                            <span class="alert-description">Nenhum problema identificado</span>
                        </div>
                    </div>
                `}
            </div>
        </div>

        <!-- GRÁFICOS -->
        <div class="charts-grid">
            <div class="chart-card">
                <h4><i class="fas fa-chart-bar"></i> Ausências por Tipo</h4>
                <div id="chartAusencias" style="height: 200px;">
                    ${gerarGraficoAusencias()}
                </div>
            </div>
            <div class="chart-card">
                <h4><i class="fas fa-clock"></i> Ocupação por Hora</h4>
                <div id="chartOcupacao" style="height: 200px;">
                    ${gerarGraficoOcupacao()}
                </div>
            </div>
        </div>

        <!-- PRÓXIMOS EVENTOS -->
        <div class="events-section">
            <div class="events-header">
                <i class="fas fa-calendar-alt"></i>
                <h3>Próximos Eventos</h3>
            </div>
            <div class="events-list" id="eventsList">
                ${proximosEventos.length > 0 ? proximosEventos.map(e => gerarEventItem(e)).join('') : `
                    <div class="empty-state">
                        <i class="fas fa-calendar-check"></i>
                        <p>Nenhum evento próximo</p>
                    </div>
                `}
            </div>
        </div>
    `;
    
    // Iniciar atualização automática a cada minuto
    iniciarAtualizacaoAutomatica();
}

// Função para gerar cards de métricas
function gerarCardMetrica(titulo, valor, icone, subtitulo, valor2, tipo = 'normal') {
    return `
        <div class="dashboard-card">
            <div class="dashboard-card-header">
                <h3>${titulo}</h3>
                <i class="fas fa-${icone}"></i>
            </div>
            <div class="dashboard-card-value">${valor}</div>
            <div class="dashboard-card-label">${subtitulo}</div>
            ${valor2 !== undefined ? `
                <div class="dashboard-card-small" style="margin-top: 12px;">
                    <i class="fas fa-${tipo === 'trabalhando' ? 'briefcase' : 'clock'}"></i>
                    <div class="dashboard-card-small-info">
                        <strong>${valor2}</strong>
                        <span>${subtitulo}</span>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// Função para calcular métricas
function calcularMetricas(hoje, dataHoje) {
    const horaAtual = hoje.getHours();
    
    // Total de colaboradores
    const totalColaboradores = window.colaboradores?.length || 0;
    
    // Colaboradores ativos (com horário definido)
    const ativos = window.colaboradores?.filter(c => c.TrabalhoInicio && c.TrabalhoFim).length || 0;
    
    // Trabalhando hoje (segunda a sábado)
    const diaSemana = hoje.getDay();
    const trabalhandoHoje = diaSemana >= 1 && diaSemana <= 6 ? totalColaboradores : 0;
    
    // Trabalhando agora
    let trabalhandoAgora = 0;
    window.colaboradores?.forEach(c => {
        const trabInicio = obterHoraNumerica(c.TrabalhoInicio);
        const trabFim = obterHoraNumerica(c.TrabalhoFim);
        if (trabInicio !== null && trabFim !== null && 
            horaAtual >= trabInicio && horaAtual < trabFim) {
            trabalhandoAgora++;
        }
    });
    
    // Ausências hoje
    const ausenciasHoje = window.ausencias?.filter(a => {
        const dataInicio = new Date(a.DataInicio).toISOString().split('T')[0];
        const dataFim = new Date(a.DataFim).toISOString().split('T')[0];
        return dataHoje >= dataInicio && dataHoje <= dataFim;
    }).length || 0;
    
    // Férias hoje
    const feriasHoje = window.ausencias?.filter(a => {
        const tipo = (a.tipo || a.Tipo || '').toLowerCase();
        const dataInicio = new Date(a.DataInicio).toISOString().split('T')[0];
        const dataFim = new Date(a.DataFim).toISOString().split('T')[0];
        return tipo === 'ferias' && dataHoje >= dataInicio && dataHoje <= dataFim;
    }).length || 0;
    
    // Próximos plantões (próximos 30 dias)
    const proximosPlantoes = window.plantoesLancados?.filter(p => {
        const dataPlantao = new Date(p.dataISO);
        const diffDias = Math.floor((dataPlantao - hoje) / (1000 * 60 * 60 * 24));
        return diffDias >= 0 && diffDias <= 30;
    }).length || 0;
    
    return {
        totalColaboradores,
        ativos,
        trabalhandoHoje,
        trabalhandoAgora,
        ausenciasHoje,
        feriasHoje,
        proximosPlantoes
    };
}

// Função para gerar alertas
function gerarAlertas() {
    const alertas = [];
    const hoje = new Date();
    const dataHoje = hoje.toISOString().split('T')[0];
    
    // 1. Colaboradores sem horário definido
    const semHorario = window.colaboradores?.filter(c => !c.TrabalhoInicio || !c.TrabalhoFim) || [];
    if (semHorario.length > 0) {
        alertas.push({
            tipo: 'warning',
            icone: 'exclamation-triangle',
            titulo: `${semHorario.length} colaborador(es) sem horário definido`,
            descricao: 'Configure os horários de trabalho para esses colaboradores'
        });
    }
    
    // 2. Férias próximas (próximos 7 dias)
    const feriasProximas = window.ausencias?.filter(a => {
        const tipo = (a.tipo || a.Tipo || '').toLowerCase();
        if (tipo !== 'ferias') return false;
        
        const dataInicio = new Date(a.DataInicio);
        const diffDias = Math.floor((dataInicio - hoje) / (1000 * 60 * 60 * 24));
        return diffDias >= 0 && diffDias <= 7;
    }) || [];
    
    feriasProximas.forEach(f => {
        const colaborador = window.colaboradores?.find(c => c.Id === (f.colaboradorId || f.ColaboradorId));
        if (colaborador) {
            alertas.push({
                tipo: 'success',
                icone: 'umbrella-beach',
                titulo: `Férias próximas: ${colaborador.Nome}`,
                descricao: `Início em ${new Date(f.DataInicio).toLocaleDateString('pt-BR')}`
            });
        }
    });
    
    // 3. Plantão sem colaboradores
    const plantaoSemColab = window.plantoesLancados?.filter(p => !p.colaboradores || p.colaboradores.length === 0) || [];
    if (plantaoSemColab.length > 0) {
        alertas.push({
            tipo: 'danger',
            icone: 'calendar-times',
            titulo: `${plantaoSemColab.length} plantão(ões) sem colaboradores`,
            descricao: 'Adicione colaboradores aos plantões lançados'
        });
    }
    
    // 4. Conflitos de ausência (mesmo dia com múltiplas ausências)
    const conflitos = window.ausencias?.filter(a => {
        const dataInicio = new Date(a.DataInicio).toISOString().split('T')[0];
        const dataFim = new Date(a.DataFim).toISOString().split('T')[0];
        return dataHoje >= dataInicio && dataHoje <= dataFim;
    }) || [];
    
    if (conflitos.length > 3) {
        alertas.push({
            tipo: 'warning',
            icone: 'users-slash',
            titulo: `Muitas ausências hoje (${conflitos.length})`,
            descricao: 'Verifique se a escala está adequada'
        });
    }
    
    return alertas;
}

// Função para gerar item de alerta
function gerarAlertItem(alerta) {
    return `
        <div class="alert-item ${alerta.tipo}">
            <i class="fas fa-${alerta.icone}"></i>
            <div class="alert-content">
                <span class="alert-title">${alerta.titulo}</span>
                <span class="alert-description">${alerta.descricao}</span>
            </div>
        </div>
    `;
}

// Função para gerar gráfico de ausências (simulado com CSS)
function gerarGraficoAusencias() {
    const tipos = {
        ferias: window.ausencias?.filter(a => (a.tipo || a.Tipo || '').toLowerCase() === 'ferias').length || 0,
        folga: window.ausencias?.filter(a => (a.tipo || a.Tipo || '').toLowerCase() === 'folga').length || 0,
        ausencia: window.ausencias?.filter(a => (a.tipo || a.Tipo || '').toLowerCase() === 'ausencia').length || 0
    };
    
    const total = tipos.ferias + tipos.folga + tipos.ausencia;
    
    if (total === 0) {
        return '<div class="empty-state" style="min-height: 150px;">Sem dados para exibir</div>';
    }
    
    const porcentagens = {
        ferias: (tipos.ferias / total) * 100,
        folga: (tipos.folga / total) * 100,
        ausencia: (tipos.ausencia / total) * 100
    };
    
    return `
        <div style="display: flex; flex-direction: column; gap: 12px; height: 100%; justify-content: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 80px; font-size: 12px; color: var(--text-light);">Férias</span>
                <div style="flex: 1; height: 20px; background: var(--card-dark); border-radius: 10px; overflow: hidden;">
                    <div style="width: ${porcentagens.ferias}%; height: 100%; background: linear-gradient(90deg, #6366f1, #818cf8);"></div>
                </div>
                <span style="width: 40px; font-size: 12px; font-weight: 600;">${tipos.ferias}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 80px; font-size: 12px; color: var(--text-light);">Folgas</span>
                <div style="flex: 1; height: 20px; background: var(--card-dark); border-radius: 10px; overflow: hidden;">
                    <div style="width: ${porcentagens.folga}%; height: 100%; background: linear-gradient(90deg, #10b981, #34d399);"></div>
                </div>
                <span style="width: 40px; font-size: 12px; font-weight: 600;">${tipos.folga}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 80px; font-size: 12px; color: var(--text-light);">Ausências</span>
                <div style="flex: 1; height: 20px; background: var(--card-dark); border-radius: 10px; overflow: hidden;">
                    <div style="width: ${porcentagens.ausencia}%; height: 100%; background: linear-gradient(90deg, #ef4444, #f87171);"></div>
                </div>
                <span style="width: 40px; font-size: 12px; font-weight: 600;">${tipos.ausencia}</span>
            </div>
        </div>
    `;
}

// Função para gerar gráfico de ocupação
function gerarGraficoOcupacao() {
    const ocupacao = [];
    
    for (let hora = 7; hora <= 18; hora++) {
        let contagem = 0;
        window.colaboradores?.forEach(c => {
            const trabInicio = obterHoraNumerica(c.TrabalhoInicio);
            const trabFim = obterHoraNumerica(c.TrabalhoFim);
            if (trabInicio !== null && trabFim !== null && 
                hora >= trabInicio && hora < trabFim) {
                contagem++;
            }
        });
        ocupacao.push({ hora, contagem });
    }
    
    const maxContagem = Math.max(...ocupacao.map(o => o.contagem));
    
    return `
        <div style="display: flex; align-items: flex-end; gap: 8px; height: 180px; padding: 10px 0;">
            ${ocupacao.map(o => `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <div style="width: 100%; height: ${(o.contagem / (maxContagem || 1)) * 120}px; 
                                background: linear-gradient(0deg, #6366f1, #818cf8);
                                border-radius: 8px 8px 0 0;
                                transition: height 0.3s ease;">
                    </div>
                    <span style="font-size: 10px; color: var(--text-light);">${o.hora}h</span>
                    <span style="font-size: 10px; font-weight: 600;">${o.contagem}</span>
                </div>
            `).join('')}
        </div>
    `;
}

// Função para buscar próximos eventos
async function buscarProximosEventos() {
    const eventos = [];
    const hoje = new Date();
    const dataHoje = hoje.toISOString().split('T')[0];
    
    // Buscar ausências dos próximos 7 dias
    for (let i = 0; i < 7; i++) {
        const data = new Date(hoje);
        data.setDate(hoje.getDate() + i);
        const dataStr = data.toISOString().split('T')[0];
        
        // Ausências
        const ausenciasDia = window.ausencias?.filter(a => {
            const dataInicio = new Date(a.DataInicio).toISOString().split('T')[0];
            const dataFim = new Date(a.DataFim).toISOString().split('T')[0];
            return dataStr >= dataInicio && dataStr <= dataFim;
        }) || [];
        
        ausenciasDia.forEach(a => {
            const colaborador = window.colaboradores?.find(c => c.Id === (a.colaboradorId || a.ColaboradorId));
            const tipo = (a.tipo || a.Tipo || '').toLowerCase();
            
            eventos.push({
                data: data,
                dataStr: dataStr,
                titulo: colaborador?.Nome || 'Desconhecido',
                subtitulo: tipo === 'ferias' ? 'Férias' : 
                          tipo === 'folga' ? 'Folga' : 'Ausência',
                tipo: tipo
            });
        });
        
        // Feriados
        const feriadosAPI = window.feriados?.filter(f => f.date === dataStr) || [];
        feriadosAPI.forEach(f => {
            eventos.push({
                data: data,
                dataStr: dataStr,
                titulo: f.name,
                subtitulo: 'Feriado Nacional',
                tipo: 'feriado'
            });
        });
        
        // Feriados locais
        const feriadosLocais = window.feriadosLocais?.filter(f => {
            if (!f.Data) return false;
            const dataFeriado = new Date(f.Data).toISOString().split('T')[0];
            return dataFeriado === dataStr;
        }) || [];
        
        feriadosLocais.forEach(f => {
            eventos.push({
                data: data,
                dataStr: dataStr,
                titulo: f.Nome || f.nome || 'Feriado',
                subtitulo: f.Tipo || f.tipo || 'Municipal',
                tipo: 'feriado'
            });
        });
    }
    
    // Ordenar por data
    eventos.sort((a, b) => a.data - b.data);
    
    return eventos.slice(0, 10); 
}


function gerarEventItem(evento) {
    const dia = evento.data.getDate().toString().padStart(2, '0');
    const mes = (evento.data.getMonth() + 1).toString().padStart(2, '0');
    
    return `
        <div class="event-item">
            <div class="event-date">
                <div class="event-day">${dia}</div>
                <div class="event-month">${mes}</div>
            </div>
            <div class="event-info">
                <div class="event-title">${evento.titulo}</div>
                <div class="event-subtitle">${evento.subtitulo}</div>
            </div>
            <span class="event-badge ${evento.tipo}">${evento.tipo}</span>
        </div>
    `;
}

// Função para iniciar atualização automática
function iniciarAtualizacaoAutomatica() {
    // Limpar intervalo anterior se existir
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
    }
    
    // Atualizar a cada minuto
    dashboardInterval = setInterval(() => {
        console.log("🔄 Atualizando dashboard...");
        renderDashboard();
    }, 60000); // 60 segundos
}

// Função para parar atualização automática
function pararAtualizacaoAutomatica() {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }
}

// Exportar funções
window.renderDashboard = renderDashboard;