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
                <span class="alert-title">${escapeHtml(alerta.titulo)}</span>
                <span class="alert-description">${escapeHtml(alerta.descricao)}</span>
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

