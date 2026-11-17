/**
 * backend/src/controllers/statusController.js
 * Controller handling system health, daemon state, and live bot statuses
 */

const schedulerService = require('../services/schedulerService');
const accountModel = require('../models/accountModel');

/**
 * Returns aggregated status for scheduler, bot, upcoming class, and Google account
 */
function getStatus(req, res) {
  try {
    const status = schedulerService.getStatus();
    const account = accountModel.getAccountStatus();
    res.json({ ...status, account });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Toggles the background timetable monitor daemon on or off
 */
function toggleScheduler(req, res) {
  try {
    const current = schedulerService.getStatus().daemonRunning;
    if (current) {
      schedulerService.stopSchedulerDaemon();
    } else {
      schedulerService.startSchedulerDaemon();
    }
    res.json(schedulerService.getStatus());
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  getStatus,
  toggleScheduler,
};
