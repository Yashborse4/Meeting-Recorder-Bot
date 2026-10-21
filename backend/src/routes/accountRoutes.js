/**
 * backend/src/routes/accountRoutes.js
 * Routing for Google Account status, login window, 1-click import, and logout
 */

const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');

router.get('/account', accountController.getAccount);
router.post('/account/login', accountController.login);
router.post('/account/import', accountController.importAccount);
router.post('/account/logout', accountController.logout);

module.exports = router;
