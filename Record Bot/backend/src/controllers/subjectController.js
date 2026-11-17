/**
 * backend/src/controllers/subjectController.js
 * Controller handling subject/class directory CRUD operations
 */

const subjectModel = require('../models/subjectModel');

/**
 * Returns the entire list of registered classes / subjects
 */
function getSubjects(req, res) {
  try {
    const subjects = subjectModel.loadSubjects();
    res.json({ ok: true, subjects });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Creates or updates a class / subject
 */
function createOrUpdateSubject(req, res) {
  try {
    const subject = subjectModel.addOrUpdateSubject(req.body);
    res.json({
      ok: true,
      subject,
      subjects: subjectModel.loadSubjects(),
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
}

/**
 * Deletes a subject by ID
 */
function deleteSubject(req, res) {
  try {
    const updated = subjectModel.deleteSubject(req.params.id);
    res.json({ ok: true, subjects: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  getSubjects,
  createOrUpdateSubject,
  deleteSubject,
};
