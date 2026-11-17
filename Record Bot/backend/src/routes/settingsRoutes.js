/**
 * backend/src/routes/settingsRoutes.js
 * Routing for bot configurations and auto-leave rules
 */

const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');

router.get('/settings', settingsController.getSettings);
router.post('/settings', settingsController.updateSettings);

module.exports = router;
