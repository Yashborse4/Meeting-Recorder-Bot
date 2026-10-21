/**
 * backend/src/config.js
 * Centralized configuration for the backend bot controller
 */

const fs = require('fs');
const path = require('path');
const { getSettings } = require('./settingsManager');

const ROOT_DIR = path.resolve(__dirname, '..');
const EXTENSION_ROOT = path.resolve(ROOT_DIR, '..');

module.exports = {
  ROOT_DIR,

  // Deterministic extension ID defined by the RSA public key in manifest.json
  EXTENSION_ID: 'mplkadfplilndegehopgdojhlpddgdfl',

  // Path to compiled extension
  EXTENSION_PATH: path.resolve(EXTENSION_ROOT, 'dist'),

  // Persistent browser user profile directory (preserves Google account login)
  BOT_PROFILE_DIR: path.resolve(ROOT_DIR, 'bot_profile'),

  // Dynamic output directory for recordings & transcripts
  getDownloadDir: function () {
    try {
      const settings = getSettings();
      if (settings.storagePath) {
        if (!fs.existsSync(settings.storagePath)) {
          fs.mkdirSync(settings.storagePath, { recursive: true });
        }
        return settings.storagePath;
      }
    } catch {}
    const defaultPath = path.resolve(ROOT_DIR, 'recordings');
    if (!fs.existsSync(defaultPath)) fs.mkdirSync(defaultPath, { recursive: true });
    return defaultPath;
  },

  // Timetable file path
  TIMETABLE_FILE: path.resolve(ROOT_DIR, 'timetable.json'),

  // Auto-detect Chrome for Testing or installed Chrome based on settings
  getExecutablePath: function () {
    const standardPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];

    try {
      const settings = getSettings();
      if (settings.browserEngine === 'system_chrome') {
        for (const p of standardPaths) {
          if (fs.existsSync(p)) return p;
        }
      }
    } catch {}

    const chromeDir = path.resolve(ROOT_DIR, 'chrome');
    if (fs.existsSync(chromeDir)) {
      try {
        const dirs = fs.readdirSync(chromeDir);
        for (const d of dirs) {
          const candidate = path.join(chromeDir, d, 'chrome-win64', 'chrome.exe');
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        }
      } catch {}
    }

    // Fallback: check standard Windows Google Chrome paths
    for (const p of standardPaths) {
      if (fs.existsSync(p)) return p;
    }
    return undefined;
  },

  // Chromium launch flags required for hands-free tabCapture without user prompts
  getChromeArgs: function (extensionPath, extensionId) {
    return [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--allowlisted-extension-id=${extensionId}`,
      `--whitelisted-extension-id=${extensionId}`,
      '--enable-features=MediaRouter',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-usermedia-screen-capturing',
      '--auto-select-desktop-capture-source=Entire screen',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-default-browser-check',
    ];
  },
};
