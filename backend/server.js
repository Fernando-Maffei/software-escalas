const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { conectar } = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());



app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'API funcionando!',
        timestamp: new Date().toISOString()
    });
});

// Rotas existentes
const colaboradoresRoutes = require('./routes/colaboradores');
const ausenciasRoutes = require('./routes/ausencias');
const plantoesRoutes = require('./routes/plantoes');
const feriadosRoutes = require('./routes/feriados');

app.use('/api/colaboradores', colaboradoresRoutes);
app.use('/api/ausencias', ausenciasRoutes);
app.use('/api/plantoes', plantoesRoutes);
app.use('/api/feriados', feriadosRoutes);

app.listen(PORT, async () => {
    await conectar();
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    console.log(`Rotas disponíveis:`);
    console.log(`- GET  /api/colaboradores`);
    console.log(`- GET  /api/ausencias`);
    console.log(`- GET  /api/plantoes`);
    console.log(`- GET  /api/feriados`);
});