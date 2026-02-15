const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { conectar } = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// Rotas existentes
const colaboradoresRoutes = require('./routes/colaboradores');
const ausenciasRoutes = require('./routes/ausencias');
const plantoesRoutes = require('./routes/plantoes'); // NOVA ROTA

app.use('/api/colaboradores', colaboradoresRoutes);
app.use('/api/ausencias', ausenciasRoutes);
app.use('/api/plantoes', plantoesRoutes); // NOVA ROTA

app.listen(PORT, async () => {
    await conectar();
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});