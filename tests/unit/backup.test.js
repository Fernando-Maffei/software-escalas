const assert = require('node:assert/strict');
const path = require('path');

const {
    normalizeAutoBackupIntervalMinutes,
    normalizeBackupDirectory
} = require('../../backend/services/backup-config');
const {
    coerceBackupPayload,
    formatBackupTimestamp
} = require('../../backend/services/backup-service');

module.exports = [
    {
        name: 'normalizeBackupDirectory accepts absolute paths and trims wrapping quotes',
        run() {
            const absolutePath = path.resolve('tmp', 'backups', 'escalas');
            const normalized = normalizeBackupDirectory(`"${absolutePath}"`);

            assert.equal(normalized, path.normalize(absolutePath));
        }
    },
    {
        name: 'normalizeBackupDirectory rejects relative paths',
        run() {
            assert.throws(
                () => normalizeBackupDirectory('backups/escalas'),
                /caminho absoluto/i
            );
        }
    },
    {
        name: 'formatBackupTimestamp returns a filename-safe local timestamp',
        run() {
            const timestamp = formatBackupTimestamp(new Date(2026, 3, 27, 10, 11, 12));

            assert.equal(timestamp, '2026-04-27_10-11-12');
        }
    },
    {
        name: 'normalizeAutoBackupIntervalMinutes enforces the minimum interval',
        run() {
            assert.equal(normalizeAutoBackupIntervalMinutes('60'), 60);
            assert.throws(
                () => normalizeAutoBackupIntervalMinutes('10'),
                /15 minutos/i
            );
        }
    },
    {
        name: 'coerceBackupPayload accepts the structured system backup format',
        run() {
            const payload = coerceBackupPayload({
                metadata: {
                    generatedAt: '2026-04-28T12:00:00.000Z'
                },
                data: {
                    Colaboradores: [
                        {
                            Id: 1,
                            Nome: 'Deborah',
                            TrabalhoInicio: '1970-01-01T07:00:00.000Z',
                            TrabalhoFim: '1970-01-01T16:00:00.000Z'
                        }
                    ],
                    Ausencias: [],
                    Feriados: [],
                    plantoes: [],
                    BancoHorasMovimentos: [],
                    escala_dia: []
                }
            });

            assert.equal(payload.format, 'system');
            assert.equal(payload.data.Colaboradores.length, 1);
            assert.equal(payload.data.Colaboradores[0].Id, 1);
        }
    },
    {
        name: 'coerceBackupPayload maps the legacy export format into restore tables',
        run() {
            const payload = coerceBackupPayload({
                colaboradores: [
                    {
                        Id: 7,
                        nome: 'Luis'
                    }
                ],
                ausencias: [],
                preferencias: {
                    tema: 'dark'
                }
            });

            assert.equal(payload.format, 'legacy');
            assert.equal(payload.data.Colaboradores.length, 1);
            assert.equal(payload.preferences.tema, 'dark');
        }
    }
,
    {
        // Backup antigo nao tinha tipo_plantao; o DEFAULT do banco ('sabado')
        // transformava todo domingo e feriado em sabado na restauracao.
        name: 'coerceBackupPayload deriva o tipo do plantao pela data quando o backup nao traz',
        run() {
            const payload = coerceBackupPayload({
                data: {
                    plantoes: [
                        { id: 1, data_plantao: '2027-01-02', colaboradores_ids: '[1]' },
                        { id: 2, data_plantao: '2027-01-03', colaboradores_ids: '[1]' },
                        { id: 3, data_plantao: '2027-09-07', colaboradores_ids: '[1]' },
                        { id: 4, data_plantao: '2027-03-19', colaboradores_ids: '[1]' }
                    ]
                }
            });

            assert.deepEqual(
                payload.data.plantoes.map((linha) => linha.tipo_plantao),
                ['sabado', 'domingo', 'feriado', 'feriado']
            );
        }
    },
    {
        name: 'coerceBackupPayload preserva tipo de credito, vinculo de escala e desligamento',
        run() {
            const payload = coerceBackupPayload({
                data: {
                    Colaboradores: [
                        { Id: 1, Nome: 'Ana', TipoEscalaId: 4, Ativo: false, DataDesligamento: '2026-08-31T00:00:00.000Z' }
                    ],
                    plantoes: [
                        { id: 9, data_plantao: '2027-01-03', colaboradores_ids: '[1]', tipo_plantao: 'domingo', tipo_credito: 'extra' }
                    ]
                }
            });

            const [colaborador] = payload.data.Colaboradores;
            assert.equal(colaborador.TipoEscalaId, 4);
            assert.equal(colaborador.Ativo, false);
            assert.equal(colaborador.DataDesligamento, '2026-08-31');
            assert.equal(payload.data.plantoes[0].tipo_credito, 'extra');
            assert.deepEqual(payload.data.PlantaoColaborador, [{ PlantaoId: 9, ColaboradorId: 1 }]);
        }
    },
    {
        // M17: arquivos anteriores a 2026-09-28 guardavam a equipe no JSON
        // plantoes.colaboradores_ids; eles continuam restauraveis.
        name: 'backup antigo: a equipe em JSON vira vinculos de PlantaoColaborador',
        run() {
            const payload = coerceBackupPayload({
                data: {
                    Colaboradores: [
                        { Id: 1, Nome: 'Ana' },
                        { Id: 2, Nome: 'Bia' }
                    ],
                    plantoes: [
                        { id: 7, data_plantao: '2027-01-02', colaboradores_ids: '[2,1,2]' },
                        { id: 8, data_plantao: '2027-01-09', colaboradores_ids: '[]' }
                    ]
                }
            });

            assert.deepEqual(payload.data.PlantaoColaborador, [
                { PlantaoId: 7, ColaboradorId: 1 },
                { PlantaoId: 7, ColaboradorId: 2 }
            ]);
            assert.equal('colaboradores_ids' in payload.data.plantoes[0], false);
            assert.deepEqual(payload.avisos, []);
        }
    },
    {
        name: 'backup antigo sem id de plantao: os plantoes recebem ids para ligar a equipe',
        run() {
            const payload = coerceBackupPayload({
                data: {
                    Colaboradores: [{ Id: 3, Nome: 'Caio' }],
                    plantoes: [
                        { data_plantao: '2027-01-02', colaboradores: [3] },
                        { data_plantao: '2027-01-09', colaboradores: [3] }
                    ]
                }
            });

            assert.deepEqual(payload.data.plantoes.map((linha) => linha.id), [1, 2]);
            assert.deepEqual(payload.data.PlantaoColaborador, [
                { PlantaoId: 1, ColaboradorId: 3 },
                { PlantaoId: 2, ColaboradorId: 3 }
            ]);
        }
    },
    {
        // A FK abortaria a restauracao inteira por causa de um vinculo orfao.
        name: 'vinculo de equipe com colaborador ou plantao ausente do arquivo e ignorado com aviso',
        run() {
            const payload = coerceBackupPayload({
                data: {
                    Colaboradores: [{ Id: 1, Nome: 'Ana' }],
                    plantoes: [{ id: 5, data_plantao: '2027-01-02' }],
                    PlantaoColaborador: [
                        { PlantaoId: 5, ColaboradorId: 1 },
                        { PlantaoId: 5, ColaboradorId: 99 },
                        { PlantaoId: 6, ColaboradorId: 1 },
                        { PlantaoId: 5, ColaboradorId: 1 }
                    ]
                }
            });

            assert.deepEqual(payload.data.PlantaoColaborador, [{ PlantaoId: 5, ColaboradorId: 1 }]);
            assert.equal(payload.avisos.length, 1);
            assert.match(payload.avisos[0], /^3 vinculo/);
        }
    },
    {
        name: 'backup antigo com equipe que nao e JSON e recusado',
        run() {
            assert.throws(
                () => coerceBackupPayload({ data: { plantoes: [{ id: 1, data_plantao: '2027-01-02', colaboradores_ids: '[1,' }] } }),
                /colaboradores_ids .* esta invalido/
            );
        }
    },
    {
        name: 'coerceBackupPayload recusa registro sem campo obrigatorio',
        run() {
            assert.throws(
                () => coerceBackupPayload({ data: { Feriados: [{ Id: 1, Data: '2027-03-19' }] } }),
                /Feriados.Nome e obrigatorio/
            );
        }
    }
];
