/* eslint-disable */
// Constantes e helpers de data/hora compartilhados entre o editor de Escala do Dia
// (escala-dia-editor.js), o motor de Relatorio de Escala (escala-relatorio.js) e o
// Relatorio de Plantoes que continua em core/runtime/plantao-colaboradores/. Script global (sem IIFE)
// de proposito: os tres consumidores referenciam estes nomes como identificadores
// soltos, entao precisam ficar no escopo global, carregado antes de todos eles.

    const HORA_INICIAL = 7;
    const HORA_FINAL = 18;
    const ESCALA_EDITOR_MINUTO_INICIAL = 6 * 60;
    const ESCALA_EDITOR_MINUTO_FINAL = 22 * 60;
    const ESCALA_EDITOR_PASSO_MINUTOS = 15;
    const ESCALA_EDITOR_ALMOCO_PADRAO_MINUTOS = 60;
    const DIA_LABELS = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
    const TIPO_LABELS = {
        normal: 'Normal',
        plantao: 'Plantao',
        folga: 'Folga',
        ferias: 'Ferias',
        ausencia: 'Ausencia',
        ajuste: 'Ajuste',
        domingo_folgado: 'Domingo folgado',
        reposicao: 'Reposicao',
        folga_compensatoria: 'Folga compensatoria',
        cobertura: 'Cobertura'
    };

    // Dias em que a pessoa NAO trabalha: nao levam horario, aparecem como
    // faixa em vez de barra na timeline e ficam fora do quadro mensal.
    // Uma lista so, porque antes cada tela repetia ['folga','ferias','ausencia']
    // no braco e um tipo novo teria que ser lembrado em cada uma delas.
    const TIPOS_SEM_TRABALHO = ['folga', 'ferias', 'ausencia', 'domingo_folgado', 'folga_compensatoria'];

    function ehTipoSemTrabalho(tipo) {
        return TIPOS_SEM_TRABALHO.includes(String(tipo || '').trim().toLowerCase());
    }
    const RELATORIO_ESCALA_MODOS = {
        QUADRO_MENSAL: 'quadro_mensal',
        DETALHADO: 'detalhado'
    };
    const MESES_LABELS = [
        'Janeiro',
        'Fevereiro',
        'Marco',
        'Abril',
        'Maio',
        'Junho',
        'Julho',
        'Agosto',
        'Setembro',
        'Outubro',
        'Novembro',
        'Dezembro'
    ];
    const ESCALA_QUADRO_WEEKDAY_HEADERS = [
        'SEGUNDA-FEIRA',
        'TERCA-FEIRA',
        'QUARTA-FEIRA',
        'QUINTA-FEIRA',
        'SEXTA-FEIRA',
        'SABADO',
        'DOMINGO'
    ];

    function buildEscalaMonthOptions(selectedMonth) {
        return MESES_LABELS.map((label, index) => {
            const month = index + 1;
            const selected = month === Number(selectedMonth) ? 'selected' : '';
            return `<option value="${month}" ${selected}>${label}</option>`;
        }).join('');
    }

    function toISODateEscala(value) {
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

        const isUtcMidnight = date.getUTCHours() === 0
            && date.getUTCMinutes() === 0
            && date.getUTCSeconds() === 0
            && date.getUTCMilliseconds() === 0;
        const isLocalMidnight = date.getHours() === 0
            && date.getMinutes() === 0
            && date.getSeconds() === 0
            && date.getMilliseconds() === 0;
        const useUtcDate = isUtcMidnight && !isLocalMidnight;
        const year = useUtcDate ? date.getUTCFullYear() : date.getFullYear();
        const month = String((useUtcDate ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0');
        const day = String(useUtcDate ? date.getUTCDate() : date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatDatePtBrEscala(dataISO) {
        const normalized = toISODateEscala(dataISO);

        if (!normalized) {
            return '--';
        }

        const [year, month, day] = normalized.split('-');
        return `${day}/${month}/${year}`;
    }

    function formatTimeInputEscala(value) {
        if (!value) {
            return '';
        }

        const raw = String(value);

        if (raw.includes('T')) {
            const match = raw.match(/T(\d{2}:\d{2})/);
            return match ? match[1] : '';
        }

        return raw.includes(':') ? raw.slice(0, 5) : '';
    }

    function formatTimeRangeEscala(inicio, fim) {
        const formattedStart = formatTimeInputEscala(inicio);
        const formattedEnd = formatTimeInputEscala(fim);

        if (!formattedStart || !formattedEnd) {
            return '--';
        }

        return `${formattedStart} às ${formattedEnd}`;
    }

    function getTimeMinutesEscala(value) {
        const formatted = formatTimeInputEscala(value);

        if (!formatted) {
            return null;
        }

        const [hours, minutes] = formatted.split(':').map(Number);
        return (hours * 60) + minutes;
    }

    function formatMinutesToTimeEscala(totalMinutes) {
        if (!Number.isFinite(totalMinutes)) {
            return '';
        }

        const safeMinutes = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
        const hours = String(Math.floor(safeMinutes / 60)).padStart(2, '0');
        const minutes = String(safeMinutes % 60).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    function clampMinutesEscala(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function roundMinutesEscala(value, step = ESCALA_EDITOR_PASSO_MINUTOS) {
        if (!Number.isFinite(value)) {
            return value;
        }

        return Math.round(value / step) * step;
    }

    function formatDurationEscala(totalMinutes) {
        const safeMinutes = Math.max(Number(totalMinutes) || 0, 0);
        const hours = Math.floor(safeMinutes / 60);
        const minutes = safeMinutes % 60;

        if (minutes === 0) {
            return `${hours}h`;
        }

        return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    }

    function getIsoDayOfWeekEscala(dataISO) {
        const normalized = toISODateEscala(dataISO);

        if (!normalized) {
            return new Date().getDay();
        }

        const [year, month, day] = normalized.split('-').map(Number);
        return new Date(year, month - 1, day, 12, 0, 0).getDay();
    }

    function getDayLabelEscala(dataISO) {
        return DIA_LABELS[getIsoDayOfWeekEscala(dataISO)] || '';
    }

    function getMonthBoundsEscala(dataISO) {
        const normalized = toISODateEscala(dataISO) || toISODateEscala(new Date());
        const [year, month] = normalized.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();

        return {
            start: `${year}-${String(month).padStart(2, '0')}-01`,
            end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        };
    }

