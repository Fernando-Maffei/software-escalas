import { estado } from '../../core/estado.js';
import { formatarDataBR } from '../../core/runtime/relatorio-mensal.js';
import { escapeHtml } from '../../lib/html-seguro.js';
import { iconeTipoLancamento } from '../../lib/tipos-lancamento.js';
import { toISODate } from './datas-e-jornada.js';

export async function buscarProximosEventos() {
    const eventos = [];
    const hoje = new Date();

    const periodo = Array.from({ length: 30 }, (_, index) => {
        const data = new Date(hoje);
        data.setDate(hoje.getDate() + index);
        return toISODate(data);
    });

    periodo.forEach((dataISO) => {
        (estado.feriados || []).filter((feriado) => feriado.date === dataISO).forEach((feriado) => {
            eventos.push({
                dataStr: dataISO,
                data: new Date(`${dataISO}T12:00:00`),
                titulo: feriado.name,
                subtitulo: 'Feriado nacional',
                tipo: 'feriado',
                isPeriodo: false
            });
        });

        (estado.feriadosLocais || []).filter((feriado) => toISODate(feriado.Data || feriado.data) === dataISO).forEach((feriado) => {
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

    (estado.ausencias || []).forEach((ausencia) => {
        const inicio = toISODate(ausencia.DataInicio || ausencia.dataInicio);
        const fim = toISODate(ausencia.DataFim || ausencia.dataFim);
        const tipo = String(ausencia.tipo || ausencia.Tipo || '').toLowerCase();
        const colaborador = (estado.colaboradores || []).find((item) => item.Id === (ausencia.colaboradorId || ausencia.ColaboradorId));

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

export function gerarEventItem(evento) {
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
                <div class="event-title">${escapeHtml(evento.titulo)}</div>
                <div class="event-subtitle">${escapeHtml(evento.subtitulo)}</div>
            </div>
            <span class="event-badge ${badgeClass}">${iconeTipoLancamento(badgeClass)} ${badgeText}</span>
        </div>
    `;
}
