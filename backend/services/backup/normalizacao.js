// Le um arquivo de backup (qualquer um dos tres formatos aceitos) e devolve as
// linhas prontas para inserir, validadas e com os tipos do SQL Server.
//
// A normalizacao e guiada pela especificacao (especificacao.js): cada coluna
// sabe seu tipo e seus nomes alternativos. As regras de negocio que o arquivo
// antigo aplicava por tabela continuam aqui, em AJUSTES_POR_TABELA.
const { sql } = require('../../db');
const { AppError } = require('../../lib/errors');
const {
    ensurePositiveInt,
    extractDateString,
    extractTimeString,
    normalizeBoolean,
    normalizeEnum,
    normalizeIsoDate,
    normalizeNullableTime,
    normalizeOptionalText,
    toSqlTime,
    validateWorkSchedule
} = require('../../lib/validation');
const { normalizeSubtipo, resolveDefaultDescontaBancoHoras } = require('../bancoHoras');
const { ESCALA_TIPOS } = require('../escala');
const { normalizeDiaSemana } = require('../jornada-semanal');
const { normalizeColaboradores, resolvePlantaoTypeByDate } = require('../plantoes');
const { NOMES_TABELAS_BACKUP, TABELAS_BACKUP, TIPO } = require('./especificacao');

const AUSENTE = undefined;

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function estaVazio(valor) {
    return valor === undefined || valor === null || String(valor).trim() === '';
}

// Primeiro nome da coluna (ou apelido) presente na linha. Chave ausente e
// diferente de chave com null: ausente deixa o banco aplicar o DEFAULT.
function lerBruto(linha, coluna) {
    for (const apelido of coluna.apelidos) {
        if (Object.prototype.hasOwnProperty.call(linha, apelido) && linha[apelido] !== undefined) {
            return linha[apelido];
        }
    }

    return AUSENTE;
}

function normalizarData(valor, rotulo) {
    const extraida = extractDateString(valor);

    if (!extraida) {
        throw new AppError(400, `${rotulo} invalida no arquivo de backup.`);
    }

    return normalizeIsoDate(extraida, rotulo);
}

function normalizarDataHora(valor, rotulo) {
    const data = valor instanceof Date ? valor : new Date(String(valor));

    if (Number.isNaN(data.getTime())) {
        throw new AppError(400, `${rotulo} invalido no arquivo de backup.`);
    }

    return data;
}

function normalizarHora(valor, rotulo) {
    const extraida = extractTimeString(valor) || String(valor).trim();
    return toSqlTime(normalizeNullableTime(extraida, rotulo), rotulo);
}

function normalizarInteiro(valor, rotulo) {
    const numero = Number(valor);

    if (!Number.isInteger(numero)) {
        throw new AppError(400, `${rotulo} invalido no arquivo de backup.`);
    }

    return numero;
}

function normalizarEquipe(valor, rotulo) {
    let lista = valor;

    if (typeof lista === 'string') {
        try {
            lista = JSON.parse(lista);
        } catch (erro) {
            throw new AppError(400, `${rotulo} esta invalido no backup.`);
        }
    }

    return JSON.stringify(normalizeColaboradores(lista));
}

function normalizarValor(coluna, bruto, rotulo) {
    if (estaVazio(bruto)) {
        if (coluna.tipo === TIPO.EQUIPE_PLANTAO) {
            return '[]';
        }

        return null;
    }

    switch (coluna.tipo) {
        case TIPO.ID:
            return ensurePositiveInt(bruto, rotulo);
        case TIPO.INT:
            return normalizarInteiro(bruto, rotulo);
        case TIPO.DIA_SEMANA:
            return normalizeDiaSemana(bruto, rotulo);
        case TIPO.BIT:
            return normalizeBoolean(bruto, rotulo);
        case TIPO.DATA:
            return normalizarData(bruto, rotulo);
        case TIPO.DATA_HORA:
            return normalizarDataHora(bruto, rotulo);
        case TIPO.HORA:
            return normalizarHora(bruto, rotulo);
        case TIPO.EQUIPE_PLANTAO:
            return normalizarEquipe(bruto, rotulo);
        case TIPO.TEXTO:
            return coluna.enumeracao
                ? normalizeEnum(bruto, rotulo, coluna.enumeracao)
                : normalizeOptionalText(bruto, rotulo, { maxLength: coluna.max || 255 });
        default:
            throw new AppError(500, `Tipo de coluna de backup desconhecido: ${coluna.tipo}.`);
    }
}

function tipoSql(coluna) {
    switch (coluna.tipo) {
        case TIPO.ID:
        case TIPO.INT:
            return sql.Int;
        case TIPO.DIA_SEMANA:
            return sql.TinyInt;
        case TIPO.BIT:
            return sql.Bit;
        case TIPO.DATA:
            return sql.Date;
        case TIPO.DATA_HORA:
            return sql.DateTime;
        case TIPO.HORA:
            return sql.Time;
        case TIPO.EQUIPE_PLANTAO:
            return sql.NVarChar(sql.MAX);
        default:
            return sql.NVarChar(coluna.max || 255);
    }
}

function horaTexto(valor) {
    return valor ? extractTimeString(valor) : null;
}

function validarJornada(linha) {
    validateWorkSchedule({
        trabalhoInicio: horaTexto(linha.TrabalhoInicio),
        trabalhoFim: horaTexto(linha.TrabalhoFim),
        almocoInicio: horaTexto(linha.AlmocoInicio),
        almocoFim: horaTexto(linha.AlmocoFim)
    });
}

// Regras de negocio por tabela, alem do tipo de cada coluna. Recebem a linha
// ja normalizada (colunas ausentes = undefined) e podem completar padroes.
const AJUSTES_POR_TABELA = Object.freeze({
    Ausencias(linha) {
        linha.PeriodoTipo = linha.PeriodoTipo || 'dia_inteiro';
        linha.Subtipo =
            normalizeSubtipo(linha.Subtipo) ||
            (linha.Tipo === 'ferias' ? 'ferias' : linha.Tipo === 'folga' ? 'folga' : 'comum');

        if (linha.DescontaBancoHoras === AUSENTE || linha.DescontaBancoHoras === null) {
            linha.DescontaBancoHoras = resolveDefaultDescontaBancoHoras(linha.Tipo, linha.Subtipo);
        }

        if (linha.PeriodoTipo === 'horas' && (!linha.HoraInicio || !linha.HoraFim)) {
            throw new AppError(400, 'Ausencias por horas precisam de hora inicial e hora final no backup.');
        }
    },
    escala_dia(linha) {
        linha.tipo = normalizeEnum(linha.tipo || 'normal', 'Tipo da escala diaria', [...ESCALA_TIPOS], {
            defaultValue: 'normal'
        });
    },
    plantoes(linha) {
        // Backup antigo nao tinha tipo_plantao: o DEFAULT do banco ('sabado')
        // transformaria domingo e feriado em sabado. A data decide; dia util so
        // pode ser feriado (municipal/estadual, que nao da para calcular).
        if (!linha.tipo_plantao) {
            try {
                linha.tipo_plantao = resolvePlantaoTypeByDate(linha.data_plantao);
            } catch (erro) {
                linha.tipo_plantao = 'feriado';
            }
        }
    },
    Feriados(linha) {
        linha.Tipo = linha.Tipo || 'municipal';
    }
});

function normalizarLinha(especificacao, bruta, posicao) {
    if (!isPlainObject(bruta)) {
        throw new AppError(400, `Tabela ${especificacao.tabela} possui um registro invalido na posicao ${posicao}.`);
    }

    const linha = {};

    for (const coluna of especificacao.colunas) {
        const rotulo = `${especificacao.tabela}.${coluna.nome}`;
        const bruto = lerBruto(bruta, coluna);

        if (bruto === AUSENTE) {
            if (coluna.obrigatorio) {
                throw new AppError(400, `${rotulo} e obrigatorio no arquivo de backup (registro ${posicao}).`);
            }

            continue;
        }

        const valor = normalizarValor(coluna, bruto, rotulo);

        if (valor === null && coluna.obrigatorio) {
            throw new AppError(400, `${rotulo} e obrigatorio no arquivo de backup (registro ${posicao}).`);
        }

        linha[coluna.nome] = valor;
    }

    if (especificacao.jornada) {
        validarJornada(linha);
    }

    const ajustar = AJUSTES_POR_TABELA[especificacao.tabela];

    if (ajustar) {
        ajustar(linha);
    }

    return linha;
}

function lerArray(origem, chaves) {
    for (const chave of chaves) {
        if (Array.isArray(origem?.[chave])) {
            return origem[chave];
        }
    }

    return [];
}

// Tres formatos aceitos:
//   system  { metadata, data: { Tabela: [...] } }       (backup do sistema)
//   tables  { Tabela: [...] }                           (tabelas soltas)
//   legacy  { colaboradores: [...], ausencias: [...] }  (exportacao antiga)
function detectarFormato(payload) {
    if (isPlainObject(payload.data)) {
        return { formato: 'system', origem: payload.data };
    }

    if (NOMES_TABELAS_BACKUP.some((tabela) => Array.isArray(payload[tabela]))) {
        return { formato: 'tables', origem: payload };
    }

    if (Array.isArray(payload.colaboradores) || Array.isArray(payload.ausencias)) {
        return { formato: 'legacy', origem: payload };
    }

    throw new AppError(400, 'Arquivo invalido. Use um JSON gerado pelo sistema de backup ou pela exportacao antiga.');
}

function coerceBackupPayload(rawPayload = {}) {
    if (!isPlainObject(rawPayload)) {
        throw new AppError(400, 'O arquivo de backup esta invalido.');
    }

    const { formato, origem } = detectarFormato(rawPayload);
    const data = {};

    for (const especificacao of TABELAS_BACKUP) {
        // A exportacao antiga so tinha algumas colecoes, com nome em minusculo.
        const chaves =
            formato === 'legacy' ? [...especificacao.legado, especificacao.tabela] : [especificacao.tabela];
        const linhas = formato === 'legacy' && !especificacao.legado.length ? [] : lerArray(origem, chaves);

        data[especificacao.tabela] = linhas.map((linha, indice) => normalizarLinha(especificacao, linha, indice + 1));
    }

    return {
        format: formato,
        metadata: isPlainObject(rawPayload.metadata) ? rawPayload.metadata : {},
        preferences: isPlainObject(rawPayload.preferencias) ? rawPayload.preferencias : {},
        data
    };
}

module.exports = {
    coerceBackupPayload,
    normalizarLinha,
    tipoSql
};
