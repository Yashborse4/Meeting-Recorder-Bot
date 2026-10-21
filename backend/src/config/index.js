/**
 * backend/src/config/index.js
 * Central configuration module for paths, Chrome flags, and extension metadata
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const EXTENSION_ROOT = path.resolve(ROOT_DIR, '..');
const TIMETABLE_FILE = path.resolve(ROOT_DIR, 'timetable.json');
const SETTINGS_FILE = path.resolve(ROOT_DIR, 'settings.json');
const BOT_PROFILE_DIR = path.resolve(ROOT_DIR, 'bot_profile');
const EXTENSION_PATH = path.resolve(EXTENSION_ROOT, 'dist');
const EXTENSION_ID = 'mplkadfplilndegehopgdojhlpddgdfl';
const DEFAULT_BOT_NAME = 'Meeting Recorder Bot';

/**
 * Resolves the active recording download directory based on settings
 */
function getDownloadDir() {
  try {
    const { getSettings } = require('../models/settingsModel');
    const settings = getSettings();
    if (settings && settings.storagePath) {
      if (!fs.existsSync(settings.storagePath)) {
        fs.mkdirSync(settings.storagePath, { recursive: true });
      }
      return settings.storagePath;
    }
  } catch {}
  const defaultPath = path.resolve(ROOT_DIR, 'recordings');
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
  }
  return defaultPath;
}

/**
 * Detects Chrome for Testing or installed Chrome / Chromium executable
 */
function getExecutablePath() {
  const standardPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];

  try {
    const { getSettings } = require('../models/settingsModel');
    const settings = getSettings();
    if (settings && settings.browserEngine === 'system_chrome') {
      for (const p of standardPaths) {
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {}

  // Check locally bundled testing chrome under backend/chrome
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

  // Fallback: check standard paths
  for (const p of standardPaths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/**
 * Chromium command-line flags required for hands-free tab capture without user prompts
 */
function getChromeArgs(extPath = EXTENSION_PATH, extId = EXTENSION_ID) {
  return [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
    `--allowlisted-extension-id=${extId}`,
    `--whitelisted-extension-id=${extId}`,
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
}

module.exports = {
  ROOT_DIR,
  EXTENSION_ROOT,
  EXTENSION_ID,
  EXTENSION_PATH,
  BOT_PROFILE_DIR,
  TIMETABLE_FILE,
  SETTINGS_FILE,
  DEFAULT_BOT_NAME,
  getDownloadDir,
  getExecutablePath,
  getChromeArgs,
};
