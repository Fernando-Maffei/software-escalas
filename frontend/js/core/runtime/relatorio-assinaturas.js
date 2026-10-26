// Relatorio "Lancamentos para assinatura" (aba da tela de Relatorios): todos
// os lancamentos do mes — folgas, ferias, ausencias, plantoes e folgas de
// domingo — numa folha para o colaborador conferir e assinar. As linhas saem
// de lib/lancamentos-assinatura.js; aqui ficam filtros, leitura, tela e
// impressao.
//
// Le os registros de verdade pelas mesmas rotas das outras telas, no escopo
// da conta (o teto de setor vale para os tres tipos), e mostra o nome
// completo do cadastro, ou o Nome quando ele ainda nao foi preenchido.
import { atributosAcao } from '../../lib/atributos-acao.js';
import { escapeHtml } from '../../lib/html-seguro.js';
import { montarLancamentosAssinatura, periodoDoMes } from '../../lib/lancamentos-assinatura.js';
import { carregarDiretorioColaboradores, resolverColaborador } from '../../telas/lancamentos.js';
import { API } from '../api.js';
import { mostrarToast } from '../app/horas-e-resumo.js';
import { gerarOptionsMeses } from '../app/relatorios-export.js';
import { normalizeRuntimeAusenciaTipo } from './normalizacao.js';
import { normalizarTipoLancamentoPlantao } from './plantao-colaboradores/plantao-editor.js';
import { montarDetalheAusenciaRelatorio, textoDetalheRelatorio } from './relatorio-mensal.js';

const TITULO_RELATORIO_ASSINATURAS = 'Lançamentos para assinatura';

export function renderPainelRelatorioAssinaturas() {
    const hoje = new Date();

    return `
            <div class="relatorio-card" data-relatorio-painel="assinaturas">
                <div class="relatorio-card-header">
                    <i class="fas fa-file-signature"></i>
                    <h2>${TITULO_RELATORIO_ASSINATURAS}</h2>
                </div>
                <div class="relatorio-card-body">
                    <p class="relatorio-descricao">
                        Folgas, férias, ausências, plantões e folgas de domingo do mês, um por linha, com o nome completo e um campo para a assinatura do colaborador.
                    </p>
                    <div class="relatorio-filtros">
                        <div class="filtro-group">
                            <label for="relatorioAssinaturaMes"><i class="fas fa-calendar"></i> Mes/Ano</label>
                            <div class="mes-selector">
                                <select id="relatorioAssinaturaMes" class="form-control">
                                    ${gerarOptionsMeses(hoje.getMonth())}
                                </select>
                                <input type="number" id="relatorioAssinaturaAno" class="form-control" value="${hoje.getFullYear()}" min="2020" max="2035" aria-label="Ano">
                            </div>
                        </div>
                    </div>
                    <div class="relatorio-actions">
                        <button ${atributosAcao('gerarRelatorioAssinaturas')} class="btn-primary">
                            <i class="fas fa-file-alt"></i> Visualizar
                        </button>
                        <button ${atributosAcao('imprimirRelatorioAssinaturas')} class="btn-secondary">
                            <i class="fas fa-print"></i> Imprimir
                        </button>
                    </div>
                </div>
            </div>
        `;
}

function lerFiltrosAssinaturas() {
    const mes = Number.parseInt(document.getElementById('relatorioAssinaturaMes')?.value, 10);
    const ano = Number.parseInt(document.getElementById('relatorioAssinaturaAno')?.value, 10);

    if (!Number.isInteger(mes) || mes < 0 || mes > 11 || !Number.isInteger(ano) || ano < 2000 || ano > 2100) {
        mostrarToast('Informe um mes e um ano validos.', 'error');
        return null;
    }

    return { mes, ano, ...periodoDoMes(mes, ano) };
}

function dataIso(valor) {
    return typeof valor === 'string' ? valor.split('T')[0] : null;
}

function horaCurta(valor) {
    const encontrado = String(valor || '').match(/(\d{2}:\d{2})/);
    return encontrado ? encontrado[1] : '';
}

function faixaHorario(inicio, fim) {
    const horaInicio = horaCurta(inicio);
    const horaFim = horaCurta(fim);

    return horaInicio && horaFim ? `${horaInicio}-${horaFim}` : '';
}

async function montarDadosRelatorioAssinaturas(filtros) {
    // Diretorio recarregado: inclui desligados (lancamento antigo de quem ja
    // saiu continua com nome) e pega o nome completo recem-editado.
    const [ausencias, plantoes, folgas] = await Promise.all([
        API.getAusencias({ dataInicio: filtros.inicioISO, dataFim: filtros.fimISO }),
        API.getPlantoes({ from: filtros.inicioISO, to: filtros.fimISO }),
        API.getFolgasDomingo({ dataInicio: filtros.inicioISO, dataFim: filtros.fimISO }),
        carregarDiretorioColaboradores(true)
    ]);

    return montarLancamentosAssinatura({
        inicioISO: filtros.inicioISO,
        fimISO: filtros.fimISO,
        nomeDe: (id) => {
            const colaborador = resolverColaborador(id);
            return colaborador.nomeCompleto || colaborador.nome;
        },
        ausencias: (Array.isArray(ausencias) ? ausencias : []).map((item) => ({
            colaboradorId: item.ColaboradorId,
            tipo: normalizeRuntimeAusenciaTipo(item.Tipo),
            inicioISO: dataIso(item.DataInicio),
            fimISO: dataIso(item.DataFim),
            detalhe: textoDetalheRelatorio(montarDetalheAusenciaRelatorio(item))
        })),
        plantoes: (Array.isArray(plantoes) ? plantoes : []).map((item) => ({
            dataISO: dataIso(item.dataISO || item.data_plantao),
            tipoLancamento: normalizarTipoLancamentoPlantao(item.tipoLancamento, item.tipoPlantao),
            colaboradores: Array.isArray(item.colaboradores) ? item.colaboradores : [],
            horario: faixaHorario(item.horaInicio, item.horaFim)
        })),
        folgasDomingo: (Array.isArray(folgas?.items) ? folgas.items : []).map((item) => ({
            colaboradorId: item.colaboradorId,
            dataDomingo: item.dataDomingo,
            dataReposicao: item.dataReposicao,
            horarioReposicao: faixaHorario(item.reposicaoHoraInicio, item.reposicaoHoraFim)
        }))
    });
}

// A mesma tabela serve a tela e a folha impressa; so o estilo muda.
function renderTabelaAssinaturas(relatorio) {
    if (relatorio.linhas.length === 0) {
        return '<div class="empty-state">Nenhum lançamento no mês selecionado.</div>';
    }

    let dataAnterior = null;

    return `
            <table class="relatorio-tabela relatorio-assinaturas-tabela">
                <thead>
                    <tr>
                        <th class="col-data">Data</th>
                        <th class="col-colaborador">Colaborador</th>
                        <th class="col-tipo">Tipo de lançamento</th>
                        <th class="col-assinatura">Assinatura</th>
                    </tr>
                </thead>
                <tbody>
                    ${relatorio.linhas.map((linha) => {
                        const novoDia = dataAnterior !== null && linha.inicioISO !== dataAnterior;
                        dataAnterior = linha.inicioISO;

                        return `
                            <tr class="${novoDia ? 'novo-dia' : ''}">
                                <td class="col-data">${escapeHtml(linha.data)}</td>
                                <td class="col-colaborador">${escapeHtml(linha.nome)}</td>
                                <td class="col-tipo">
                                    ${escapeHtml(linha.rotulo)}
                                    ${linha.detalhe ? `<small>${escapeHtml(linha.detalhe)}</small>` : ''}
                                </td>
                                <td class="col-assinatura"></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
}

function textoTotais(relatorio) {
    const { lancamentos, colaboradores } = relatorio.totais;
    return `${lancamentos} lançamento(s) de ${colaboradores} colaborador(es)`;
}

function renderRelatorioAssinaturas(relatorio, filtros) {
    return `
            <div class="relatorio-tabela-container">
                <div class="relatorio-total">
                    Mês: <strong>${escapeHtml(filtros.rotulo)}</strong> &middot; ${escapeHtml(textoTotais(relatorio))}
                </div>
                <div class="relatorio-tabela-scroll">
                    ${renderTabelaAssinaturas(relatorio)}
                </div>
            </div>
        `;
}

export async function gerarRelatorioAssinaturas() {
    const filtros = lerFiltrosAssinaturas();

    if (!filtros) {
        return;
    }

    try {
        const relatorio = await montarDadosRelatorioAssinaturas(filtros);

        document.getElementById('relatorioTitulo').innerText = `${TITULO_RELATORIO_ASSINATURAS} - ${filtros.rotulo}`;
        document.getElementById('relatorioConteudo').innerHTML = renderRelatorioAssinaturas(relatorio, filtros);
        document.getElementById('relatorioVisualizacao').style.display = 'block';
    } catch (error) {
        mostrarToast(`Erro ao gerar o relatorio: ${error.message}`, 'error');
    }
}

// Folha A4 em retrato, com estilo proprio: vai para um iframe fora da tela e
// e impressa de la, entao sai so o relatorio (sem menu, botoes nem tema).
// O titulo vira o nome do arquivo quando se escolhe "Salvar como PDF".
function gerarHtmlImpressaoAssinaturas(relatorio, filtros) {
    const nomeArquivo = `Lancamentos_Assinatura_${filtros.inicioISO.slice(0, 7)}`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(nomeArquivo)}</title>
    <style>
        @page { size: A4 portrait; margin: 14mm 12mm 16mm; }
        @page { @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 9px Arial, sans-serif; color: #64748b; } }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #ffffff; }
        body { color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 11px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #1e3a5f; }
        h1 { margin: 0 0 2px; color: #1e3a5f; font-size: 18px; }
        header p { margin: 0; color: #475569; font-size: 11px; }
        .periodo { text-align: right; }
        .periodo strong { display: block; color: #0f172a; font-size: 15px; }
        .resumo { margin: 0 0 8px; color: #475569; font-size: 10px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; break-inside: avoid; }
        th, td { border: 1px solid #94a3b8; padding: 5px 7px; text-align: left; vertical-align: middle; }
        th { background: #e2e8f0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
        td { height: 11mm; font-size: 11px; }
        tr.novo-dia td { border-top: 2px solid #475569; }
        .col-data { width: 17%; white-space: nowrap; }
        .col-colaborador { width: 33%; }
        .col-tipo { width: 22%; }
        .col-assinatura { width: 28%; }
        td small { display: block; margin-top: 2px; color: #64748b; font-size: 9px; }
        .empty-state { padding: 24px; border: 1px dashed #94a3b8; color: #475569; text-align: center; }
    </style>
</head>
<body>
    <header>
        <div>
            <h1>Lançamentos do mês</h1>
            <p>Conferência e assinatura dos colaboradores</p>
        </div>
        <div class="periodo">
            <strong>${escapeHtml(filtros.rotulo)}</strong>
            <p>Emitido em ${escapeHtml(new Date().toLocaleDateString('pt-BR'))}</p>
        </div>
    </header>
    <p class="resumo">${escapeHtml(textoTotais(relatorio))}</p>
    ${renderTabelaAssinaturas(relatorio)}
</body>
</html>`;
}

function imprimirHtml(html) {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position: fixed; right: 0; bottom: 0; width: 0; height: 0; border: 0; visibility: hidden;';

    return new Promise((resolve, reject) => {
        let removido = false;
        const remover = () => {
            if (!removido) {
                removido = true;
                frame.remove();
            }
        };

        frame.addEventListener('load', () => {
            try {
                const janela = frame.contentWindow;
                janela.addEventListener('afterprint', () => setTimeout(remover, 0));
                janela.focus();
                janela.print();
                // Navegador que nao avisa o fim da impressao: o iframe sai
                // depois de um tempo, sem cortar o dialogo aberto.
                setTimeout(remover, 60000);
                resolve();
            } catch (error) {
                remover();
                reject(error);
            }
        }, { once: true });

        frame.srcdoc = html;
        document.body.appendChild(frame);
    });
}

export async function imprimirRelatorioAssinaturas() {
    const filtros = lerFiltrosAssinaturas();

    if (!filtros) {
        return;
    }

    try {
        const relatorio = await montarDadosRelatorioAssinaturas(filtros);

        if (relatorio.linhas.length === 0) {
            mostrarToast(`Nenhum lançamento em ${filtros.rotulo} para imprimir.`, 'warning');
            return;
        }

        await imprimirHtml(gerarHtmlImpressaoAssinaturas(relatorio, filtros));
    } catch (error) {
        console.error('Erro ao imprimir o relatorio de assinaturas:', error);
        mostrarToast(`Erro ao imprimir o relatorio: ${error.message}`, 'error');
    }
}
