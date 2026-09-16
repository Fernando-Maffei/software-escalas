// Feriados nacionais calculados aqui, sem depender do banco nem de internet.
//
// Antes eles eram gravados na tabela Feriados pelo script de dados de exemplo,
// e o front-end tambem buscava a mesma lista na BrasilAPI — o mesmo feriado
// vinha de duas fontes e aparecia duplicado. O banco passa a guardar somente
// feriado municipal/estadual (o que nao da para calcular); os nacionais saem
// daqui, inclusive para decidir o tipo do plantao (ver utils/plantoes.js).
//
// Datas moveis derivam do domingo de Pascoa: Carnaval (terca) 47 dias antes,
// Sexta-feira Santa 2 dias antes e Corpus Christi 60 dias depois.

const FERIADOS_FIXOS = Object.freeze([
    { mes: 1, dia: 1, nome: 'Confraternização Universal' },
    { mes: 4, dia: 21, nome: 'Tiradentes' },
    { mes: 5, dia: 1, nome: 'Dia do Trabalho' },
    { mes: 9, dia: 7, nome: 'Independência do Brasil' },
    { mes: 10, dia: 12, nome: 'Nossa Senhora Aparecida' },
    { mes: 11, dia: 2, nome: 'Finados' },
    { mes: 11, dia: 15, nome: 'Proclamação da República' },
    { mes: 12, dia: 25, nome: 'Natal' }
]);

// Lei 14.759/2023: 20 de novembro virou feriado nacional a partir de 2024.
const ANO_INICIAL_CONSCIENCIA_NEGRA = 2024;

const cachePorAno = new Map();

function toISO(ano, mes, dia) {
    return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function somarDias(ano, mes, dia, dias) {
    const data = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
    data.setUTCDate(data.getUTCDate() + dias);

    return {
        ano: data.getUTCFullYear(),
        mes: data.getUTCMonth() + 1,
        dia: data.getUTCDate()
    };
}

// Algoritmo gregoriano anonimo (Meeus/Jones/Butcher).
function calcularDomingoDePascoa(ano) {
    const anoNumero = Number(ano);

    if (!Number.isInteger(anoNumero) || anoNumero < 1583) {
        throw new Error(`Ano invalido para calcular a Pascoa: ${ano}`);
    }

    const a = anoNumero % 19;
    const b = Math.floor(anoNumero / 100);
    const c = anoNumero % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = ((19 * a) + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + (2 * e) + (2 * i) - h - k) % 7;
    const m = Math.floor((a + (11 * h) + (22 * l)) / 451);
    const mes = Math.floor((h + l - (7 * m) + 114) / 31);
    const dia = ((h + l - (7 * m) + 114) % 31) + 1;

    return { ano: anoNumero, mes, dia };
}

// Feriados nacionais do ano, ordenados por data: [{ data: 'YYYY-MM-DD', nome }].
function feriadosNacionaisDoAno(ano) {
    const anoNumero = Number(ano);

    if (!Number.isInteger(anoNumero) || anoNumero < 1583) {
        return [];
    }

    if (cachePorAno.has(anoNumero)) {
        return cachePorAno.get(anoNumero);
    }

    const pascoa = calcularDomingoDePascoa(anoNumero);
    const movel = (dias, nome) => {
        const { ano: a, mes, dia } = somarDias(pascoa.ano, pascoa.mes, pascoa.dia, dias);
        return { data: toISO(a, mes, dia), nome };
    };

    const lista = [
        ...FERIADOS_FIXOS.map(({ mes, dia, nome }) => ({ data: toISO(anoNumero, mes, dia), nome })),
        movel(-47, 'Carnaval'),
        movel(-2, 'Sexta-feira Santa'),
        movel(60, 'Corpus Christi')
    ];

    if (anoNumero >= ANO_INICIAL_CONSCIENCIA_NEGRA) {
        lista.push({ data: toISO(anoNumero, 11, 20), nome: 'Dia da Consciência Negra' });
    }

    const ordenada = Object.freeze(
        lista
            .sort((um, outro) => um.data.localeCompare(outro.data))
            .map((item) => Object.freeze(item))
    );

    cachePorAno.set(anoNumero, ordenada);
    return ordenada;
}

// Nome do feriado nacional na data ISO, ou null. So aceita 'YYYY-MM-DD' —
// quem chama normaliza a data antes (normalizeIsoDate).
function nomeFeriadoNacional(dataISO) {
    const iso = String(dataISO || '').slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        return null;
    }

    const encontrado = feriadosNacionaisDoAno(Number(iso.slice(0, 4)))
        .find((item) => item.data === iso);

    return encontrado ? encontrado.nome : null;
}

function isFeriadoNacional(dataISO) {
    return nomeFeriadoNacional(dataISO) !== null;
}

// Datas ISO dos feriados nacionais que caem em [inicioISO, fimISO], como Set.
function feriadosNacionaisNoPeriodo(inicioISO, fimISO) {
    const inicio = String(inicioISO || '').slice(0, 10);
    const fim = String(fimISO || '').slice(0, 10);
    const datas = new Set();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim) || fim < inicio) {
        return datas;
    }

    const anoInicial = Number(inicio.slice(0, 4));
    const anoFinal = Number(fim.slice(0, 4));

    for (let ano = anoInicial; ano <= anoFinal; ano += 1) {
        for (const item of feriadosNacionaisDoAno(ano)) {
            if (item.data >= inicio && item.data <= fim) {
                datas.add(item.data);
            }
        }
    }

    return datas;
}

module.exports = {
    calcularDomingoDePascoa,
    feriadosNacionaisDoAno,
    feriadosNacionaisNoPeriodo,
    isFeriadoNacional,
    nomeFeriadoNacional
};
