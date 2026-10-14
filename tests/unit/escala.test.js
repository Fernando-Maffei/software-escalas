const assert = require('node:assert/strict');

const {
    aggregatePlantoesPorColaborador,
    buildColaboradorDefaultSyncRecord,
    canAutoRefreshDefaultEscala,
    createAusenciaEscalaRecord,
    createPlantaoEscalaRecord,
    isLunchOutsideCadastro,
    iterateIsoDates,
    loadFeriadosDoPeriodo,
    normalizeEscalaTipo
} = require('../../backend/services/escala');
const {
    buildEscalaQuadroCalendarSlots,
    buildEscalaQuadroMensal,
    shouldIncludeBoardRecord
} = require('../../frontend/js/lib/escala-report-utils');

module.exports = [
    {
        // A armadilha desta fase: normalizeEscalaTipo casava por PREFIXO, e
        // 'folga_compensatoria' comeca com 'folga'. Sem o casamento exato antes
        // dos startsWith, o tipo novo viraria 'folga' ao ser gravado e a
        // distincao se perderia em silencio — sem erro, sem aviso.
        name: 'normalizeEscalaTipo nao deixa folga_compensatoria virar folga',
        run() {
            assert.equal(normalizeEscalaTipo('folga_compensatoria'), 'folga_compensatoria');
            assert.equal(normalizeEscalaTipo('Folga Compensatória'), 'folga_compensatoria');
            assert.equal(normalizeEscalaTipo('domingo_folgado'), 'domingo_folgado');
            assert.equal(normalizeEscalaTipo('reposicao'), 'reposicao');
            assert.equal(normalizeEscalaTipo('Cobertura'), 'cobertura');
        }
    },
    {
        // O casamento por prefixo continua valendo para o dado legado: e o que
        // faz 'Férias' acentuado e variantes como 'plantao_sabado' entrarem.
        name: 'normalizeEscalaTipo preserva o casamento por prefixo do dado legado',
        run() {
            assert.equal(normalizeEscalaTipo('plantao_sabado'), 'plantao');
            assert.equal(normalizeEscalaTipo('Férias'), 'ferias');
            assert.equal(normalizeEscalaTipo('Ausência'), 'ausencia');
            assert.equal(normalizeEscalaTipo('folga'), 'folga');
            assert.throws(() => normalizeEscalaTipo('inventado'), /invalido/i);
        }
    },
    {
        // O quadro mensal mostra quem esta ESCALADO. Reposicao e cobertura sao
        // dias trabalhados e precisam aparecer; domingo folgado e folga
        // compensatoria, nao.
        name: 'shouldIncludeBoardRecord mantem reposicao e cobertura, tira os dias sem trabalho',
        run() {
            const comHorario = (tipo) => ({ tipo, horaInicio: '13:00', horaFim: '22:00' });

            assert.equal(shouldIncludeBoardRecord(comHorario('reposicao')), true);
            assert.equal(shouldIncludeBoardRecord(comHorario('cobertura')), true);
            assert.equal(shouldIncludeBoardRecord(comHorario('domingo_folgado')), false);
            assert.equal(shouldIncludeBoardRecord(comHorario('folga_compensatoria')), false);
            // Sem horario ninguem entra, seja qual for o tipo.
            assert.equal(shouldIncludeBoardRecord({ tipo: 'reposicao' }), false);
        }
    },
    {
        name: 'loadFeriadosDoPeriodo junta feriados nacionais e os cadastrados no banco',
        async run() {
            const fakePool = {
                request() {
                    const request = {
                        input: () => request,
                        query: async () => ({ recordset: [{ Data: new Date('2026-09-20T00:00:00Z') }] })
                    };
                    return request;
                }
            };
            // O caso "tabela Feriados ausente" nao existe mais: o servidor so
            // libera as rotas depois de aplicar todas as migrations (M1 da
            // auditoria).
            const datas = await loadFeriadosDoPeriodo(fakePool, '2026-09-01', '2026-09-30');
            assert.ok(datas.has('2026-09-07'), 'Independencia (nacional) deve estar na lista');
            assert.ok(datas.has('2026-09-20'), 'feriado cadastrado deve estar na lista');
            assert.equal(datas.has('2026-09-08'), false);
        }
    },
    {
        name: 'isLunchOutsideCadastro flags only a lunch that differs from the colaborador cadastro',
        run() {
            const colaborador = { Id: 1, AlmocoInicio: '12:00:00', AlmocoFim: '13:00:00' };

            assert.equal(isLunchOutsideCadastro({ almocoInicio: '12:00', almocoFim: '13:00' }, colaborador), false);
            assert.equal(isLunchOutsideCadastro({ almocoInicio: '11:00', almocoFim: '12:00' }, colaborador), true);
            assert.equal(isLunchOutsideCadastro({ almocoInicio: '12:00', almocoFim: '13:30' }, colaborador), true);
            // Dia sem almoco (ex.: sabado curto) ou cadastro sem almoco: nada a comparar.
            assert.equal(isLunchOutsideCadastro({ almocoInicio: null, almocoFim: null }, colaborador), false);
            assert.equal(isLunchOutsideCadastro({ almocoInicio: '11:00', almocoFim: '12:00' }, { Id: 2 }), false);
            assert.equal(isLunchOutsideCadastro({ almocoInicio: '11:00', almocoFim: '12:00' }, null), false);
        }
    },
    {
        name: 'isLunchOutsideCadastro usa o almoco da jornada semanal do dia quando o colaborador tem jornada',
        run() {
            // Ficha sem almoco; almoco so na jornada (13-15 de segunda a sexta).
            const colaborador = { Id: 4, AlmocoInicio: null, AlmocoFim: null };
            const jornadaInfo = {
                hasRows: true,
                activeByDay: new Map([[1, { almocoInicio: '13:00:00', almocoFim: '15:00:00' }]])
            };

            // 2026-09-14 e segunda-feira.
            assert.equal(isLunchOutsideCadastro({ dataISO: '2026-09-14', almocoInicio: '13:00', almocoFim: '15:00' }, colaborador, jornadaInfo), false);
            assert.equal(isLunchOutsideCadastro({ dataISO: '2026-09-14', almocoInicio: '12:00', almocoFim: '14:00' }, colaborador, jornadaInfo), true);
            // Sabado fora da jornada: sem referencia, sem destaque.
            assert.equal(isLunchOutsideCadastro({ dataISO: '2026-09-12', almocoInicio: '12:00', almocoFim: '14:00' }, colaborador, jornadaInfo), false);
            // Ficha com almoco diferente nao vale quando existe jornada semanal.
            const comFicha = { Id: 5, AlmocoInicio: '11:00:00', AlmocoFim: '12:00:00' };
            assert.equal(isLunchOutsideCadastro({ dataISO: '2026-09-14', almocoInicio: '13:00', almocoFim: '15:00' }, comFicha, jornadaInfo), false);
        }
    },
    {
        name: 'buildEscalaQuadroMensal does not merge a lunch outside the cadastro with a regular one',
        run() {
            const base = { dataISO: '2026-05-04', tipo: 'normal', horaInicio: '07:00', horaFim: '16:00', almocoInicio: '12:00', almocoFim: '13:00' };
            const days = buildEscalaQuadroMensal([
                { ...base, colaboradorNome: 'Ana', almocoForaDoCadastro: true },
                { ...base, colaboradorNome: 'Bruno' },
                { ...base, colaboradorNome: 'Carla' }
            ], { year: 2026, month: 5 });
            const day = days.find((item) => item.dataISO === '2026-05-04');

            assert.deepEqual(day.rows.map((row) => row.colaboradorNome), ['Bruno', 'Carla', 'Ana']);
            assert.deepEqual(day.rows.map((row) => row.almocoForaDoCadastro), [false, false, true]);
            assert.equal(day.rows[0].almocoRowspan, 2);
            assert.equal(day.rows[2].showAlmoco, true);
            assert.equal(day.rows[2].almocoRowspan, 1);
        }
    },
    {
        name: 'iterateIsoDates includes both ends of the selected period',
        run() {
            assert.deepEqual(
                iterateIsoDates('2026-04-29', '2026-05-02'),
                ['2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02']
            );
        }
    },
    {
        name: 'createAusenciaEscalaRecord clears work hours for full-day leave',
        run() {
            const colaborador = {
                Id: 1,
                Nome: 'Joao',
                TrabalhoInicio: '08:00:00',
                TrabalhoFim: '18:00:00',
                AlmocoInicio: '12:00:00',
                AlmocoFim: '13:00:00'
            };
            const ausencia = {
                Id: 99,
                Tipo: 'folga',
                PeriodoTipo: 'dia_inteiro'
            };
            const record = createAusenciaEscalaRecord(colaborador, ausencia, '2026-04-25');

            assert.equal(record.tipo, 'folga');
            assert.equal(record.horaInicio, null);
            assert.equal(record.horaFim, null);
            assert.equal(record.almocoInicio, null);
            assert.equal(record.almocoFim, null);
            assert.equal(record.origemTipo, 'ausencia');
            assert.equal(record.origemId, 99);
        }
    },
    {
        name: 'createAusenciaEscalaRecord normalizes accented leave types from legacy data',
        run() {
            const colaborador = {
                Id: 2,
                Nome: 'Julia',
                TrabalhoInicio: '08:00:00',
                TrabalhoFim: '17:00:00',
                AlmocoInicio: '12:00:00',
                AlmocoFim: '13:00:00'
            };
            const ausencia = {
                Id: 100,
                Tipo: 'Aus\u00EAncia',
                PeriodoTipo: 'dia_inteiro'
            };
            const record = createAusenciaEscalaRecord(colaborador, ausencia, '2026-05-03');

            assert.equal(record.tipo, 'ausencia');
            assert.equal(record.origemTipo, 'ausencia');
            assert.equal(record.origemId, 100);
        }
    },
    {
        name: 'createPlantaoEscalaRecord preserves shift hours and source metadata',
        run() {
            const colaborador = {
                Id: 7,
                Nome: 'Maria'
            };
            const plantao = {
                id: 15,
                dataISO: '2026-04-25',
                horaInicio: '08:00:00',
                horaFim: '18:00:00',
                observacao: 'Cobertura de sabado'
            };
            const record = createPlantaoEscalaRecord(colaborador, plantao);

            assert.equal(record.tipo, 'plantao');
            assert.equal(record.horaInicio, '08:00:00');
            assert.equal(record.horaFim, '18:00:00');
            assert.equal(record.dataISO, '2026-04-25');
            assert.equal(record.origemTipo, 'plantao');
            assert.equal(record.origemId, 15);
        }
    },
    {
        name: 'canAutoRefreshDefaultEscala allows only automatic base rows to refresh from cadastro',
        run() {
            assert.equal(canAutoRefreshDefaultEscala({
                ajusteManual: false,
                origemTipo: null,
                origemId: null
            }), true);

            assert.equal(canAutoRefreshDefaultEscala({
                ajusteManual: true,
                origemTipo: null,
                origemId: null
            }), false);

            assert.equal(canAutoRefreshDefaultEscala({
                ajusteManual: false,
                almocoAjustado: true,
                origemTipo: null,
                origemId: null
            }), false);

            assert.equal(canAutoRefreshDefaultEscala({
                ajusteManual: false,
                almocoAjustado: false,
                origemTipo: 'plantao',
                origemId: 10
            }), false);
        }
    },
    {
        name: 'buildColaboradorDefaultSyncRecord reapplies cadastro hours and keeps escala metadata',
        run() {
            const record = buildColaboradorDefaultSyncRecord({
                Id: 4,
                Nome: 'Paula',
                TrabalhoInicio: '08:00:00',
                TrabalhoFim: '17:00:00',
                AlmocoInicio: '12:00:00',
                AlmocoFim: '13:00:00'
            }, {
                dataISO: '2026-05-05',
                tipo: 'ajuste',
                observacao: 'Escala base'
            });

            assert.equal(record.dataISO, '2026-05-05');
            assert.equal(record.colaboradorId, 4);
            assert.equal(record.colaboradorNome, 'Paula');
            assert.equal(record.horaInicio, '08:00:00');
            assert.equal(record.horaFim, '17:00:00');
            assert.equal(record.almocoInicio, '12:00:00');
            assert.equal(record.almocoFim, '13:00:00');
            assert.equal(record.tipo, 'ajuste');
            assert.equal(record.observacao, 'Escala base');
        }
    },
    {
        name: 'buildEscalaQuadroMensal keeps Sundays and empty weekends visible',
        run() {
            const days = buildEscalaQuadroMensal([], {
                year: 2026,
                month: 5
            });

            assert.equal(days.length, 31);
            assert.ok(days.some((day) => day.dayLabel === 'Domingo'));

            const saturday = days.find((day) => day.dataISO === '2026-05-02');
            assert.ok(saturday);
            assert.equal(saturday.hasScale, false);
            assert.deepEqual(saturday.rows, []);

            const sunday = days.find((day) => day.dataISO === '2026-05-03');
            assert.ok(sunday);
            assert.equal(sunday.hasScale, false);
            assert.deepEqual(sunday.rows, []);
        }
    },
    {
        name: 'buildEscalaQuadroMensal groups consecutive lunch and jornada cells with rowspan',
        run() {
            const days = buildEscalaQuadroMensal([
                {
                    dataISO: '2026-05-04',
                    colaboradorNome: 'Ana',
                    tipo: 'normal',
                    horaInicio: '07:00',
                    horaFim: '16:00',
                    almocoInicio: '12:00',
                    almocoFim: '13:00'
                },
                {
                    dataISO: '2026-05-04',
                    colaboradorNome: 'Bruno',
                    tipo: 'normal',
                    horaInicio: '07:00',
                    horaFim: '16:00',
                    almocoInicio: '12:00',
                    almocoFim: '13:00'
                },
                {
                    dataISO: '2026-05-04',
                    colaboradorNome: 'Carla',
                    tipo: 'normal',
                    horaInicio: '08:00',
                    horaFim: '17:00',
                    almocoInicio: '12:00',
                    almocoFim: '13:00'
                },
                {
                    dataISO: '2026-05-04',
                    colaboradorNome: 'Diego',
                    tipo: 'normal',
                    horaInicio: '08:00',
                    horaFim: '17:00',
                    almocoInicio: '13:00',
                    almocoFim: '14:00'
                }
            ], {
                year: 2026,
                month: 5
            });

            const day = days.find((item) => item.dataISO === '2026-05-04');

            assert.ok(day);
            assert.equal(day.rows.length, 4);
            assert.equal(day.rows[0].showAlmoco, true);
            assert.equal(day.rows[0].almocoRowspan, 3);
            assert.equal(day.rows[0].showJornada, true);
            assert.equal(day.rows[0].jornadaRowspan, 2);
            assert.equal(day.rows[1].showAlmoco, false);
            assert.equal(day.rows[1].showJornada, false);
            assert.equal(day.rows[2].showAlmoco, false);
            assert.equal(day.rows[2].showJornada, true);
            assert.equal(day.rows[2].jornadaRowspan, 2);
            assert.equal(day.rows[3].showAlmoco, true);
            assert.equal(day.rows[3].almocoRowspan, 1);
            assert.equal(day.rows[3].showJornada, false);
        }
    },
    {
        name: 'buildEscalaQuadroMensal excludes full-day leave and keeps partial absences with schedule',
        run() {
            const days = buildEscalaQuadroMensal([
                {
                    dataISO: '2026-02-02',
                    colaboradorNome: 'Folga integral',
                    tipo: 'folga',
                    horaInicio: null,
                    horaFim: null,
                    almocoInicio: null,
                    almocoFim: null
                },
                {
                    dataISO: '2026-02-02',
                    colaboradorNome: 'Ausencia parcial',
                    tipo: 'ausencia',
                    horaInicio: '09:00',
                    horaFim: '18:00',
                    almocoInicio: '13:00',
                    almocoFim: '14:00'
                }
            ], {
                year: 2026,
                month: 2
            });

            const day = days.find((item) => item.dataISO === '2026-02-02');

            assert.ok(day);
            assert.equal(day.rows.length, 1);
            assert.equal(day.rows[0].colaboradorNome, 'Ausencia parcial');
        }
    },
    {
        name: 'buildEscalaQuadroCalendarSlots aligns month days in monday-to-sunday calendar weeks',
        run() {
            const days = buildEscalaQuadroMensal([], {
                year: 2026,
                month: 5
            });
            const slots = buildEscalaQuadroCalendarSlots(days);

            assert.equal(slots.length, 35);
            assert.equal(slots[0], null);
            assert.equal(slots[1], null);
            assert.equal(slots[2], null);
            assert.equal(slots[3], null);
            assert.equal(slots[4]?.dataISO, '2026-05-01');
            assert.equal(slots[5]?.dataISO, '2026-05-02');
            assert.equal(slots[6]?.dataISO, '2026-05-03');
            assert.equal(slots[7]?.dataISO, '2026-05-04');
            assert.equal(slots[8]?.dataISO, '2026-05-05');
        }
    },
    {
        // escala_dia so aceita uma linha por colaborador/data. Quem faz dois
        // turnos no mesmo dia precisa virar um intervalo unico, senao o segundo
        // turno gravado apagaria o primeiro na escala.
        name: 'aggregatePlantoesPorColaborador merges same-day shifts into one span',
        run() {
            const agregado = aggregatePlantoesPorColaborador([
                {
                    id: 7,
                    dataISO: '2026-04-25',
                    horaInicio: '08:00',
                    horaFim: '13:00',
                    observacao: 'Fechamento',
                    colaboradores: [1, 2]
                },
                {
                    id: 4,
                    dataISO: '2026-04-25',
                    horaInicio: '13:00',
                    horaFim: '18:00',
                    observacao: null,
                    colaboradores: [1]
                }
            ]);

            assert.equal(agregado.size, 2);
            assert.deepEqual(agregado.get(1), {
                // Menor id do dia: continua valendo enquanto qualquer turno existir.
                id: 4,
                dataISO: '2026-04-25',
                horaInicio: '08:00',
                horaFim: '18:00',
                observacao: 'Fechamento'
            });
            assert.equal(agregado.get(2).horaFim, '13:00');
        }
    }
];
