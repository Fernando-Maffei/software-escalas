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

function formatTimeInputDashboard(value) {
    if (!value) {
        return null;
    }

    const raw = String(value).trim();

    if (!raw) {
        return null;
    }

    if (raw.includes('T')) {
        const match = raw.match(/T(\d{2}:\d{2})/);
        return match ? match[1] : null;
    }

    if (!raw.includes(':')) {
        return null;
    }

    return raw.slice(0, 5);
}

function getTimeMinutesDashboard(value) {
    const formatted = formatTimeInputDashboard(value);

    if (!formatted) {
        return null;
    }

    const [hours, minutes] = formatted.split(':').map(Number);
    return (hours * 60) + minutes;
}

function getIsoDayOfWeekDashboard(dataISO) {
    const normalized = toISODate(dataISO);

    if (!normalized) {
        return new Date().getDay();
    }

    const [year, month, day] = normalized.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0).getDay();
}

function buildJornadaSemanalIndex(items = []) {
    const map = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
        const colaboradorId = Number(item.colaboradorId || item.ColaboradorId || 0);
        const diaSemana = Number(item.diaSemana ?? item.DiaSemana);
        const trabalhoInicio = formatTimeInputDashboard(item.trabalhoInicio || item.TrabalhoInicio);
        const trabalhoFim = formatTimeInputDashboard(item.trabalhoFim || item.TrabalhoFim);
        const almocoInicio = formatTimeInputDashboard(item.almocoInicio || item.AlmocoInicio);
        const almocoFim = formatTimeInputDashboard(item.almocoFim || item.AlmocoFim);

        if (!Number.isFinite(colaboradorId) || colaboradorId <= 0 || !Number.isFinite(diaSemana)) {
            return;
        }

        if (!map.has(colaboradorId)) {
            map.set(colaboradorId, new Map());
        }

        if (!trabalhoInicio || !trabalhoFim) {
            return;
        }

        map.get(colaboradorId).set(diaSemana, {
            trabalhoInicio,
            trabalhoFim,
            almocoInicio,
            almocoFim
        });
    });

    return map;
}

function hasColaboradorHorarioPadrao(colaborador) {
    return Boolean(
        formatTimeInputDashboard(colaborador?.TrabalhoInicio || colaborador?.trabalhoInicio)
        && formatTimeInputDashboard(colaborador?.TrabalhoFim || colaborador?.trabalhoFim)
    );
}

function getFallbackScheduleForDate(colaborador, dataISO) {
    const weekday = getIsoDayOfWeekDashboard(dataISO);

    if (weekday === 0 || weekday === 6) {
        return null;
    }

    const trabalhoInicio = formatTimeInputDashboard(colaborador?.TrabalhoInicio || colaborador?.trabalhoInicio);
    const trabalhoFim = formatTimeInputDashboard(colaborador?.TrabalhoFim || colaborador?.trabalhoFim);

    if (!trabalhoInicio || !trabalhoFim) {
        return null;
    }

    return {
        trabalhoInicio,
        trabalhoFim,
        almocoInicio: formatTimeInputDashboard(colaborador?.AlmocoInicio || colaborador?.almocoInicio),
        almocoFim: formatTimeInputDashboard(colaborador?.AlmocoFim || colaborador?.almocoFim),
        origem: 'padrao'
    };
}

function getColaboradorScheduleForDate(colaborador, dataISO, jornadaSemanalIndex) {
    const colaboradorId = Number(colaborador?.Id || colaborador?.id || 0);
    const weekday = getIsoDayOfWeekDashboard(dataISO);
    const jornadaByDay = jornadaSemanalIndex.get(colaboradorId);

    if (jornadaByDay) {
        const jornadaDia = jornadaByDay.get(weekday);

        if (!jornadaDia?.trabalhoInicio || !jornadaDia?.trabalhoFim) {
            return null;
        }

        return {
            ...jornadaDia,
            origem: 'jornada'
        };
    }

    return getFallbackScheduleForDate(colaborador, dataISO);
}

function obterAusenciasNaData(dataISO) {
    return (window.ausencias || []).filter((ausencia) => {
        const inicio = toISODate(ausencia.DataInicio || ausencia.dataInicio);
        const fim = toISODate(ausencia.DataFim || ausencia.dataFim);

        return Boolean(inicio && fim && dataISO >= inicio && dataISO <= fim);
    });
}

function obterAusenciaDoColaboradorNaData(colaboradorId, dataISO) {
    return obterAusenciasNaData(dataISO).find((ausencia) => Number(ausencia.colaboradorId || ausencia.ColaboradorId) === Number(colaboradorId)) || null;
}

function escapeHtmlDashboard(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getDashboardSetorId(colaborador) {
    const value = colaborador?.SetorId ?? colaborador?.setorId ?? colaborador?.setor_id ?? null;

    if (value === null || value === undefined || String(value).trim() === '') {
        return '';
    }

    return String(value);
}

function getDashboardSetorNome(colaborador, setoresById = new Map()) {
    const setorId = getDashboardSetorId(colaborador);
    const nomeDireto = colaborador?.SetorNome ?? colaborador?.setorNome ?? colaborador?.setor ?? colaborador?.Setor;
    const nomeSetor = nomeDireto || setoresById.get(setorId)?.nome || setoresById.get(setorId)?.Nome;
    const normalized = String(nomeSetor || '').trim();

    return normalized || 'Sem setor';
}

function colaboradorDisponivelAgora(colaborador, minutosAtuais, dataISO, jornadaSemanalIndex) {
    const ausencia = obterAusenciaDoColaboradorNaData(colaborador.Id, dataISO);
    const tipo = String(ausencia?.tipo || ausencia?.Tipo || '').toLowerCase();
    const periodoTipo = String(ausencia?.periodoTipo || ausencia?.PeriodoTipo || '').toLowerCase();
    const schedule = getColaboradorScheduleForDate(colaborador, dataISO, jornadaSemanalIndex);

    if (!schedule) {
        return false;
    }

    if (ausencia && periodoTipo !== 'horas') {
        return false;
    }

    const trabalhoInicio = getTimeMinutesDashboard(schedule.trabalhoInicio);
    const trabalhoFim = getTimeMinutesDashboard(schedule.trabalhoFim);
    const almocoInicio = getTimeMinutesDashboard(schedule.almocoInicio);
    const almocoFim = getTimeMinutesDashboard(schedule.almocoFim);

    if (trabalhoInicio === null || trabalhoFim === null) {
        return false;
    }

    const dentroDoTrabalho = minutosAtuais >= trabalhoInicio && minutosAtuais < trabalhoFim;
    const estaNoAlmoco = almocoInicio !== null && almocoFim !== null && minutosAtuais >= almocoInicio && minutosAtuais < almocoFim;

    if (!dentroDoTrabalho || estaNoAlmoco) {
        return false;
    }

    if (periodoTipo === 'horas') {
        const horaInicio = getTimeMinutesDashboard(ausencia?.horaInicio || ausencia?.HoraInicio);
        const horaFim = getTimeMinutesDashboard(ausencia?.horaFim || ausencia?.HoraFim);

        if (horaInicio !== null && horaFim !== null && minutosAtuais >= horaInicio && minutosAtuais < horaFim) {
            return false;
        }
    }

    return tipo !== 'ferias' && tipo !== 'folga' && tipo !== 'ausencia';
}

// Restringe uma lista de colaboradores aos setores de "Meus setores" (a
// preferencia por usuario, servida por meus-setores.js). Lista vazia de
// preferencia = ver todos (sem filtro).
function filtrarColaboradoresPorSetorDashboard(lista) {
    const base = Array.isArray(lista) ? lista : [];
    const meusSetores = typeof window.getMeusSetores === 'function' ? window.getMeusSetores() : [];

    if (!meusSetores.length) {
        return base;
    }

    const permitidos = new Set(meusSetores.map(String));

    return base.filter((colaborador) => permitidos.has(String(getDashboardSetorId(colaborador) ?? '')));
}

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

    const plantaoSemEquipe = proximosPlantoes.filter((plantao) => !Array.isArray(plantao.colaboradores) || plantao.colaboradores.length === 0).length;
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
        proximosPlantoes: proximosPlantoes.length,
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

function gerarAlertas(metricas, dataHoje, jornadaSemanalIndex, colaboradoresBase = window.colaboradores || []) {
    const alertas = [];
    const colaboradores = Array.isArray(colaboradoresBase) ? colaboradoresBase : [];
    const ausenciasHoje = obterAusenciasNaData(dataHoje);

    const semJornadaNemPadrao = colaboradores.filter((colaborador) => {
        const colaboradorId = Number(colaborador.Id || colaborador.id || 0);
        return !jornadaSemanalIndex.has(colaboradorId) && !hasColaboradorHorarioPadrao(colaborador);
    });

    if (semJornadaNemPadrao.length > 0) {
        alertas.push({
            tipo: 'warning',
            icone: 'clock',
            titulo: `${semJornadaNemPadrao.length} colaborador(es) sem jornada definida`,
            descricao: 'Cadastre jornada semanal ou horario padrao para manter a escala consistente.'
        });
    }

    const apenasPadraoSemJornada = colaboradores.filter((colaborador) => {
        const colaboradorId = Number(colaborador.Id || colaborador.id || 0);
        return !jornadaSemanalIndex.has(colaboradorId) && hasColaboradorHorarioPadrao(colaborador);
    });

    if (apenasPadraoSemJornada.length > 0) {
        alertas.push({
            tipo: 'warning',
            icone: 'calendar-week',
            titulo: `${apenasPadraoSemJornada.length} colaborador(es) usando apenas horario padrao`,
            descricao: 'Considere completar a jornada semanal para dias flexiveis e fins de semana.'
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
        { label: 'Férias', valor: tipos.ferias, cor: '#0d9488' },
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

function gerarGraficoOcupacao(dataHoje, jornadaSemanalIndex, colaboradoresBase = window.colaboradores || []) {
    const ocupacao = [];
    const colaboradores = Array.isArray(colaboradoresBase) ? colaboradoresBase : [];
    const horariosAtivos = colaboradores
        .map((colaborador) => getColaboradorScheduleForDate(colaborador, dataHoje, jornadaSemanalIndex))
        .filter(Boolean);
    const earliest = horariosAtivos
        .map((item) => getTimeMinutesDashboard(item.trabalhoInicio))
        .filter((value) => Number.isFinite(value));
    const latest = horariosAtivos
        .map((item) => getTimeMinutesDashboard(item.trabalhoFim))
        .filter((value) => Number.isFinite(value));
    const startHour = earliest.length > 0 ? Math.max(0, Math.floor(Math.min(...earliest) / 60)) : 7;
    const endHour = latest.length > 0 ? Math.min(23, Math.ceil(Math.max(...latest) / 60) - 1) : 18;

    for (let hora = startHour; hora <= endHour; hora += 1) {
        const minutos = hora * 60;
        const contagem = colaboradores.filter(
            (colaborador) => colaboradorDisponivelAgora(colaborador, minutos, dataHoje, jornadaSemanalIndex)
        ).length;
        ocupacao.push({ hora, contagem });
    }

    const maxContagem = Math.max(...ocupacao.map((item) => item.contagem), 1);

    return `
        <div style="display: flex; align-items: flex-end; gap: 8px; height: 180px; padding: 10px 0;">
            ${ocupacao.map((item) => `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <div style="width: 100%; height: ${(item.contagem / maxContagem) * 120}px; background: linear-gradient(0deg, #1d63ed, #3f74be); border-radius: 8px 8px 0 0;"></div>
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
