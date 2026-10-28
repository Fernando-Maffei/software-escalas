// O que muda numa cobertura quando outra parte do sistema muda depois dela:
//
//   - ausencia (ferias, folga, atestado) lancada para quem ESTA cobrindo: a
//     ausencia entra — a pessoa nao veio, nao ha o que recusar — e os
//     horarios que ela cobria naqueles dias voltam a pendente, para alguem
//     assumir (aparecem nas Pendencias e na tela Coberturas);
//   - desligamento de quem esta cobrindo: o mesmo, da data do desligamento
//     em diante;
//   - ferias/ausencia do TITULAR editada: a cobertura acompanha o periodo
//     novo. Dia que saiu leva os horarios dele junto; dia que entrou ganha o
//     horario do titular, pendente;
//   - feriado cadastrado, mudado ou apagado: o dia muda de natureza (dia util
//     <-> plantao), e o que a cobertura gerou naquele dia e refeito.
//
// Ausencia do titular APAGADA nao mexe na cobertura: a tela mostra "Ausencia
// removida" e quem decide se ela ainda vale e o administrador.
const { sql } = require('../db');
const { sincronizarMovimentosDaCobertura } = require('./cobertura-banco');
const { carregarFeriadosCadastrados, carregarJornadaDoTitular } = require('./cobertura-contexto');
const { gerarPlantoesDaCobertura, removerPlantoesDaCobertura } = require('./cobertura-plantoes');
const { gerarTrechosNecessarios, intervalosSeCruzam } = require('./cobertura-trechos');
const { exigirSemCoberturaSobreposta } = require('./coberturas');
const { extractDateString, extractTimeString, toSqlTime } = require('../lib/validation');

// Refaz tudo o que a cobertura gera, em volta de uma mudanca nos trechos.
async function refazerCobertura(tx, coberturaId, mudarTrechos) {
    const datasMexidas = await removerPlantoesDaCobertura(tx, coberturaId);
    await mudarTrechos();
    await sincronizarMovimentosDaCobertura(tx, coberturaId);
    await gerarPlantoesDaCobertura(tx, coberturaId, datasMexidas);
}

function serializarAfetado(linha) {
    return {
        coberturaId: Number(linha.CoberturaId),
        titularNome: linha.TitularNome ?? null,
        dataISO: extractDateString(linha.Data),
        horaInicio: extractTimeString(linha.HoraInicio),
        horaFim: extractTimeString(linha.HoraFim)
    };
}

// Devolve a pendente os trechos que `colaboradorId` cobria em
// [dataInicio, dataFim]. `horario` (ausencia por horas) limita aos trechos que
// cruzam aquele horario em cada dia. Devolve os trechos liberados.
async function liberarTrechosDoSubstituto(tx, colaboradorId, { dataInicio, dataFim, horario = null }) {
    const result = await tx.request()
        .input('colaboradorId', sql.Int, colaboradorId)
        .input('dataInicio', sql.Date, dataInicio)
        .input('dataFim', sql.Date, dataFim)
        .query(`
            SELECT t.Id, t.CoberturaId, t.Data, t.HoraInicio, t.HoraFim, titular.Nome AS TitularNome
            FROM CoberturaTrechos t
            INNER JOIN Coberturas c ON c.Id = t.CoberturaId
            INNER JOIN Colaboradores titular ON titular.Id = c.TitularId
            WHERE t.SubstitutoId = @colaboradorId
              AND t.Data BETWEEN @dataInicio AND @dataFim
            ORDER BY t.Data, t.HoraInicio
        `);

    const afetados = result.recordset.filter((linha) => !horario || intervalosSeCruzam(horario, {
        horaInicio: extractTimeString(linha.HoraInicio),
        horaFim: extractTimeString(linha.HoraFim)
    }));

    const porCobertura = new Map();

    for (const linha of afetados) {
        const id = Number(linha.CoberturaId);
        porCobertura.set(id, [...(porCobertura.get(id) || []), Number(linha.Id)]);
    }

    for (const [coberturaId, trechoIds] of porCobertura) {
        await refazerCobertura(tx, coberturaId, async () => {
            for (const trechoId of trechoIds) {
                await tx.request()
                    .input('id', sql.Int, trechoId)
                    .query(`
                        UPDATE CoberturaTrechos
                        SET SubstitutoId = NULL, TipoCredito = NULL, AtualizadoEm = GETDATE()
                        WHERE Id = @id
                    `);
            }
        });
    }

    return afetados.map(serializarAfetado);
}

// Ausencia (linha da tabela Ausencias) de quem pode estar cobrindo alguem.
async function liberarTrechosPorAusencia(tx, ausencia) {
    const porHoras = String(ausencia.PeriodoTipo || '').toLowerCase() === 'horas';

    return liberarTrechosDoSubstituto(tx, Number(ausencia.ColaboradorId), {
        dataInicio: extractDateString(ausencia.DataInicio),
        dataFim: extractDateString(ausencia.DataFim),
        horario: porHoras
            ? { horaInicio: extractTimeString(ausencia.HoraInicio), horaFim: extractTimeString(ausencia.HoraFim) }
            : null
    });
}

async function liberarTrechosPorDesligamento(tx, colaboradorId, dataDesligamento) {
    return liberarTrechosDoSubstituto(tx, colaboradorId, { dataInicio: dataDesligamento, dataFim: '9999-12-31' });
}

// A ausencia do titular foi editada: cada cobertura aberta por ela passa a ter
// o periodo novo. So acompanha enquanto a ausencia continua do titular.
async function acompanharAusenciaDoTitular(tx, ausencia) {
    const coberturas = await tx.request()
        .input('ausenciaId', sql.Int, Number(ausencia.Id))
        .input('titularId', sql.Int, Number(ausencia.ColaboradorId))
        .query(`
            SELECT c.Id, c.TitularId,
                   CONVERT(VARCHAR(10), c.DataInicio, 23) AS DataInicio,
                   CONVERT(VARCHAR(10), c.DataFim, 23) AS DataFim,
                   t.Id AS TitularColaboradorId, t.TrabalhoInicio, t.TrabalhoFim
            FROM Coberturas c
            INNER JOIN Colaboradores t ON t.Id = c.TitularId
            WHERE c.AusenciaId = @ausenciaId AND c.TitularId = @titularId
        `);

    const novoInicio = extractDateString(ausencia.DataInicio);
    const novoFim = extractDateString(ausencia.DataFim);
    const ajustadas = [];
    const feriados = await carregarFeriadosCadastrados(tx, novoInicio, novoFim);

    for (const cobertura of coberturas.recordset) {
        if (cobertura.DataInicio === novoInicio && cobertura.DataFim === novoFim) {
            continue;
        }

        const coberturaId = Number(cobertura.Id);
        // Mesma trava da tela: estender sobre outra cobertura do titular
        // cobriria o mesmo horario duas vezes (e creditaria em dobro). O 409
        // desfaz a edicao da ausencia inteira.
        await exigirSemCoberturaSobreposta(
            tx,
            Number(cobertura.TitularId),
            { dataInicio: novoInicio, dataFim: novoFim },
            coberturaId
        );

        const titular = { Id: cobertura.TitularId, TrabalhoInicio: cobertura.TrabalhoInicio, TrabalhoFim: cobertura.TrabalhoFim };
        // So os dias que entraram agora: dia que ja era da cobertura e nao tem
        // trecho foi tirado de proposito.
        const novos = gerarTrechosNecessarios({
            dataInicio: novoInicio,
            dataFim: novoFim,
            jornadaPorDiaSemana: await carregarJornadaDoTitular(tx, titular),
            ausencia: {
                periodoTipo: String(ausencia.PeriodoTipo || 'dia_inteiro').toLowerCase(),
                horaInicio: extractTimeString(ausencia.HoraInicio),
                horaFim: extractTimeString(ausencia.HoraFim)
            },
            feriados
        }).filter((trecho) => trecho.dataISO < cobertura.DataInicio || trecho.dataISO > cobertura.DataFim);

        await refazerCobertura(tx, coberturaId, async () => {
            await tx.request()
                .input('id', sql.Int, coberturaId)
                .input('dataInicio', sql.Date, novoInicio)
                .input('dataFim', sql.Date, novoFim)
                .query(`
                    DELETE FROM CoberturaTrechos
                    WHERE CoberturaId = @id AND (Data < @dataInicio OR Data > @dataFim);

                    UPDATE Coberturas
                    SET DataInicio = @dataInicio, DataFim = @dataFim, AtualizadoEm = GETDATE()
                    WHERE Id = @id;
                `);

            for (const trecho of novos) {
                await tx.request()
                    .input('coberturaId', sql.Int, coberturaId)
                    .input('data', sql.Date, trecho.dataISO)
                    .input('horaInicio', sql.Time, toSqlTime(trecho.horaInicio, 'Hora inicial'))
                    .input('horaFim', sql.Time, toSqlTime(trecho.horaFim, 'Hora final'))
                    .query(`
                        INSERT INTO CoberturaTrechos (CoberturaId, Data, HoraInicio, HoraFim)
                        VALUES (@coberturaId, @data, @horaInicio, @horaFim)
                    `);
            }
        });

        ajustadas.push({ coberturaId, dataInicio: novoInicio, dataFim: novoFim, diasNovos: novos.length });
    }

    return ajustadas;
}

// Feriado mudou nestas datas: refaz cada cobertura com trecho atribuido nelas
// (o trecho troca de credito no banco para plantao, ou o contrario).
async function refazerCoberturasNasDatas(tx, datas) {
    const lista = [...new Set((datas || []).filter(Boolean))];

    if (lista.length === 0) {
        return 0;
    }

    const request = tx.request();
    const parametros = lista.map((dataISO, indice) => {
        request.input(`d${indice}`, sql.Date, dataISO);
        return `@d${indice}`;
    });
    const result = await request.query(`
        SELECT DISTINCT CoberturaId
        FROM CoberturaTrechos
        WHERE Data IN (${parametros.join(', ')}) AND SubstitutoId IS NOT NULL
    `);

    for (const linha of result.recordset) {
        await refazerCobertura(tx, Number(linha.CoberturaId), async () => {});
    }

    return result.recordset.length;
}

// Texto curto para a resposta da rota que causou a mudanca.
function avisoDeTrechosLiberados(afetados) {
    if (!afetados.length) {
        return '';
    }

    const titulares = [...new Set(afetados.map((item) => item.titularNome).filter(Boolean))];

    return ` ${afetados.length} horario(s) de cobertura (${titulares.join(', ')}) voltaram a pendente: escolha outra pessoa em Coberturas.`;
}

module.exports = {
    acompanharAusenciaDoTitular,
    avisoDeTrechosLiberados,
    liberarTrechosPorAusencia,
    liberarTrechosPorDesligamento,
    refazerCoberturasNasDatas
};
