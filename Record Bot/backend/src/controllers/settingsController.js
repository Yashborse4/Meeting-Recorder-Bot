/**
 * backend/src/controllers/settingsController.js
 * Controller handling global preferences, storage path, auto-leave rules, and bot parameters
 */

const settingsModel = require('../models/settingsModel');

/**
 * Returns currently saved application settings
 */
function getSettings(req, res) {
  try {
    const settings = settingsModel.getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Validates and updates application settings
 */
function updateSettings(req, res) {
  try {
    const updated = settingsModel.saveSettings(req.body);
    res.json({ ok: true, settings: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
}

module.exports = {
  getSettings,
  updateSettings,
};
