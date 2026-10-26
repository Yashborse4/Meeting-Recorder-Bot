/**
 * backend/src/controllers/startupController.js
 * Controller handling Windows startup query and toggle requests
 */

const startupModel = require('../models/startupModel');

/**
 * Returns whether Windows auto-startup is currently enabled
 */
function getStartupStatus(req, res) {
  try {
    const enabled = startupModel.isStartupEnabled();
    const folder = startupModel.getStartupFolder();
    res.json({
      ok: true,
      enabled,
      supported: !!folder,
      startupFolder: folder,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Toggles Windows auto-startup on or off
 */
function toggleStartup(req, res) {
  try {
    const currentlyEnabled = startupModel.isStartupEnabled();
    let result;
    if (currentlyEnabled) {
      result = startupModel.disableStartup();
    } else {
      result = startupModel.enableStartup();
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  getStartupStatus,
  toggleStartup,
};
