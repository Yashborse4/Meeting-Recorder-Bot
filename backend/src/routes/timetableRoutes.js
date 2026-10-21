/**
 * backend/src/routes/timetableRoutes.js
 * Routing for weekly timetable classes and multi-slot scheduling
 */

const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetableController');

router.get('/timetable', timetableController.getTimetable);
router.post('/timetable', timetableController.createOrUpdateClass);
router.patch('/timetable/:id/toggle', timetableController.toggleClass);
router.delete('/timetable/:id', timetableController.deleteClass);

module.exports = router;
