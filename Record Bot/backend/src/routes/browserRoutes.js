/**
 * backend/src/routes/browserRoutes.js
 * Routing for browser operations
 */

const express = require('express');
const router = express.Router();
const browserController = require('../controllers/browserController');

router.post('/browser/open', browserController.openBrowser);

module.exports = router;
