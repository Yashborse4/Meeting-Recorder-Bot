/**
 * backend/src/routes/statusRoutes.js
 * Routing for bot status and daemon control
 */

const express = require('express');
const router = express.Router();
const statusController = require('../controllers/statusController');

router.get('/status', statusController.getStatus);
router.post('/scheduler/toggle', statusController.toggleScheduler);

module.exports = router;
