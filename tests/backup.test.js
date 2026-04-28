const assert = require('node:assert/strict');
const path = require('path');

const {
    normalizeAutoBackupIntervalMinutes,
    normalizeBackupDirectory
} = require('../backend/utils/backup-config');
const {
    coerceBackupPayload,
    formatBackupTimestamp
} = require('../backend/utils/backup-service');

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
];
