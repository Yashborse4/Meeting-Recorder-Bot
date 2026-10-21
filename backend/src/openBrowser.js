/**
 * backend/src/openBrowser.js
 * Cross-platform helper to launch URLs in the operating system's default browser
 */

const { exec } = require('child_process');
const os = require('os');

function openInDefaultBrowser(url) {
  if (!url) return;
  const target = String(url).trim();
  const platform = process.platform;
  const isWsl = platform === 'linux' && os.release().toLowerCase().includes('microsoft');

  try {
    if (platform === 'win32') {
      exec(`start "" "${target}"`);
    } else if (isWsl) {
      exec(`cmd.exe /c start "" "${target}" < /dev/null`);
    } else if (platform === 'darwin') {
      exec(`open "${target}"`);
    } else {
      exec(`xdg-open "${target}"`);
    }
    console.log(`[Browser] Opened "${target}" in default OS browser.`);
  } catch (err) {
    console.warn(`[Browser] Could not launch default browser:`, err.message);
  }
}

module.exports = { openInDefaultBrowser };
