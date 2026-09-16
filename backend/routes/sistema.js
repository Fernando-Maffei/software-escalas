const express = require('express');

const { AppError } = require('../lib/errors');
const {
    installBackgroundServerTask,
    queryBackgroundServerTask,
    startBackgroundServerTask,
    stopBackgroundServerTask,
    uninstallBackgroundServerTask
} = require('../lib/background-service');

const router = express.Router();

function handleBackgroundServerAction(action) {
    return (req, res, next) => {
        try {
            res.json(action());
        } catch (error) {
            next(error instanceof AppError ? error : new AppError(500, error.message));
        }
    };
}

router.get('/servidor-background/status', handleBackgroundServerAction(queryBackgroundServerTask));
router.post('/servidor-background/instalar', handleBackgroundServerAction(installBackgroundServerTask));
router.post('/servidor-background/desinstalar', handleBackgroundServerAction(uninstallBackgroundServerTask));
router.post('/servidor-background/iniciar', handleBackgroundServerAction(startBackgroundServerTask));
router.post('/servidor-background/parar', handleBackgroundServerAction(stopBackgroundServerTask));

module.exports = router;
