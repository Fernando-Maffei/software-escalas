const express = require('express');

const { queryBackgroundServerTask } = require('../lib/background-service');

const router = express.Router();

// So consulta: quem instala o inicio automatico e o INSTALAR-SERVIDOR.cmd.
router.get('/servidor-background/status', async (req, res, next) => {
    try {
        res.json(await queryBackgroundServerTask());
    } catch (error) {
        next(error);
    }
});

module.exports = router;
