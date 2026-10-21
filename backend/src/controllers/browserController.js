/**
 * backend/src/controllers/browserController.js
 * Controller handling system browser launching requests
 */

const { openInDefaultBrowser } = require('../utils/browserLauncher');

/**
 * Triggers opening a URL in the OS default browser
 */
function openBrowser(req, res) {
  const PORT = process.env.PORT || 3000;
  const { url } = req.body || {};
  const targetUrl = url || `http://localhost:${PORT}`;

  try {
    openInDefaultBrowser(targetUrl);
    res.json({ ok: true, url: targetUrl });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  openBrowser,
};
