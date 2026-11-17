/**
 * backend/src/controllers/accountController.js
 * Controller handling Google Account authentication, desktop Chrome profile import, and sign out
 */

const accountModel = require('../models/accountModel');

/**
 * Returns current Google Account connection status and identity
 */
function getAccount(req, res) {
  try {
    const status = accountModel.getAccountStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Launches an interactive Chrome login window for Google authentication
 */
async function login(req, res) {
  try {
    const result = await accountModel.launchLoginWindow();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Imports Google Account credentials and cookies from the host Chrome profile
 */
function importAccount(req, res) {
  try {
    const result = accountModel.importFromSystemChrome();
    res.json({ ok: true, account: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Clears stored bot profile credentials and signs out
 */
function logout(req, res) {
  try {
    const result = accountModel.logoutAccount();
    res.json({ ok: true, account: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  getAccount,
  login,
  importAccount,
  logout,
};
