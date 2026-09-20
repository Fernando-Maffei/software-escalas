(function initRuntimeNormalizationHelpers(root) {
    if (root.__runtimeNormalizationHelpersLoaded) {
        return;
    }

    root.__runtimeNormalizationHelpersLoaded = true;

    root.normalizeRuntimeToken = function normalizeRuntimeToken(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\s-]+/g, '_')
            .replace(/_+/g, '_');
    };

    root.normalizeRuntimeAusenciaTipo = function normalizeRuntimeAusenciaTipo(value) {
        const token = root.normalizeRuntimeToken(value);

        if (token.startsWith('ferias')) {
            return 'ferias';
        }

        if (token.startsWith('folga')) {
            return 'folga';
        }

        if (token.startsWith('ausencia')) {
            return 'ausencia';
        }

        return 'ausencia';
    };

    root.normalizeRuntimePeriodoTipo = function normalizeRuntimePeriodoTipo(value) {
        const token = root.normalizeRuntimeToken(value);
        return token === 'horas' ? 'horas' : 'dia_inteiro';
    };

    // Precisa casar com ESCALA_TIPOS de backend/services/escala.js.
    root.RUNTIME_ESCALA_TIPOS = [
        'normal', 'plantao', 'folga', 'ferias', 'ausencia', 'ajuste',
        'domingo_folgado', 'reposicao', 'folga_compensatoria', 'cobertura'
    ];

    root.normalizeRuntimeEscalaTipo = function normalizeRuntimeEscalaTipo(value) {
        const token = root.normalizeRuntimeToken(value);

        // Valor exato PRIMEIRO: os startsWith abaixo cobrem dado legado, mas
        // 'folga_compensatoria' comeca com 'folga' e viraria 'folga', perdendo
        // a distincao em silencio.
        if (root.RUNTIME_ESCALA_TIPOS.includes(token)) {
            return token;
        }

        if (token.startsWith('plantao')) {
            return 'plantao';
        }

        if (token.startsWith('folga')) {
            return 'folga';
        }

        if (token.startsWith('ferias')) {
            return 'ferias';
        }

        if (token.startsWith('ausencia')) {
            return 'ausencia';
        }

        if (token.startsWith('ajuste')) {
            return 'ajuste';
        }

        return 'normal';
    };
}(window));

