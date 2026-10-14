import { API } from '../api.js';
import { ESCALA_CORES_PADRAO, ESCALA_CORES_STORAGE_KEY } from '../app.js';
import { mostrarToast } from './horas-e-resumo.js';

export function getApiBaseUrl() {
    if (API?.baseURL) {
        return API.baseURL;
    }

    const origin = window.location.origin && window.location.origin !== 'null'
        ? window.location.origin
        : 'http://localhost:4450';

    return `${origin.replace(/\/$/, '')}/api`;
}

function normalizarCorHex(value, fallback = '#3f74be') {
    const raw = String(value || '').trim();

    if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
        return raw.toLowerCase();
    }

    if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
        return `#${raw.slice(1).split('').map((char) => char + char).join('')}`.toLowerCase();
    }

    return fallback;
}

function getCoresEscalaPadrao() {
    return ESCALA_CORES_PADRAO.reduce((acc, item) => {
        acc[item.key] = item.color;
        return acc;
    }, {});
}

function carregarCoresEscala() {
    let salvas = {};

    try {
        salvas = JSON.parse(localStorage.getItem(ESCALA_CORES_STORAGE_KEY) || '{}') || {};
    } catch (error) {
        salvas = {};
    }

    return ESCALA_CORES_PADRAO.reduce((acc, item) => {
        acc[item.key] = normalizarCorHex(salvas[item.key], item.color);
        return acc;
    }, {});
}

export function aplicarCoresEscala(cores = carregarCoresEscala()) {
    const root = document.documentElement;

    ESCALA_CORES_PADRAO.forEach((item) => {
        const color = normalizarCorHex(cores[item.key], item.color);
        root.style.setProperty(item.cssVar, color);

        if (item.strongVar) {
            // "strong" = a propria cor base: o degrade das celulas (base ->
            // strong) fica chapado, sem o "reflexo de luz"/aspecto glossy.
            root.style.setProperty(item.strongVar, color);
        }
    });
}

export function gerarConfiguracaoCoresEscalaHtml() {
    const cores = carregarCoresEscala();

    return ESCALA_CORES_PADRAO.map((item) => `
        <label class="escala-color-option" for="escalaCor_${item.key}">
            <span class="escala-color-icon" style="--escala-color-preview: ${cores[item.key]};">
                <i class="fas fa-${item.icon}"></i>
            </span>
            <span class="escala-color-text">
                <strong>${item.label}</strong>
                <small>${item.description}</small>
            </span>
            <input
                type="color"
                id="escalaCor_${item.key}"
                class="escala-color-input"
                value="${cores[item.key]}"
                data-escala-color-key="${item.key}"
                aria-label="Cor de ${item.label}"
            >
        </label>
    `).join('');
}

function atualizarInputsCoresEscala(cores = carregarCoresEscala()) {
    ESCALA_CORES_PADRAO.forEach((item) => {
        const input = document.getElementById(`escalaCor_${item.key}`);
        const preview = input?.closest('.escala-color-option')?.querySelector('.escala-color-icon');
        const color = normalizarCorHex(cores[item.key], item.color);

        if (input) {
            input.value = color;
        }

        if (preview) {
            preview.style.setProperty('--escala-color-preview', color);
        }
    });
}

function salvarCoresEscala() {
    const cores = {};

    ESCALA_CORES_PADRAO.forEach((item) => {
        const input = document.getElementById(`escalaCor_${item.key}`);
        cores[item.key] = normalizarCorHex(input?.value, item.color);
    });

    localStorage.setItem(ESCALA_CORES_STORAGE_KEY, JSON.stringify(cores));
    aplicarCoresEscala(cores);
    atualizarInputsCoresEscala(cores);
    mostrarToast('Cores da escala salvas!', 'success');
}

function resetarCoresEscala() {
    localStorage.removeItem(ESCALA_CORES_STORAGE_KEY);
    const coresPadrao = getCoresEscalaPadrao();

    aplicarCoresEscala(coresPadrao);
    atualizarInputsCoresEscala(coresPadrao);
    mostrarToast('Cores padrao restauradas!', 'success');
}

export function inicializarPersonalizacaoEscala() {
    const inputs = document.querySelectorAll('[data-escala-color-key]');

    inputs.forEach((input) => {
        input.addEventListener('input', () => {
            const cores = carregarCoresEscala();

            inputs.forEach((currentInput) => {
                const key = currentInput.getAttribute('data-escala-color-key');
                cores[key] = normalizarCorHex(currentInput.value, cores[key]);
            });

            aplicarCoresEscala(cores);
            atualizarInputsCoresEscala(cores);
        });
    });

    document.getElementById('salvarCoresEscalaBtn')?.addEventListener('click', salvarCoresEscala);
    document.getElementById('resetarCoresEscalaBtn')?.addEventListener('click', resetarCoresEscala);
    atualizarInputsCoresEscala();
}
