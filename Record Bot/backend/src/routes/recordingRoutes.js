/**
 * backend/src/routes/recordingRoutes.js
 * Routing for manual recording sessions and media asset operations
 */

const express = require('express');
const router = express.Router();
const recordingController = require('../controllers/recordingController');

router.post('/record/start', recordingController.startRecording);
router.post('/record/stop', recordingController.stopRecording);
router.get('/recordings', recordingController.listRecordings);
router.delete('/recordings/:filename', recordingController.deleteRecording);

module.exports = router;
