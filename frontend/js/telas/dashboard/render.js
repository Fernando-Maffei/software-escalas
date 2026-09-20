async function renderDashboardInternal() {
    const appContent = document.getElementById('appContent');
    if (!appContent) {
        return;
    }

    const hoje = new Date();
    const dataHoje = toISODate(hoje);

    const [, , , , , , jornadaSemanalResponse] = await Promise.all([
        carregarColaboradores(),
        typeof carregarSetores === 'function' ? carregarSetores() : Promise.resolve([]),
        carregarAusencias(),
        carregarFeriadosLocais(),
        typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([]),
        typeof window.carregarFeriadosNacionais === 'function'
            ? window.carregarFeriadosNacionais(hoje.getFullYear())
            : Promise.resolve([]),
        typeof window.API?.getJornadaSemanal === 'function'
            ? window.API.getJornadaSemanal().catch(() => ({ items: [] }))
            : Promise.resolve({ items: [] })
    ]);

    const jornadaSemanalIndex = buildJornadaSemanalIndex(jornadaSemanalResponse?.items || []);
    // "Meus setores": os cards, alertas e o grafico de ocupacao passam a
    // refletir so os colaboradores dos setores escolhidos pelo gestor.
    const colaboradoresEscopo = filtrarColaboradoresPorSetorDashboard(window.colaboradores);
    const metricas = calcularMetricas(hoje, dataHoje, jornadaSemanalIndex, colaboradoresEscopo);
    const metricasPorSetor = calcularMetricasPorSetor(hoje, dataHoje, jornadaSemanalIndex);
    const alertas = gerarAlertas(metricas, dataHoje, jornadaSemanalIndex, colaboradoresEscopo);
    const proximosEventos = await buscarProximosEventos();

    appContent.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-chart-line"></i> Dashboard</h1>
            <p>${hoje.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <div class="dashboard-grid">
            ${gerarCardMetrica('Colaboradores', metricas.totalColaboradores, 'users', 'Total cadastrados', {
                valor: metricas.ativosHoje,
                rotulo: 'Escalados hoje'
            })}
            ${gerarCardMetrica('Cobertura do dia', metricas.disponibilidadeHoje, 'user-check', 'Disponíveis hoje', {
                valor: `${metricas.coberturaPercentual}%`,
                rotulo: 'Capacidade estimada'
            })}
            ${gerarCardMetrica('Agora', metricas.trabalhandoAgora, 'briefcase', 'Trabalhando neste horário', {
                valor: metricas.ausenciasHoje,
                rotulo: 'Ausências ativas hoje'
            })}
            ${gerarCardMetrica('Plantões', metricas.proximosPlantoes, 'calendar-check', 'Próximos 30 dias', {
                valor: metricas.plantaoSemEquipe,
                rotulo: 'Sem equipe definida'
            })}
        </div>

        ${gerarSetoresDashboard(metricasPorSetor)}

        <div class="alerts-section">
            <div class="alerts-header">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Alertas e atenção</h3>
            </div>
            <div class="alerts-list" id="alertsList">
                ${alertas.length > 0 ? alertas.map((alerta) => gerarAlertItem(alerta)).join('') : `
                    <div class="alert-item success">
                        <i class="fas fa-check-circle"></i>
                        <div class="alert-content">
                            <span class="alert-title">Tudo certo!</span>
                            <span class="alert-description">Nenhum alerta relevante encontrado no momento.</span>
                        </div>
                    </div>
                `}
            </div>
        </div>

        <div class="charts-grid">
            <div class="chart-card">
                <h4><i class="fas fa-chart-bar"></i> Ausências por tipo</h4>
                <div id="chartAusencias" style="height: 200px;">
                    ${gerarGraficoAusencias()}
                </div>
            </div>
            <div class="chart-card">
                <h4><i class="fas fa-clock"></i> Cobertura por hora</h4>
                <div id="chartOcupacao" style="height: 200px;">
                    ${gerarGraficoOcupacao(dataHoje, jornadaSemanalIndex, colaboradoresEscopo)}
                </div>
            </div>
        </div>

        <div class="events-section">
            <div class="events-header">
                <i class="fas fa-calendar-alt"></i>
                <h3>Próximos eventos</h3>
            </div>
            <div class="events-list" id="eventsList">
                ${proximosEventos.length > 0 ? proximosEventos.map((evento) => gerarEventItem(evento)).join('') : `
                    <div class="empty-state">
                        <i class="fas fa-calendar-check"></i>
                        <p>Nenhum evento próximo</p>
                    </div>
                `}
            </div>
        </div>
    `;

    iniciarAtualizacaoAutomatica();
}

function renderDashboard() {
    if (!dashboardRenderPromise) {
        dashboardRenderPromise = renderDashboardInternal().finally(() => {
            dashboardRenderPromise = null;
        });
    }

    return dashboardRenderPromise;
}

function iniciarAtualizacaoAutomatica() {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
    }

    dashboardInterval = setInterval(() => {
        if ((window.location.hash || '#dashboard') === '#dashboard') {
            renderDashboard();
        }
    }, 60000);
}

function pararAtualizacaoAutomatica() {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }
}
