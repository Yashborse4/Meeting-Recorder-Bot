/**
 * backend/src/routes/subjectRoutes.js
 * Routing for subject / class directory management
 */

const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');

router.get('/subjects', subjectController.getSubjects);
router.post('/subjects', subjectController.createOrUpdateSubject);
router.delete('/subjects/:id', subjectController.deleteSubject);

module.exports = router;
