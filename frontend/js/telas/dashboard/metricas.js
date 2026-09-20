function calcularMetricas(agora, dataHoje, jornadaSemanalIndex, colaboradoresBase = window.colaboradores || []) {
    const colaboradores = Array.isArray(colaboradoresBase) ? colaboradoresBase : [];
    const minutosAtuais = (agora.getHours() * 60) + agora.getMinutes();
    const ativosHoje = colaboradores.filter((colaborador) => Boolean(
        getColaboradorScheduleForDate(colaborador, dataHoje, jornadaSemanalIndex)
    ));
    const ausenciasHoje = obterAusenciasNaData(dataHoje);
    const ausentesIntegralmente = new Set(
        ausenciasHoje
            .filter((ausencia) => String(ausencia.periodoTipo || ausencia.PeriodoTipo || '').toLowerCase() !== 'horas')
            .map((ausencia) => Number(ausencia.colaboradorId || ausencia.ColaboradorId))
            .filter((id) => Number.isFinite(id))
    );

    const disponibilidadeHoje = ativosHoje.filter(
        (colaborador) => !ausentesIntegralmente.has(Number(colaborador.Id))
    ).length;
    const trabalhandoAgora = ativosHoje.filter(
        (colaborador) => colaboradorDisponivelAgora(colaborador, minutosAtuais, dataHoje, jornadaSemanalIndex)
    ).length;
    const feriasHoje = ausenciasHoje.filter((ausencia) => String(ausencia.tipo || ausencia.Tipo || '').toLowerCase() === 'ferias').length;

    const proximosPlantoes = (window.plantoesLancados || []).filter((plantao) => {
        const dataPlantao = toISODate(plantao.dataISO || plantao.data_plantao);
        if (!dataPlantao) {
            return false;
        }

        const diff = Math.floor((new Date(`${dataPlantao}T12:00:00`) - agora) / (1000 * 60 * 60 * 24));
        return diff >= 0 && diff <= 30;
    });

    // Um dia pode ter varios turnos, e cada turno e um registro. O painel conta
    // DIAS de plantao, nao turnos, senao um sabado com dois turnos apareceria
    // como dois plantoes.
    const diasComPlantao = new Set(
        proximosPlantoes.map((plantao) => toISODate(plantao.dataISO || plantao.data_plantao))
    );
    const diasSemEquipe = new Set(
        proximosPlantoes
            .filter((plantao) => Array.isArray(plantao.colaboradores) && plantao.colaboradores.length > 0)
            .map((plantao) => toISODate(plantao.dataISO || plantao.data_plantao))
    );
    const plantaoSemEquipe = [...diasComPlantao].filter((dia) => !diasSemEquipe.has(dia)).length;
    const coberturaPercentual = ativosHoje.length > 0
        ? Math.round((disponibilidadeHoje / ativosHoje.length) * 100)
        : 0;

    return {
        totalColaboradores: colaboradores.length,
        ativosHoje: ativosHoje.length,
        disponibilidadeHoje,
        trabalhandoAgora,
        ausenciasHoje: ausenciasHoje.length,
        feriasHoje,
        proximosPlantoes: diasComPlantao.size,
        plantaoSemEquipe,
        coberturaPercentual
    };
}

function calcularMetricasPorSetor(agora, dataHoje, jornadaSemanalIndex) {
    // Respeita "Meus setores": so agrupa os setores que o gestor escolheu ver.
    const colaboradores = filtrarColaboradoresPorSetorDashboard(window.colaboradores);
    const setoresById = new Map(
        (Array.isArray(window.setores) ? window.setores : [])
            .map((setor) => [String(setor.id ?? setor.Id ?? ''), setor])
            .filter(([id]) => id)
    );
    const grupos = new Map();

    colaboradores.forEach((colaborador) => {
        const setorId = getDashboardSetorId(colaborador) || 'sem-setor';
        const setorNome = getDashboardSetorNome(colaborador, setoresById);

        if (!grupos.has(setorId)) {
            grupos.set(setorId, {
                setorId,
                setorNome,
                colaboradores: []
            });
        }

        grupos.get(setorId).colaboradores.push(colaborador);
    });

    return Array.from(grupos.values())
        .sort((first, second) => first.setorNome.localeCompare(second.setorNome, 'pt-BR', { sensitivity: 'base' }))
        .map((grupo) => ({
            ...grupo,
            metricas: calcularMetricas(agora, dataHoje, jornadaSemanalIndex, grupo.colaboradores)
        }));
}

function gerarCardMetrica(titulo, valor, icone, subtitulo, destaque) {
    return `
        <div class="dashboard-card">
            <div class="dashboard-card-header">
                <h3>${titulo}</h3>
                <i class="fas fa-${icone}"></i>
            </div>
            <div class="dashboard-card-value">${valor}</div>
            <div class="dashboard-card-label">${subtitulo}</div>
            ${destaque ? `
                <div class="dashboard-card-small" style="margin-top: 12px;">
                    <i class="fas fa-info-circle"></i>
                    <div class="dashboard-card-small-info">
                        <strong>${destaque.valor}</strong>
                        <span>${destaque.rotulo}</span>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function gerarSetoresDashboard(gruposSetor = []) {
    if (!Array.isArray(gruposSetor) || gruposSetor.length === 0) {
        return '';
    }

    return `
        <section class="dashboard-sector-section">
            <div class="dashboard-sector-header">
                <div>
                    <h3><i class="fas fa-layer-group"></i> Indicadores por setor</h3>
                    <p>Leitura do dia considerando jornada semanal, almoco e ausencias.</p>
                </div>
            </div>

            <div class="dashboard-sector-grid">
                ${gruposSetor.map((grupo) => {
                    const metricas = grupo.metricas;
                    const cobertura = Math.max(0, Math.min(100, metricas.coberturaPercentual || 0));

                    return `
                        <article class="dashboard-sector-card">
                            <div class="dashboard-sector-card-header">
                                <span title="${escapeHtmlDashboard(grupo.setorNome)}">${escapeHtmlDashboard(grupo.setorNome)}</span>
                                <strong>${metricas.totalColaboradores}</strong>
                            </div>

                            <div class="dashboard-sector-stats">
                                <div>
                                    <strong>${metricas.ativosHoje}</strong>
                                    <span>Escalados</span>
                                </div>
                                <div>
                                    <strong>${metricas.trabalhandoAgora}</strong>
                                    <span>Agora</span>
                                </div>
                                <div>
                                    <strong>${metricas.disponibilidadeHoje}</strong>
                                    <span>Disponiveis</span>
                                </div>
                            </div>

                            <div class="dashboard-sector-progress" aria-label="Cobertura ${cobertura}%">
                                <span style="width: ${cobertura}%;"></span>
                            </div>
                        </article>
                    `;
                }).join('')}
            </div>
        </section>
    `;
}

