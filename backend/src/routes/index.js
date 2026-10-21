/**
 * backend/src/routes/index.js
 * Central router aggregating all REST API endpoints under /api
 */

const express = require('express');
const router = express.Router();

const statusRoutes = require('./statusRoutes');
const timetableRoutes = require('./timetableRoutes');
const recordingRoutes = require('./recordingRoutes');
const settingsRoutes = require('./settingsRoutes');
const accountRoutes = require('./accountRoutes');
const browserRoutes = require('./browserRoutes');

router.use('/', statusRoutes);
router.use('/', timetableRoutes);
router.use('/', recordingRoutes);
router.use('/', settingsRoutes);
router.use('/', accountRoutes);
router.use('/', browserRoutes);

module.exports = router;
