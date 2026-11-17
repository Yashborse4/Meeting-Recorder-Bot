/**
 * backend/src/routes/startupRoutes.js
 * Routing for Windows auto-startup configuration
 */

const express = require('express');
const router = express.Router();
const startupController = require('../controllers/startupController');

router.get('/startup', startupController.getStartupStatus);
router.post('/startup/toggle', startupController.toggleStartup);

module.exports = router;
