/**
 * backend/src/controllers/timetableController.js
 * Controller handling timetable CRUD operations, toggling, and queries
 */

const timetableModel = require('../models/timetableModel');

/**
 * Returns the entire weekly timetable list
 */
function getTimetable(req, res) {
  try {
    const timetable = timetableModel.loadTimetable();
    res.json(timetable);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Creates a new class or updates an existing class (single or multi-slot)
 */
function createOrUpdateClass(req, res) {
  try {
    const entry = timetableModel.addOrUpdateClass(req.body);
    res.json({
      ok: true,
      class: entry,
      timetable: timetableModel.loadTimetable(),
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
}

/**
 * Toggles a class enabled or disabled
 */
function toggleClass(req, res) {
  try {
    const updated = timetableModel.toggleClass(req.params.id);
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Class not found' });
    }
    res.json({
      ok: true,
      class: updated,
      timetable: timetableModel.loadTimetable(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Deletes a scheduled class by ID
 */
function deleteClass(req, res) {
  try {
    const updated = timetableModel.deleteClass(req.params.id);
    res.json({ ok: true, timetable: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  getTimetable,
  createOrUpdateClass,
  toggleClass,
  deleteClass,
};
