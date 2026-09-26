// Especificacao UNICA do que o backup guarda e a restauracao devolve.
//
// Antes eram tres listas escritas a mao (ordem de apagar, ordem de inserir e
// colunas) mais um normalizador por tabela, e cada tabela ou coluna nova
// precisava lembrar de todas. Nao lembrava: a restauracao zerava tipos de
// escala e folgas de domingo, perdia TipoEscalaId e o desligamento, virava
// todo plantao em sabado/banco e quebrava com banco de horas semanal.
//
// Agora a ordem das tabelas abaixo e a ordem de INSERCAO (pais antes dos
// filhos, por causa das FKs); a de exclusao e a mesma lista ao contrario. O
// teste de integracao "especificacao do backup cobre todas as colunas do banco"
// compara esta lista com o INFORMATION_SCHEMA e falha se algo ficar de fora.
//
// Contas (Usuarios) e sessoes (Sessoes) nao entram de proposito: nao sao dado
// de escala, a restauracao nunca as reinseriu, e o arquivo de backup nao pode
// carregar hash de senha nem token de sessao valido.

// Tipos de coluna. Cada um sabe normalizar o valor lido do arquivo e qual o
// tipo SQL do parametro (ver normalizacao.js).
const TIPO = Object.freeze({
    ID: 'id', // inteiro positivo (chave ou referencia)
    INT: 'int', // inteiro com sinal
    DIA_SEMANA: 'dia_semana', // 0 (domingo) a 6 (sabado)
    BIT: 'bit',
    DATA: 'data', // YYYY-MM-DD
    DATA_HORA: 'data_hora',
    HORA: 'hora',
    TEXTO: 'texto',
    EQUIPE_PLANTAO: 'equipe_plantao' // array JSON de ids de colaborador
});

// col('Nome', TIPO.TEXTO, { max: 300, obrigatorio: true, apelidos: ['nome'] })
function col(nome, tipo, opcoes = {}) {
    return Object.freeze({
        nome,
        tipo,
        max: opcoes.max || null,
        obrigatorio: Boolean(opcoes.obrigatorio),
        apelidos: Object.freeze([nome, ...(opcoes.apelidos || [])]),
        enumeracao: opcoes.enumeracao ? Object.freeze([...opcoes.enumeracao]) : null
    });
}

const AUSENCIA_TIPOS = Object.freeze(['folga', 'ausencia', 'ferias']);
const AUSENCIA_PERIODOS = Object.freeze(['dia_inteiro', 'horas']);
const PLANTAO_TIPOS = Object.freeze(['sabado', 'domingo', 'feriado']);
const PLANTAO_CREDITOS = Object.freeze(['banco', 'extra']);
const SEMANAL_STATUS = Object.freeze(['auto', 'confirmado']);

const TABELAS_BACKUP = Object.freeze([
    {
        tabela: 'Setores',
        identidade: 'Id',
        colunas: [
            col('Id', TIPO.ID, { apelidos: ['id'] }),
            col('Nome', TIPO.TEXTO, { max: 120, obrigatorio: true, apelidos: ['nome'] }),
            col('Ativo', TIPO.BIT, { apelidos: ['ativo'] }),
            col('Ordem', TIPO.INT, { apelidos: ['ordem'] }),
            col('CriadoEm', TIPO.DATA_HORA, { apelidos: ['criadoEm'] }),
            col('AtualizadoEm', TIPO.DATA_HORA, { apelidos: ['atualizadoEm'] })
        ]
    },
    {
        tabela: 'TiposEscala',
        identidade: 'Id',
        colunas: [
            col('Id', TIPO.ID, { apelidos: ['id'] }),
            col('Nome', TIPO.TEXTO, { max: 120, obrigatorio: true, apelidos: ['nome'] }),
            col('CicloTipo', TIPO.TEXTO, { max: 20, apelidos: ['cicloTipo'] }),
            col('DomingosFolgaCada', TIPO.INT, { apelidos: ['domingosFolgaCada'] }),
            col('ExigeReposicao', TIPO.BIT, { apelidos: ['exigeReposicao'] }),
            col('Ativo', TIPO.BIT, { apelidos: ['ativo'] }),
            col('Ordem', TIPO.INT, { apelidos: ['ordem'] }),
            col('Observacao', TIPO.TEXTO, { max: 500, apelidos: ['observacao'] }),
            col('CriadoEm', TIPO.DATA_HORA, { apelidos: ['criadoEm'] }),
            col('AtualizadoEm', TIPO.DATA_HORA, { apelidos: ['atualizadoEm'] })
        ]
    },
    {
        tabela: 'TipoEscalaDia',
        identidade: 'Id',
        colunas: [
            col('Id', TIPO.ID, { apelidos: ['id'] }),
            col('TipoEscalaId', TIPO.ID, { obrigatorio: true, apelidos: ['tipoEscalaId'] }),
            col('DiaSemana', TIPO.DIA_SEMANA, { obrigatorio: true, apelidos: ['diaSemana'] }),
            col('Trabalha', TIPO.BIT, { apelidos: ['trabalha'] }),
            col('TrabalhoInicio', TIPO.HORA, { apelidos: ['trabalhoInicio'] }),
            col('TrabalhoFim', TIPO.HORA, { apelidos: ['trabalhoFim'] }),
            col('AlmocoInicio', TIPO.HORA, { apelidos: ['almocoInicio'] }),
            col('AlmocoFim', TIPO.HORA, { apelidos: ['almocoFim'] })
        ],
        jornada: true
    },
    {
        tabela: 'Colaboradores',
        identidade: 'Id',
        legado: ['colaboradores'],
        colunas: [
            col('Id', TIPO.ID, { apelidos: ['id'] }),
            col('Nome', TIPO.TEXTO, { max: 300, obrigatorio: true, apelidos: ['nome'] }),
            col('TrabalhoInicio', TIPO.HORA, { apelidos: ['trabalhoInicio'] }),
            col('TrabalhoFim', TIPO.HORA, { apelidos: ['trabalhoFim'] }),
            col('AlmocoInicio', TIPO.HORA, { apelidos: ['almocoInicio'] }),
            col('AlmocoFim', TIPO.HORA, { apelidos: ['almocoFim'] }),
            col('SetorId', TIPO.ID, { apelidos: ['setorId'] }),
            col('Ativo', TIPO.BIT, { apelidos: ['ativo'] }),
            col('DataDesligamento', TIPO.DATA, { apelidos: ['dataDesligamento'] }),
            col('TipoEscalaId', TIPO.ID, { apelidos: ['tipoEscalaId'] })
        ],
        jornada: true
    },
    {
        tabela: 'FolgasDomingo',
        identidade: 'Id',
        colunas: [
            col('Id', TIPO.ID, { apelidos: ['id'] }),
            col('ColaboradorId', TIPO.ID, { obrigatorio: true, apelidos: ['colaboradorId'] }),
            col('DataDomingo', TIPO.DATA, { obrigatorio: true, apelidos: ['dataDomingo'] }),
            col('DataReposicao', TIPO.DATA, { apelidos: ['dataReposicao'] }),
            col('ReposicaoHoraInicio', TIPO.HORA, { apelidos: ['reposicaoHoraInicio'] }),
            col('ReposicaoHoraFim', TIPO.HORA, { apelidos: ['reposicaoHoraFim'] }),
            // Coluna legada (a tela nao preenche mais), mas pode ter dado antigo.
            col('CobertoPorColaboradorId', TIPO.ID, { apelidos: ['cobertoPorColaboradorId'] }),
            col('PlantaoId', TIPO.ID, { apelidos: ['plantaoId'] }),
            col('Observacao', TIPO.TEXTO, { max: 500, apelidos: ['observacao'] }),
            col('CriadoEm', TIPO.DATA_HORA, { apelidos: ['criadoEm'] }),
            col('AtualizadoEm', TIPO.DATA_HORA, { apelidos: ['atualizadoEm'] }),
            col('ReposicaoAlmocoInicio', TIPO.HORA, { apelidos: ['reposicaoAlmocoInicio'] }),
            col('ReposicaoAlmocoFim', TIPO.HORA, { apelidos: ['reposicaoAlmocoFim'] })
        ]
    },
    {
        tabela: 'ColaboradorJornadaSemanal',
        identidade: 'Id',
        legado: ['jornadaSemanal'],
        colunas: [
            col('Id', TIPO.ID, { apelidos: ['id'] }),
            col('ColaboradorId', TIPO.ID, { obrigatorio: true, apelidos: ['colaboradorId'] }),
            col('DiaSemana', TIPO.DIA_SEMANA, { obrigatorio: true, apelidos: ['diaSemana'] }),
            col('TrabalhoInicio', TIPO.HORA, { apelidos: ['trabalhoInicio'] }),
            col('TrabalhoFim', TIPO.HORA, { apelidos: ['trabalhoFim'] }),
            col('AlmocoInicio', TIPO.HORA, { apelidos: ['almocoInicio'] }),
            col('AlmocoFim', TIPO.HORA, { apelidos: ['almocoFim'] }),
            col('Ativo', TIPO.BIT, { apelidos: ['ativo'] }),
            col('DataCadastro', TIPO.DATA_HORA, { apelidos: ['dataCadastro'] }),
            col('DataAtualizacao', TIPO.DATA_HORA, { apelidos: ['dataAtualizacao'] })
        ],
        jornada: true
    },
    {
        tabela: 'Feriados',
        identidade: 'Id',
        legado: ['feriados'],
        colunas: [
            col('Id', TIPO.ID, { apelidos: ['id'] }),
            col('Nome', TIPO.TEXTO, { max: 200, obrigatorio: true, apelidos: ['nome'] }),
            col('Data', TIPO.DATA, { obrigatorio: true, apelidos: ['data'] }),
            col('Tipo', TIPO.TEXTO, { max: 50, apelidos: ['tipo'] })
        ]
    },
    {
        tabela: 'Ausencias',
        identidade: 'Id',
        legado: ['ausencias'],
        colunas: [
            col('Id', TIPO.ID, { apelidos: ['id'] }),
            col('ColaboradorId', TIPO.ID, { obrigatorio: true, apelidos: ['colaboradorId'] }),
            col('Tipo', TIPO.TEXTO, { max: 30, obrigatorio: true, apelidos: ['tipo'], enumeracao: AUSENCIA_TIPOS }),
            col('DataInicio', TIPO.DATA, { obrigatorio: true, apelidos: ['dataInicio'] }),
            col('DataFim', TIPO.DATA, { obrigatorio: true, apelidos: ['dataFim'] }),
            col('DataCadastro', TIPO.DATA_HORA, { apelidos: ['dataCadastro'] }),
            col('PeriodoTipo', TIPO.TEXTO, { max: 20, apelidos: ['periodoTipo'], enumeracao: AUSENCIA_PERIODOS }),
            col('HoraInicio', TIPO.HORA, { apelidos: ['horaInicio'] }),
            col('HoraFim', TIPO.HORA, { apelidos: ['horaFim'] }),
            col('Subtipo', TIPO.TEXTO, { max: 50, apelidos: ['subtipo'] }),
            col('DescontaBancoHoras', TIPO.BIT, { apelidos: ['descontaBancoHoras'] }),
            col('Observacao', TIPO.TEXTO, { max: 500, apelidos: ['observacao'] })
        ]
    },
    {
        tabela: 'plantoes',
        identidade: 'id',
        legado: ['plantoes', 'Plantoes'],
        colunas: [
            col('id', TIPO.ID, { apelidos: ['Id'] }),
            col('data_plantao', TIPO.DATA, {
                obrigatorio: true,
                apelidos: ['dataISO', 'DataPlantao', 'dataPlantao']
            }),
            col('colaboradores_ids', TIPO.EQUIPE_PLANTAO, {
                apelidos: ['colaboradores', 'ColaboradoresIds', 'Colaboradores']
            }),
            col('criado_em', TIPO.DATA_HORA, { apelidos: ['CriadoEm'] }),
            col('atualizado_em', TIPO.DATA_HORA, { apelidos: ['AtualizadoEm'] }),
            col('hora_inicio', TIPO.HORA, { apelidos: ['HoraInicio', 'horaInicio'] }),
            col('hora_fim', TIPO.HORA, { apelidos: ['HoraFim', 'horaFim'] }),
            col('observacao', TIPO.TEXTO, { max: 500, apelidos: ['Observacao'] }),
            col('tipo_plantao', TIPO.TEXTO, {
                max: 30,
                apelidos: ['tipoPlantao', 'TipoPlantao'],
                enumeracao: PLANTAO_TIPOS
            }),
            col('tipo_credito', TIPO.TEXTO, {
                max: 20,
                apelidos: ['tipoCredito', 'TipoCredito'],
                enumeracao: PLANTAO_CREDITOS
            })
        ]
    },
    {
        tabela: 'BancoHorasMovimentos',
        identidade: 'Id',
        legado: ['bancoHorasMovimentos', 'movimentosBancoHoras'],
        colunas: [
            col('Id', TIPO.ID, { apelidos: ['id'] }),
            col('ColaboradorId', TIPO.ID, { obrigatorio: true, apelidos: ['colaboradorId'] }),
            col('DataReferencia', TIPO.DATA, { obrigatorio: true, apelidos: ['dataReferencia'] }),
            col('Minutos', TIPO.INT, { obrigatorio: true, apelidos: ['minutos'] }),
            col('OrigemTipo', TIPO.TEXTO, { max: 30, obrigatorio: true, apelidos: ['origemTipo'] }),
            col('OrigemId', TIPO.ID, { apelidos: ['origemId'] }),
            col('Descricao', TIPO.TEXTO, { max: 255, obrigatorio: true, apelidos: ['descricao'] }),
            col('Observacao', TIPO.TEXTO, { max: 500, apelidos: ['observacao'] }),
            col('CriadoEm', TIPO.DATA_HORA, { apelidos: ['criadoEm'] })
        ]
    },
    {
        tabela: 'BancoHorasSemanal',
        identidade: 'Id',
        colunas: [
            col('Id', TIPO.ID, { apelidos: ['id'] }),
            col('ColaboradorId', TIPO.ID, { obrigatorio: true, apelidos: ['colaboradorId'] }),
            col('SemanaSegunda', TIPO.DATA, { obrigatorio: true, apelidos: ['semanaSegunda'] }),
            col('Minutos', TIPO.INT, { obrigatorio: true, apelidos: ['minutos'] }),
            col('Observacao', TIPO.TEXTO, { max: 500, apelidos: ['observacao'] }),
            col('AtualizadoEm', TIPO.DATA_HORA, { apelidos: ['atualizadoEm'] }),
            col('Status', TIPO.TEXTO, { max: 20, apelidos: ['status'], enumeracao: SEMANAL_STATUS })
        ]
    },
    {
        tabela: 'BancoHorasSemanalNota',
        // Sem IDENTITY: a chave e a propria segunda-feira.
        identidade: null,
        colunas: [
            col('SemanaSegunda', TIPO.DATA, { obrigatorio: true, apelidos: ['semanaSegunda'] }),
            col('Observacao', TIPO.TEXTO, { max: 500, apelidos: ['observacao'] }),
            col('AtualizadoEm', TIPO.DATA_HORA, { apelidos: ['atualizadoEm'] })
        ]
    },
    {
        tabela: 'escala_dia',
        identidade: 'id',
        legado: ['escalaDia', 'EscalaDia'],
        colunas: [
            col('id', TIPO.ID, { apelidos: ['Id'] }),
            col('colaborador_id', TIPO.ID, { obrigatorio: true, apelidos: ['colaboradorId'] }),
            col('data', TIPO.DATA, { obrigatorio: true, apelidos: ['Data'] }),
            col('hora_inicio', TIPO.HORA, { apelidos: ['HoraInicio', 'horaInicio'] }),
            col('hora_fim', TIPO.HORA, { apelidos: ['HoraFim', 'horaFim'] }),
            col('almoco_inicio', TIPO.HORA, { apelidos: ['AlmocoInicio', 'almocoInicio'] }),
            col('almoco_fim', TIPO.HORA, { apelidos: ['AlmocoFim', 'almocoFim'] }),
            // A lista de tipos validos vem de escala.js (ver normalizacao.js).
            col('tipo', TIPO.TEXTO, { max: 30, apelidos: ['Tipo'] }),
            col('observacao', TIPO.TEXTO, { max: 500, apelidos: ['Observacao'] }),
            col('origem_tipo', TIPO.TEXTO, { max: 30, apelidos: ['OrigemTipo', 'origemTipo'] }),
            col('origem_id', TIPO.ID, { apelidos: ['OrigemId', 'origemId'] }),
            col('ajuste_manual', TIPO.BIT, { apelidos: ['AjusteManual', 'ajusteManual'] }),
            col('almoco_ajustado', TIPO.BIT, { apelidos: ['AlmocoAjustado', 'almocoAjustado'] }),
            col('criado_em', TIPO.DATA_HORA, { apelidos: ['CriadoEm'] }),
            col('atualizado_em', TIPO.DATA_HORA, { apelidos: ['AtualizadoEm'] })
        ]
    },
    {
        tabela: 'AlmocosPersonalizados',
        identidade: 'Id',
        colunas: [
            col('Id', TIPO.ID, { apelidos: ['id'] }),
            col('ColaboradorId', TIPO.ID, { obrigatorio: true, apelidos: ['colaboradorId'] }),
            col('Data', TIPO.DATA, { obrigatorio: true, apelidos: ['data'] }),
            col('AlmocoInicio', TIPO.HORA, { obrigatorio: true, apelidos: ['almocoInicio'] }),
            col('AlmocoFim', TIPO.HORA, { obrigatorio: true, apelidos: ['almocoFim'] }),
            col('CriadoEm', TIPO.DATA_HORA, { apelidos: ['criadoEm'] }),
            col('AtualizadoEm', TIPO.DATA_HORA, { apelidos: ['atualizadoEm'] })
        ]
    }
].map((especificacao) => Object.freeze({ legado: [], jornada: false, ...especificacao })));

const NOMES_TABELAS_BACKUP = Object.freeze(TABELAS_BACKUP.map((item) => item.tabela));

module.exports = {
    AUSENCIA_TIPOS,
    NOMES_TABELAS_BACKUP,
    TABELAS_BACKUP,
    TIPO
};
