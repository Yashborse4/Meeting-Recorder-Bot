/**
 * backend/src/utils/browserLauncher.js
 * Cross-platform helper to launch URLs in the operating system's default browser
 */

const { exec } = require('child_process');
const os = require('os');

/**
 * Opens a specified URL in the OS default web browser
 * Supports Windows, WSL (Windows Subsystem for Linux), macOS, and Linux
 * @param {string} url
 */
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
    console.log(`[BrowserLauncher] Opened "${target}" in default OS browser.`);
  } catch (err) {
    console.warn(`[BrowserLauncher] Could not launch default browser:`, err.message);
  }
}

module.exports = { openInDefaultBrowser };
