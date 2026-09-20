/* Dados ficticios da demonstracao.
 *
 * Nenhum dado real de colaborador aparece aqui: os nomes sao inventados e as
 * jornadas foram montadas para exibir bem os recursos da tela (turnos que se
 * sobrepoem, almocos escalonados, um plantonista ate as 22h e um vale de
 * cobertura no horario de almoco).
 */
window.DemoDados = (function () {
    'use strict';

    const SETORES = [
        { id: 1, nome: 'Implantação', ativo: true, ordem: 1 },
        { id: 2, nome: 'Suporte N1', ativo: true, ordem: 2 },
        { id: 3, nome: 'Gerência', ativo: true, ordem: 3 }
    ];

    // Jornada por colaborador. "plantao" alonga o dia ate 22h, que e o caso
    // que faz a timeline mostrar a versao densa do cabecalho.
    const COLABORADORES = [
        { id: 1, nome: 'Alice Moreira',    setorId: 2, inicio: '07:00', fim: '16:00', almoco: '11:00' },
        { id: 2, nome: 'Bruno Tavares',    setorId: 2, inicio: '08:00', fim: '18:00', almoco: '12:00' },
        { id: 3, nome: 'Camila Duarte',    setorId: 2, inicio: '08:00', fim: '18:00', almoco: '12:30' },
        { id: 4, nome: 'Diego Ramalho',    setorId: 2, inicio: '08:00', fim: '18:00', almoco: '13:00' },
        { id: 5, nome: 'Elisa Prado',      setorId: 1, inicio: '08:00', fim: '18:00', almoco: '11:30' },
        { id: 6, nome: 'Felipe Andrade',   setorId: 1, inicio: '09:00', fim: '19:00', almoco: '13:30' },
        { id: 7, nome: 'Giovana Lins',     setorId: 1, inicio: '08:00', fim: '17:00', almoco: '12:00' },
        { id: 8, nome: 'Heitor Bastos',    setorId: 3, inicio: '09:00', fim: '18:00', almoco: '12:30' },
        { id: 9, nome: 'Isabela Nunes',    setorId: 3, inicio: '08:00', fim: '17:00', almoco: '12:00' },
        { id: 10, nome: 'Rafael Siqueira', setorId: 2, inicio: '13:00', fim: '22:00', almoco: '17:00', plantao: true }
    ];

    // Ausencias fixas por dia da semana, para a demo ter variedade sem
    // depender da data em que for aberta.
    const AUSENCIAS_POR_DIA = {
        2: [{ colaboradorId: 7, tipo: 'Ferias' }],
        4: [{ colaboradorId: 5, tipo: 'Atestado' }]
    };

    const FERIADOS = [
        { id: 1, nome: 'Independência', data: '2026-09-07', tipo: 'Nacional' },
        { id: 2, nome: 'Nossa Senhora Aparecida', data: '2026-10-12', tipo: 'Nacional' }
    ];

    function somaMinutos(hora, minutos) {
        const [h, m] = hora.split(':').map(Number);
        const total = h * 60 + m + minutos;
        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    }

    function diaDaSemana(dataISO) {
        const [a, m, d] = dataISO.split('-').map(Number);
        return new Date(a, m - 1, d).getDay();
    }

    // Monta a escala do dia: fim de semana so tem o plantonista; nos dias
    // uteis entram todos, menos quem esta ausente naquele dia da semana.
    function escalaDoDia(dataISO) {
        const dow = diaDaSemana(dataISO);
        const fimDeSemana = dow === 0 || dow === 6;
        const ausentes = (AUSENCIAS_POR_DIA[dow] || []);

        return COLABORADORES
            .filter((c) => (fimDeSemana ? c.plantao : true))
            .map((c) => {
                const ausencia = ausentes.find((a) => a.colaboradorId === c.id);
                const setor = SETORES.find((s) => s.id === c.setorId);

                if (ausencia) {
                    return {
                        colaboradorId: c.id,
                        colaboradorNome: c.nome,
                        setorId: c.setorId,
                        setorNome: setor ? setor.nome : null,
                        dataISO,
                        horaInicio: null,
                        horaFim: null,
                        almocoInicio: null,
                        almocoFim: null,
                        tipo: ausencia.tipo,
                        origemTipo: 'ausencia'
                    };
                }

                return {
                    colaboradorId: c.id,
                    colaboradorNome: c.nome,
                    setorId: c.setorId,
                    setorNome: setor ? setor.nome : null,
                    dataISO,
                    horaInicio: `${c.inicio}:00`,
                    horaFim: `${c.fim}:00`,
                    almocoInicio: `${c.almoco}:00`,
                    almocoFim: `${somaMinutos(c.almoco, 60)}:00`,
                    tipo: c.plantao && fimDeSemana ? 'plantao' : 'normal',
                    origemTipo: c.plantao && fimDeSemana ? 'plantao' : 'cadastro'
                };
            });
    }

    // Moldes de padrao semanal. O plantonista trabalha de sabado a quarta e
    // folga quinta e sexta — e o caso que o modelo de Tipo de Escala existe
    // para representar sem booleano nem regra no codigo.
    function diasDoTipo(diasTrabalhados, inicio, fim, almocoInicio, almocoFim) {
        return [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => {
            const trabalha = diasTrabalhados.includes(diaSemana);

            return {
                diaSemana,
                trabalha,
                trabalhoInicio: trabalha ? `${inicio}:00` : null,
                trabalhoFim: trabalha ? `${fim}:00` : null,
                almocoInicio: trabalha ? `${almocoInicio}:00` : null,
                almocoFim: trabalha ? `${almocoFim}:00` : null
            };
        });
    }

    const TIPOS_ESCALA = [
        {
            id: 1,
            nome: '5x2 Comercial',
            cicloTipo: 'semanal',
            domingosFolgaCada: null,
            exigeReposicao: false,
            ativo: true,
            ordem: 1,
            observacao: 'Segunda a sexta.',
            dias: diasDoTipo([1, 2, 3, 4, 5], '08:00', '18:00', '12:00', '13:00')
        },
        {
            id: 2,
            nome: 'Plantonista Sáb-Qua',
            cicloTipo: 'semanal',
            domingosFolgaCada: 4,
            exigeReposicao: true,
            ativo: true,
            ordem: 2,
            observacao: 'Trabalha de sabado a quarta, folga quinta e sexta.',
            dias: diasDoTipo([6, 0, 1, 2, 3], '13:00', '22:00', '17:00', '18:00')
        }
    ];

    return { SETORES, COLABORADORES, FERIADOS, TIPOS_ESCALA, escalaDoDia, diaDaSemana };
})();
