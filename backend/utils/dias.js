/* Classificacao de datas — a regra unica de "que tipo de dia e este".
 *
 * Antes deste modulo cada area decidia por conta propria: o plantao consultava
 * a tabela Feriados, a escala e o banco de horas olhavam so o dia da semana, e
 * o frontend ainda misturava a BrasilAPI. O resultado era um feriado valer para
 * o plantao e nao valer para a escala.
 *
 * A tabela Feriados e a UNICA autoridade. A BrasilAPI serve para importar
 * feriados nacionais para dentro dela, nunca para decidir em tempo de execucao:
 * decisao que depende de rede fica sujeita a mudar quando a rede muda.
 *
 * Feriado tem PRECEDENCIA sobre o dia da semana. Um feriado que cai no sabado
 * e 'feriado', nao 'sabado' — quem pergunta "posso lancar plantao?" recebe sim
 * nos dois casos, mas quem pergunta "que dia e esse?" precisa da resposta mais
 * especifica.
 */

const { normalizeIsoDate } = require('./validation');

// Abrangencia do feriado. Hoje todos valem para a empresa inteira; a coluna
// existe para identificar a origem no cadastro e nos relatorios.
const TIPOS_FERIADO = Object.freeze(['nacional', 'estadual', 'municipal']);
const TIPO_FERIADO_PADRAO = 'municipal';

const TIPOS_DIA = Object.freeze(['util', 'sabado', 'domingo', 'feriado']);

function normalizarTipoFeriado(valor) {
    const normalizado = String(valor ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');

    return TIPOS_FERIADO.includes(normalizado) ? normalizado : TIPO_FERIADO_PADRAO;
}

// Meio-dia UTC evita o deslocamento de fuso que faz uma data "andar" um dia.
function diaDaSemana(dataISO) {
    const [ano, mes, dia] = normalizeIsoDate(dataISO, 'Data').split('-').map(Number);
    return new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0)).getUTCDay();
}

/* Indice de feriados por data ISO. Aceita as varias formas em que a tabela e a
 * API entregam a linha (Data/data/date, Nome/nome/name, Tipo/tipo). */
function criarIndiceFeriados(linhas) {
    const indice = new Map();

    for (const linha of Array.isArray(linhas) ? linhas : []) {
        if (!linha) {
            continue;
        }

        const bruto = linha.Data ?? linha.data ?? linha.date ?? linha.dataISO ?? null;

        if (!bruto) {
            continue;
        }

        const dataISO = String(bruto instanceof Date ? bruto.toISOString() : bruto).slice(0, 10);

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO) || indice.has(dataISO)) {
            continue;
        }

        indice.set(dataISO, {
            dataISO,
            nome: String(linha.Nome ?? linha.nome ?? linha.name ?? 'Feriado').trim() || 'Feriado',
            tipo: normalizarTipoFeriado(linha.Tipo ?? linha.tipo)
        });
    }

    return indice;
}

/* A resposta unica sobre uma data.
 *
 * geraJornadaPadrao e o campo que muda o comportamento da escala: feriado passa
 * a se comportar como fim de semana — ninguem trabalha por padrao, so quem tem
 * lancamento explicito (plantao) aparece no dia.
 */
function classificarDia(dataISO, feriados = null) {
    const normalizada = normalizeIsoDate(dataISO, 'Data');
    const indice = feriados instanceof Map ? feriados : criarIndiceFeriados(feriados);
    const feriado = indice.get(normalizada) || null;
    const weekday = diaDaSemana(normalizada);
    const ehSabado = weekday === 6;
    const ehDomingo = weekday === 0;
    const ehFimDeSemana = ehSabado || ehDomingo;

    const tipo = feriado
        ? 'feriado'
        : (ehSabado ? 'sabado' : (ehDomingo ? 'domingo' : 'util'));

    return {
        dataISO: normalizada,
        tipo,
        weekday,
        ehFeriado: Boolean(feriado),
        nomeFeriado: feriado ? feriado.nome : null,
        tipoFeriado: feriado ? feriado.tipo : null,
        ehSabado,
        ehDomingo,
        ehFimDeSemana,
        // Dia util de verdade: nem fim de semana, nem feriado. E o que o banco
        // de horas precisa para nao cobrar jornada de um dia que nao existe.
        ehDiaUtil: !ehFimDeSemana && !feriado,
        geraJornadaPadrao: !ehFimDeSemana && !feriado,
        permitePlantao: ehFimDeSemana || Boolean(feriado)
    };
}

module.exports = {
    TIPOS_DIA,
    TIPOS_FERIADO,
    TIPO_FERIADO_PADRAO,
    classificarDia,
    criarIndiceFeriados,
    diaDaSemana,
    normalizarTipoFeriado
};
