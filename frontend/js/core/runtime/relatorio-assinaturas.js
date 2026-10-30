// Relatorio "Lancamentos para assinatura" (aba da tela de Relatorios): as
// folhas de escala de plantao do mes — sabados, e domingos e feriados — para o
// colaborador assinar, no formato da folha que o time fazia a mao. As folhas saem de
// lib/lancamentos-assinatura.js; aqui ficam filtros, leitura, tela e
// impressao.
//
// Le os plantoes pela mesma rota da tela de plantoes, no escopo da conta (o
// teto de setor vale): o Nome/Apelido vai nas
// linhas de data e o nome completo do cadastro na lista de assinaturas.
//
// Nos sabados, o plantonista na jornada habitual (sem lancamento naquele dia)
// tambem entra, marcado "(jornada)" e sem linha de assinatura: le a jornada
// semanal, as ausencias e os feriados do mes, no mesmo escopo. Domingo e
// feriado ficam so com os lancamentos (plantao e cobertura de almoco).
import { atributosAcao } from '../../lib/atributos-acao.js';
import { escapeHtml } from '../../lib/html-seguro.js';
import { dataPorExtenso, jornadasHabituais, montarFolhasAssinatura, periodoDoMes, TIPOS_FOLHA_ASSINATURA } from '../../lib/lancamentos-assinatura.js';
import { carregarDiretorioColaboradores, resolverColaborador } from '../../telas/lancamentos.js';
import { API, buscarFeriadosNacionais } from '../api.js';
import { mostrarToast } from '../app/horas-e-resumo.js';
import { gerarOptionsMeses } from '../app/relatorios-export.js';
import { normalizarTipoLancamentoPlantao } from './plantao-colaboradores/plantao-editor.js';

const TITULO_RELATORIO_ASSINATURAS = 'Lançamentos para assinatura';

// A cidade do fecho ("Jales, 26 de Outubro de 2026.") fica lembrada neste
// navegador: o sistema nao tem cadastro de endereco.
const CHAVE_CIDADE = 'relatorioAssinaturaCidade';

function lerCidadeSalva() {
    try {
        return localStorage.getItem(CHAVE_CIDADE) || '';
    } catch (erro) {
        return '';
    }
}

function salvarCidade(cidade) {
    try {
        localStorage.setItem(CHAVE_CIDADE, cidade);
    } catch (erro) {
        // Armazenamento bloqueado: a cidade so nao fica lembrada.
    }
}

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
                        Folhas de escala de plantão do mês para assinatura: uma de sábados e uma de domingos e feriados, com as datas e os colaboradores, o local e a data, e o nome completo de cada um para assinar. Aos sábados entra também o plantonista na jornada habitual, sem assinatura.
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
                        <div class="filtro-group">
                            <label for="relatorioAssinaturaFolha"><i class="fas fa-tag"></i> Folha</label>
                            <select id="relatorioAssinaturaFolha" class="form-control">
                                <option value="">As duas folhas</option>
                                ${TIPOS_FOLHA_ASSINATURA.map(([valor, rotulo]) => `
                                    <option value="${escapeHtml(valor)}">${escapeHtml(rotulo)}</option>
                                `).join('')}
                            </select>
                        </div>
                        <div class="filtro-group">
                            <label for="relatorioAssinaturaCidade"><i class="fas fa-map-marker-alt"></i> Cidade</label>
                            <input type="text" id="relatorioAssinaturaCidade" class="form-control" value="${escapeHtml(lerCidadeSalva())}" placeholder="Ex.: Jales" maxlength="80">
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

    const cidade = document.getElementById('relatorioAssinaturaCidade')?.value?.trim() || '';
    salvarCidade(cidade);

    return {
        mes,
        ano,
        folha: document.getElementById('relatorioAssinaturaFolha')?.value || '',
        cidade,
        ...periodoDoMes(mes, ano)
    };
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

const lista = (resposta) => (Array.isArray(resposta) ? resposta : resposta?.items || []);

// Feriados do mes, nacionais e cadastrados, como datas ISO.
async function feriadosDoMes(filtros) {
    const [nacionais, cadastrados] = await Promise.all([
        buscarFeriadosNacionais(filtros.ano),
        API.get(`/feriados/mes/${filtros.ano}/${filtros.mes + 1}`)
    ]);

    return [
        ...lista(nacionais).map((item) => dataIso(item.date || item.data)),
        ...lista(cadastrados).map((item) => dataIso(item.Data || item.data))
    ].filter(Boolean);
}

async function carregarJornadasHabituais(filtros) {
    const periodo = { dataInicio: filtros.inicioISO, dataFim: filtros.fimISO };
    const [colaboradores, jornada, ausencias, feriados] = await Promise.all([
        API.getColaboradores({ incluirInativos: 1 }),
        API.getJornadaSemanal(),
        API.getAusencias(periodo),
        feriadosDoMes(filtros)
    ]);

    return jornadasHabituais({
        inicioISO: filtros.inicioISO,
        fimISO: filtros.fimISO,
        colaboradores: lista(colaboradores),
        jornadaSemanal: lista(jornada),
        ausencias: lista(ausencias),
        feriados
    });
}

async function montarDadosRelatorioAssinaturas(filtros) {
    // Diretorio recarregado: inclui desligados (plantao antigo de quem ja
    // saiu continua com nome) e pega o nome completo recem-editado.
    const [plantoes, , jornadas] = await Promise.all([
        API.getPlantoes({ from: filtros.inicioISO, to: filtros.fimISO }),
        carregarDiretorioColaboradores(true),
        carregarJornadasHabituais(filtros)
    ]);

    return montarFolhasAssinatura({
        jornadas,
        inicioISO: filtros.inicioISO,
        fimISO: filtros.fimISO,
        rotuloMes: filtros.rotulo,
        folha: filtros.folha,
        nomeDe: (id) => {
            const colaborador = resolverColaborador(id);
            return { apelido: colaborador.nome, nomeCompleto: colaborador.nomeCompleto };
        },
        plantoes: (Array.isArray(plantoes) ? plantoes : []).map((item) => ({
            dataISO: dataIso(item.dataISO || item.data_plantao),
            tipoLancamento: normalizarTipoLancamentoPlantao(item.tipoLancamento, item.tipoPlantao),
            colaboradores: Array.isArray(item.colaboradores) ? item.colaboradores : [],
            horario: faixaHorario(item.horaInicio, item.horaFim)
        }))
    });
}

function textoLocalEData(filtros) {
    const data = dataPorExtenso(new Date());
    return filtros.cidade ? `${filtros.cidade}, ${data}.` : `${data}.`;
}

// A mesma folha serve a tela e a impressao; so o estilo muda.
function renderFolhas(relatorio, filtros) {
    const localEData = textoLocalEData(filtros);

    return relatorio.folhas.map((folha) => `
            <section class="folha-assinatura" aria-label="${escapeHtml(folha.titulo)}">
                <h1 class="folha-titulo">${escapeHtml(folha.titulo)}</h1>
                <ul class="folha-datas">
                    ${folha.datas.map((linha) => `
                        <li><strong class="folha-data">${escapeHtml(linha.data)}</strong> &rarr; ${escapeHtml(linha.nomes.join(', '))}</li>
                    `).join('')}
                </ul>
                <p class="folha-local">${escapeHtml(localEData)}</p>
                <ul class="folha-assinaturas">
                    ${folha.assinaturas.map((nome) => `<li>${escapeHtml(nome)}</li>`).join('')}
                </ul>
                ${folha.emJornada.length ? `
                    <p class="folha-jornada">Em jornada habitual (sem assinatura): ${escapeHtml(folha.emJornada.join(', '))}.</p>
                ` : ''}
            </section>
        `).join('');
}

function textoTotais(relatorio) {
    const { folhas, escalas, colaboradores, jornadas } = relatorio.totais;
    const emJornada = jornadas ? ` · ${jornadas} em jornada habitual (sem assinatura)` : '';
    return `${folhas} folha(s) · ${escalas} escala(s) de ${colaboradores} colaborador(es)${emJornada}`;
}

function renderRelatorioAssinaturas(relatorio, filtros) {
    if (relatorio.folhas.length === 0) {
        return '<div class="empty-state">Nenhum plantão de sábado, domingo ou feriado no mês selecionado.</div>';
    }

    return `
            <div class="relatorio-tabela-container">
                <div class="relatorio-total">
                    Mês: <strong>${escapeHtml(filtros.rotulo)}</strong> &middot; ${escapeHtml(textoTotais(relatorio))}
                </div>
                <div class="folhas-assinatura">
                    ${renderFolhas(relatorio, filtros)}
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

// Folha A4 em retrato com as medidas da folha feita no Word (margens de
// 2,54 cm, Aptos 14/12/11), mais a linha de assinatura acima de cada nome: vai para um iframe fora da tela e e impressa de
// la, entao sai so o relatorio (sem menu, botoes nem tema). Cada folha
// comeca numa pagina. O titulo vira o nome do arquivo em "Salvar como PDF".
function gerarHtmlImpressaoAssinaturas(relatorio, filtros) {
    const nomeArquivo = `Escala_Assinaturas_${filtros.inicioISO.slice(0, 7)}`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(nomeArquivo)}</title>
    <style>
        @page { size: A4 portrait; margin: 25.4mm; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: #ffffff; }
        body { color: #000000; font-family: Aptos, Calibri, Arial, Helvetica, sans-serif; font-size: 11pt; }
        .folha-assinatura { break-after: page; page-break-after: always; }
        .folha-assinatura:last-child { break-after: auto; page-break-after: auto; }
        .folha-titulo { margin: 0 0 25pt; font-size: 14pt; font-weight: 700; line-height: 1.2; text-align: center; }
        .folha-datas { margin: 0; padding: 0; list-style: none; }
        .folha-datas li { font-size: 12pt; font-weight: 400; line-height: 25pt; }
        .folha-data { font-weight: 700; }
        .folha-local { margin: 24pt 0 0; font-size: 11pt; }
        .folha-assinaturas { margin: 20pt 0 0; padding: 0; list-style: none; }
        .folha-jornada { margin: 24pt 0 0; font-size: 10pt; font-style: italic; }
        .folha-assinaturas li { width: max-content; min-width: 9cm; max-width: 100%; margin-top: 34pt; padding-top: 3pt; border-top: 1px solid #000000; font-size: 11pt; line-height: 15pt; break-inside: avoid; page-break-inside: avoid; }
    </style>
</head>
<body>
    ${renderFolhas(relatorio, filtros)}
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

        if (relatorio.folhas.length === 0) {
            mostrarToast(`Nenhum plantão de sábado, domingo ou feriado em ${filtros.rotulo} para imprimir.`, 'warning');
            return;
        }

        await imprimirHtml(gerarHtmlImpressaoAssinaturas(relatorio, filtros));
    } catch (error) {
        console.error('Erro ao imprimir o relatorio de assinaturas:', error);
        mostrarToast(`Erro ao imprimir o relatorio: ${error.message}`, 'error');
    }
}
