const express = require('express');
const path = require('path');
const cors = require('cors');

const { conectar, fecharConexao } = require('./db');
const { executeAutomaticBackup, initializeAutoBackupScheduler } = require('./utils/backup-scheduler');
const { AppError } = require('./utils/errors');

const colaboradoresRoutes = require('./routes/colaboradores');
const ausenciasRoutes = require('./routes/ausencias');
const plantoesRoutes = require('./routes/plantoes');
const feriadosRoutes = require('./routes/feriados');
const bancoHorasRoutes = require('./routes/banco-horas');
const escalaRoutes = require('./routes/escala');
const configuracaoBancoRoutes = require('./routes/configuracao-banco');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const frontendPath = path.join(__dirname, '..', 'frontend');

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(frontendPath));

app.get('/api/health', async (req, res, next) => {
    try {
        const pool = await conectar();
        await pool.request().query('SELECT 1 AS status');

        res.json({
            status: 'ok',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        next(error);
    }
});

app.get('/api/test', (req, res) => {
    res.json({
        status: 'ok',
        message: 'API funcionando!',
        timestamp: new Date().toISOString()
    });
});

app.use('/api/colaboradores', colaboradoresRoutes);
app.use('/api/ausencias', ausenciasRoutes);
app.use('/api/plantoes', plantoesRoutes);
app.use('/api/feriados', feriadosRoutes);
app.use('/api/banco-horas', bancoHorasRoutes);
app.use('/api/escala', escalaRoutes);
app.use('/api/configuracao-banco', configuracaoBancoRoutes);

app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use((req, res, next) => {
    next(new AppError(404, 'Rota nao encontrada.'));
});

app.use((error, req, res, next) => {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Erro interno no servidor.';

    if (statusCode >= 500) {
        console.error(`[${req.method}] ${req.originalUrl}`, error);
    }

    res.status(statusCode).json({
        error: message,
        details: error.details || null
    });
});

function start() {
    const server = app.listen(PORT, async () => {
        console.log(`Servidor rodando em http://localhost:${PORT}`);
        console.log('Rotas disponiveis:');
        console.log('- GET  /api/health');
        console.log('- GET  /api/colaboradores');
        console.log('- GET  /api/ausencias');
        console.log('- GET  /api/plantoes');
        console.log('- GET  /api/feriados');
        console.log('- GET  /api/banco-horas/resumo');
        console.log('- GET  /api/escala/dia/:dataISO');
        console.log('- GET  /api/configuracao-banco');

        try {
            await conectar();
            console.log('Banco de dados conectado com sucesso.');
            const scheduler = initializeAutoBackupScheduler();

            if (scheduler.scheduled) {
                console.log(`Backup automatico agendado a cada ${scheduler.intervalMinutes} minuto(s).`);
            } else {
                console.log('Backup automatico periodico desativado.');
            }
        } catch (error) {
            console.error('Servidor iniciado, mas nao foi possivel conectar ao banco na inicializacao.');
            console.error(error.message);
        }
    });

    let isShuttingDown = false;

    async function shutdown(signal) {
        if (isShuttingDown) {
            return;
        }

        isShuttingDown = true;
        console.log(`${signal} recebido. Encerrando servidor...`);

        try {
            const backupResult = await executeAutomaticBackup('auto-shutdown');

            if (backupResult?.success) {
                console.log(`Backup automatico de encerramento gerado: ${backupResult.fileName}`);
            }
        } catch (error) {
            console.error('Falha ao gerar backup automatico antes do encerramento.');
            console.error(error.message);
        }

        server.close(async () => {
            await fecharConexao().catch(() => {});
            process.exit(0);
        });

        setTimeout(async () => {
            await fecharConexao().catch(() => {});
            process.exit(1);
        }, 5000).unref();
    }

    ['SIGINT', 'SIGTERM', 'SIGBREAK'].forEach((signal) => {
        process.once(signal, () => {
            shutdown(signal).catch((error) => {
                console.error(`Erro ao encerrar o servidor com ${signal}:`);
                console.error(error.message);
                process.exit(1);
            });
        });
    });

    return server;
}

if (require.main === module) {
    start();
}

module.exports = {
    app,
    start
};
