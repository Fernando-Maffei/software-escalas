// Gravacao em lote de linhas de escala_dia.
//
// Gerar a escala de um periodo cria uma linha por colaborador por dia; gravada
// uma a uma, o primeiro acesso a um mes com 30 pessoas eram ~660 idas ao banco.
// Aqui as linhas vao num MERGE com varias linhas por comando.
//
// E MERGE (e nao INSERT) de proposito: tem a mesma semantica, linha a linha,
// do MERGE de persistEscalaDiaRecord. Uma linha que ja existe no banco mas nao
// estava no mapa de quem chama (ex.: colaborador desligado, que a leitura da
// escala esconde) e atualizada, como antes — um INSERT esbarraria no indice
// unico UX_escala_dia_colaborador_data.
//
// Recebe linhas ja validadas por prepararLinhaEscalaDia (escala.js).
const { sql } = require('../db');

// Campo da linha preparada, coluna da tabela e tipo do parametro. A ordem e a
// das colunas no MERGE.
const COLUNAS = Object.freeze([
    { campo: 'colaboradorId', coluna: 'colaborador_id', tipo: sql.Int },
    { campo: 'data', coluna: 'data', tipo: sql.Date },
    { campo: 'horaInicio', coluna: 'hora_inicio', tipo: sql.Time },
    { campo: 'horaFim', coluna: 'hora_fim', tipo: sql.Time },
    { campo: 'almocoInicio', coluna: 'almoco_inicio', tipo: sql.Time },
    { campo: 'almocoFim', coluna: 'almoco_fim', tipo: sql.Time },
    { campo: 'tipo', coluna: 'tipo', tipo: sql.NVarChar(30) },
    { campo: 'observacao', coluna: 'observacao', tipo: sql.NVarChar(500) },
    { campo: 'origemTipo', coluna: 'origem_tipo', tipo: sql.NVarChar(30) },
    { campo: 'origemId', coluna: 'origem_id', tipo: sql.Int },
    { campo: 'ajusteManual', coluna: 'ajuste_manual', tipo: sql.Bit },
    { campo: 'almocoAjustado', coluna: 'almoco_ajustado', tipo: sql.Bit }
]);

// O SQL Server aceita ate 2100 parametros por comando: 12 por linha x 150 = 1800.
const LINHAS_POR_LOTE = 150;

const COLUNAS_ATUALIZADAS = COLUNAS.slice(2).map(({ coluna }) => `${coluna} = source.${coluna}`);
const NOMES_COLUNAS = COLUNAS.map(({ coluna }) => coluna).join(', ');
const VALORES_SOURCE = COLUNAS.map(({ coluna }) => `source.${coluna}`).join(', ');

function montarMerge(linhasValues) {
    return `
        MERGE escala_dia AS target
        USING (VALUES
            ${linhasValues.join(',\n            ')}
        ) AS source (${NOMES_COLUNAS})
        ON target.colaborador_id = source.colaborador_id
           AND target.data = source.data
        WHEN MATCHED THEN UPDATE SET
            ${COLUNAS_ATUALIZADAS.join(',\n            ')},
            atualizado_em = GETDATE()
        WHEN NOT MATCHED THEN INSERT (${NOMES_COLUNAS})
            VALUES (${VALORES_SOURCE})
        OUTPUT INSERTED.*;
    `;
}

// Devolve as linhas gravadas (OUTPUT INSERTED.*), na ordem que o banco der —
// quem chama casa pela chave colaborador + data.
async function mergeEscalaDiaEmLote(poolOrTx, linhas) {
    const gravadas = [];

    for (let inicio = 0; inicio < linhas.length; inicio += LINHAS_POR_LOTE) {
        const lote = linhas.slice(inicio, inicio + LINHAS_POR_LOTE);
        const request = poolOrTx.request();
        const linhasValues = lote.map((linha, indice) => {
            const parametros = COLUNAS.map(({ campo, tipo }) => {
                const nome = `${campo}${indice}`;
                request.input(nome, tipo, linha[campo]);
                return `@${nome}`;
            });

            return `(${parametros.join(', ')})`;
        });

        const result = await request.query(montarMerge(linhasValues));
        gravadas.push(...result.recordset);
    }

    return gravadas;
}

module.exports = {
    LINHAS_POR_LOTE,
    mergeEscalaDiaEmLote
};
