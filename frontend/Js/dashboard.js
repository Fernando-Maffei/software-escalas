let dashboardInterval = null;
let dashboardRenderPromise = null;

window.renderDashboard = renderDashboard;
window.pararAtualizacaoAutomatica = pararAtualizacaoAutomatica;

function toISODate(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        return value.includes('T') ? value.split('T')[0] : value;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function obterHoraNumericaSegura(valor) {
    if (typeof obterHoraNumerica === 'function') {
        return obterHoraNumerica(valor);
    }

    if (!valor) {
        return null;
    }

    const raw = String(valor);
    const hora = raw.includes('T')
        ? raw.match(/T(\d{2})/)?.[1]
        : raw.split(':')[0];

    return hora !== undefined ? Number(hora) : null;
}

function obterAusenciasNaData(dataISO) {
    return (window.ausencias || []).filter((ausencia) => {
        const inicio = toISODate(ausencia.DataInicio || ausencia.dataInicio);
        const fim = toISODate(ausencia.DataFim || ausencia.dataFim);

        return Boolean(inicio && fim && dataISO >= inicio && dataISO <= fim);
    });
}

function obterAusenciaDoColaboradorNaData(colaboradorId, dataISO) {
    return obterAusenciasNaData(dataISO).find((ausencia) => (ausencia.colaboradorId || ausencia.ColaboradorId) === colaboradorId) || null;
}

function colaboradorDisponivelNaHora(colaborador, hora, dataISO) {
    const ausencia = obterAusenciaDoColaboradorNaData(colaborador.Id, dataISO);
    const tipo = String(ausencia?.tipo || ausencia?.Tipo || '').toLowerCase();
    const periodoTipo = ausencia?.periodoTipo || ausencia?.PeriodoTipo;

    if (ausencia && periodoTipo !== 'horas') {
        return false;
    }

    const trabalhoInicio = obterHoraNumericaSegura(colaborador.TrabalhoInicio);
    const trabalhoFim = obterHoraNumericaSegura(colaborador.TrabalhoFim);
    const almocoInicio = obterHoraNumericaSegura(colaborador.AlmocoInicio);
    const almocoFim = obterHoraNumericaSegura(colaborador.AlmocoFim);

    if (trabalhoInicio === null || trabalhoFim === null) {
        return false;
    }

    const dentroDoTrabalho = hora >= trabalhoInicio && hora < trabalhoFim;
    const estaNoAlmoco = almocoInicio !== null && almocoFim !== null && hora >= almocoInicio && hora < almocoFim;

    if (!dentroDoTrabalho || estaNoAlmoco) {
        return false;
    }

    if (periodoTipo === 'horas') {
        const horaInicio = obterHoraNumericaSegura(ausencia?.horaInicio || ausencia?.HoraInicio);
        const horaFim = obterHoraNumericaSegura(ausencia?.horaFim || ausencia?.HoraFim);

        if (horaInicio !== null && horaFim !== null && hora >= horaInicio && hora < horaFim) {
            return false;
        }
    }

    return tipo !== 'ferias' && tipo !== 'folga' && tipo !== 'ausencia';
}

function calcularMetricas(agora, dataHoje) {
    const colaboradores = window.colaboradores || [];
    const ativos = colaboradores.filter((colaborador) => colaborador.TrabalhoInicio && colaborador.TrabalhoFim);
    const ausenciasHoje = obterAusenciasNaData(dataHoje);
    const ausentesIntegralmente = new Set(
        ausenciasHoje
            .filter((ausencia) => (ausencia.periodoTipo || ausencia.PeriodoTipo) !== 'horas')
            .map((ausencia) => ausencia.colaboradorId || ausencia.ColaboradorId)
    );

    const disponibilidadeHoje = Math.max(ativos.length - ausentesIntegralmente.size, 0);
    const trabalhandoAgora = ativos.filter((colaborador) => colaboradorDisponivelNaHora(colaborador, agora.getHours(), dataHoje)).length;
    const feriasHoje = ausenciasHoje.filter((ausencia) => String(ausencia.tipo || ausencia.Tipo || '').toLowerCase() === 'ferias').length;

    const proximosPlantoes = (window.plantoesLancados || []).filter((plantao) => {
        const dataPlantao = toISODate(plantao.dataISO || plantao.data_plantao);
        if (!dataPlantao) {
            return false;
        }

        const diff = Math.floor((new Date(`${dataPlantao}T12:00:00`) - agora) / (1000 * 60 * 60 * 24));
        return diff >= 0 && diff <= 30;
    });

    const plantaoSemEquipe = proximosPlantoes.filter((plantao) => !Array.isArray(plantao.colaboradores) || plantao.colaboradores.length === 0).length;
    const coberturaPercentual = ativos.length > 0
        ? Math.round((disponibilidadeHoje / ativos.length) * 100)
        : 0;

    return {
        totalColaboradores: colaboradores.length,
        ativos: ativos.length,
        disponibilidadeHoje,
        trabalhandoAgora,
        ausenciasHoje: ausenciasHoje.length,
        feriasHoje,
        proximosPlantoes: proximosPlantoes.length,
        plantaoSemEquipe,
        coberturaPercentual
    };
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

function gerarAlertas(metricas, dataHoje) {
    const alertas = [];
    const colaboradores = window.colaboradores || [];
    const ausenciasHoje = obterAusenciasNaData(dataHoje);

    const semHorario = colaboradores.filter((colaborador) => !colaborador.TrabalhoInicio || !colaborador.TrabalhoFim);
    if (semHorario.length > 0) {
        alertas.push({
            tipo: 'warning',
            icone: 'clock',
            titulo: `${semHorario.length} colaborador(es) sem jornada definida`,
            descricao: 'Preencha horários de entrada e saída para melhorar a escala.'
        });
    }

    if (metricas.coberturaPercentual > 0 && metricas.coberturaPercentual < 60) {
        alertas.push({
            tipo: 'danger',
            icone: 'exclamation-triangle',
            titulo: `Cobertura baixa hoje (${metricas.coberturaPercentual}%)`,
            descricao: 'Há pouca gente disponível para o volume cadastrado de horários.'
        });
    }

    if (metricas.plantaoSemEquipe > 0) {
        alertas.push({
            tipo: 'warning',
            icone: 'calendar-times',
            titulo: `${metricas.plantaoSemEquipe} plantão(ões) sem equipe`,
            descricao: 'Revise os próximos sábados para evitar lacunas de atendimento.'
        });
    }

    if (ausenciasHoje.length >= 3) {
        alertas.push({
            tipo: 'warning',
            icone: 'users-slash',
            titulo: `${ausenciasHoje.length} ausência(s) ativa(s) hoje`,
            descricao: 'Vale revisar a distribuição do dia para evitar sobrecarga.'
        });
    }

    const hoje = new Date(`${dataHoje}T12:00:00`);
    const feriasProximas = (window.ausencias || []).filter((ausencia) => {
        if (String(ausencia.tipo || ausencia.Tipo || '').toLowerCase() !== 'ferias') {
            return false;
        }

        const inicio = toISODate(ausencia.DataInicio || ausencia.dataInicio);
        if (!inicio) {
            return false;
        }

        const diff = Math.floor((new Date(`${inicio}T12:00:00`) - hoje) / (1000 * 60 * 60 * 24));
        return diff >= 0 && diff <= 7;
    });

    feriasProximas.slice(0, 2).forEach((ausencia) => {
        const colaborador = colaboradores.find((item) => item.Id === (ausencia.colaboradorId || ausencia.ColaboradorId));

        if (!colaborador) {
            return;
        }

        alertas.push({
            tipo: 'success',
            icone: 'umbrella-beach',
            titulo: `Férias próximas: ${colaborador.Nome}`,
            descricao: `Início em ${new Date(`${toISODate(ausencia.DataInicio || ausencia.dataInicio)}T12:00:00`).toLocaleDateString('pt-BR')}.`
        });
    });

    return alertas;
}

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

function gerarGraficoAusencias() {
    const tipos = {
        ferias: 0,
        folga: 0,
        ausencia: 0
    };

    (window.ausencias || []).forEach((ausencia) => {
        const tipo = String(ausencia.tipo || ausencia.Tipo || '').toLowerCase();
        if (tipos[tipo] !== undefined) {
            tipos[tipo] += 1;
        }
    });

    const total = tipos.ferias + tipos.folga + tipos.ausencia;

    if (total === 0) {
        return '<div class="empty-state" style="min-height: 150px;">Sem dados para exibir</div>';
    }

    const barras = [
        { label: 'Férias', valor: tipos.ferias, cor: '#3b82f6' },
        { label: 'Folgas', valor: tipos.folga, cor: '#10b981' },
        { label: 'Ausências', valor: tipos.ausencia, cor: '#ef4444' }
    ];

    return `
        <div style="display: flex; flex-direction: column; gap: 12px; height: 100%; justify-content: center;">
            ${barras.map((barra) => `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="width: 80px; font-size: 12px; color: var(--text-light);">${barra.label}</span>
                    <div style="flex: 1; height: 20px; background: var(--card-dark); border-radius: 10px; overflow: hidden;">
                        <div style="width: ${(barra.valor / total) * 100}%; height: 100%; background: ${barra.cor};"></div>
                    </div>
                    <span style="width: 40px; font-size: 12px; font-weight: 600;">${barra.valor}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function gerarGraficoOcupacao(dataHoje) {
    const ocupacao = [];

    for (let hora = 7; hora <= 18; hora += 1) {
        const contagem = (window.colaboradores || []).filter((colaborador) => colaboradorDisponivelNaHora(colaborador, hora, dataHoje)).length;
        ocupacao.push({ hora, contagem });
    }

    const maxContagem = Math.max(...ocupacao.map((item) => item.contagem), 1);

    return `
        <div style="display: flex; align-items: flex-end; gap: 8px; height: 180px; padding: 10px 0;">
            ${ocupacao.map((item) => `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <div style="width: 100%; height: ${(item.contagem / maxContagem) * 120}px; background: linear-gradient(0deg, #0f766e, #14b8a6); border-radius: 8px 8px 0 0;"></div>
                    <span style="font-size: 10px; color: var(--text-light);">${item.hora}h</span>
                    <span style="font-size: 10px; font-weight: 600;">${item.contagem}</span>
                </div>
            `).join('')}
        </div>
    `;
}

async function buscarProximosEventos() {
    const eventos = [];
    const hoje = new Date();

    const periodo = Array.from({ length: 30 }, (_, index) => {
        const data = new Date(hoje);
        data.setDate(hoje.getDate() + index);
        return toISODate(data);
    });

    periodo.forEach((dataISO) => {
        (window.feriados || []).filter((feriado) => feriado.date === dataISO).forEach((feriado) => {
            eventos.push({
                dataStr: dataISO,
                data: new Date(`${dataISO}T12:00:00`),
                titulo: feriado.name,
                subtitulo: 'Feriado nacional',
                tipo: 'feriado',
                isPeriodo: false
            });
        });

        (window.feriadosLocais || []).filter((feriado) => toISODate(feriado.Data || feriado.data) === dataISO).forEach((feriado) => {
            eventos.push({
                dataStr: dataISO,
                data: new Date(`${dataISO}T12:00:00`),
                titulo: feriado.Nome || feriado.nome || 'Feriado local',
                subtitulo: feriado.Tipo || feriado.tipo || 'Municipal',
                tipo: 'feriado',
                isPeriodo: false
            });
        });
    });

    const eventosAgrupados = new Map();

    (window.ausencias || []).forEach((ausencia) => {
        const inicio = toISODate(ausencia.DataInicio || ausencia.dataInicio);
        const fim = toISODate(ausencia.DataFim || ausencia.dataFim);
        const tipo = String(ausencia.tipo || ausencia.Tipo || '').toLowerCase();
        const colaborador = (window.colaboradores || []).find((item) => item.Id === (ausencia.colaboradorId || ausencia.ColaboradorId));

        if (!inicio || !fim || !colaborador) {
            return;
        }

        const dataInicio = new Date(`${inicio}T12:00:00`);
        const diffInicio = Math.floor((dataInicio - hoje) / (1000 * 60 * 60 * 24));
        if (diffInicio < 0 || diffInicio > 30) {
            return;
        }

        const chave = `${colaborador.Nome}-${tipo}-${inicio}-${fim}`;
        if (!eventosAgrupados.has(chave)) {
            const diffDias = Math.floor((new Date(`${fim}T12:00:00`) - dataInicio) / (1000 * 60 * 60 * 24)) + 1;
            const periodo = diffDias > 1
                ? `${diffDias} dias (${formatarDataBR(inicio)} a ${formatarDataBR(fim)})`
                : formatarDataBR(inicio);

            eventosAgrupados.set(chave, {
                dataStr: inicio,
                data: dataInicio,
                titulo: colaborador.Nome,
                subtitulo: `${tipo === 'ferias' ? 'Férias' : tipo === 'folga' ? 'Folga' : 'Ausência'} - ${periodo}`,
                tipo,
                isPeriodo: diffDias > 1
            });
        }
    });

    eventos.push(...eventosAgrupados.values());
    eventos.sort((a, b) => a.dataStr.localeCompare(b.dataStr));

    return eventos.slice(0, 10);
}

function formatarDataBR(dataISO) {
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}`;
}

function gerarEventItem(evento) {
    const [, mes, dia] = evento.dataStr.split('-');
    const badgeMap = {
        ferias: 'Férias',
        folga: 'Folga',
        ausencia: 'Ausência',
        feriado: 'Feriado'
    };

    const badgeClass = evento.tipo in badgeMap ? evento.tipo : 'feriado';
    const badgeText = badgeMap[badgeClass];

    return `
        <div class="event-item">
            <div class="event-date">
                <div class="event-day">${dia}</div>
                <div class="event-month">${mes}</div>
                ${evento.isPeriodo ? '<div class="event-period-icon"><i class="fas fa-calendar-alt"></i></div>' : ''}
            </div>
            <div class="event-info">
                <div class="event-title">${evento.titulo}</div>
                <div class="event-subtitle">${evento.subtitulo}</div>
            </div>
            <span class="event-badge ${badgeClass}">${badgeText}</span>
        </div>
    `;
}

async function renderDashboardInternal() {
    const appContent = document.getElementById('appContent');
    if (!appContent) {
        return;
    }

    const hoje = new Date();
    const dataHoje = toISODate(hoje);

    await Promise.all([
        carregarColaboradores(),
        carregarAusencias(),
        carregarFeriadosLocais(),
        typeof carregarPlantoes === 'function' ? carregarPlantoes() : Promise.resolve([]),
        typeof window.carregarFeriadosNacionais === 'function'
            ? window.carregarFeriadosNacionais(hoje.getFullYear())
            : Promise.resolve([])
    ]);

    const metricas = calcularMetricas(hoje, dataHoje);
    const alertas = gerarAlertas(metricas, dataHoje);
    const proximosEventos = await buscarProximosEventos();

    appContent.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-chart-line"></i> Dashboard</h1>
            <p>${hoje.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <div class="dashboard-grid">
            ${gerarCardMetrica('Colaboradores', metricas.totalColaboradores, 'users', 'Total cadastrados', {
                valor: metricas.ativos,
                rotulo: 'Com horário definido'
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
                    ${gerarGraficoOcupacao(dataHoje)}
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
