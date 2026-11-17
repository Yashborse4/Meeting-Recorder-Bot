/**
 * backend/src/models/settingsModel.js
 * Model managing persistent bot preferences, storage path, and auto-leave configuration
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const SETTINGS_FILE = path.resolve(ROOT_DIR, 'settings.json');

const DEFAULT_SETTINGS = {
  storagePath: path.resolve(ROOT_DIR, 'recordings'),
  botName: 'Meeting Recorder Bot',
  muteMicOnJoin: true,
  turnOffCameraOnJoin: true,
  autoOpenBrowser: true,
  browserEngine: 'testing_chrome', // 'testing_chrome' | 'system_chrome'
  rejoinRetries: 3, // Auto retry up to 3 times to rejoin class if disconnected or join fails
  rejoinDelaySec: 10, // Wait 10 seconds between retry attempts
  autoRejoinOnDisconnect: true, // Auto retry rejoins if call drops unexpectedly
  maxLobbyWaitMin: 15, // Wait up to 15 minutes for host to let bot into class
  autoLeave: {
    enabled: true,
    minParticipants: 2,
    gracePeriodSec: 60,
    onHostExit: true,
    maxDurationEnforced: true,
    onSilence: false,
    silenceMinutes: 10,
  },
};

/**
 * Loads current settings from settings.json or initializes with defaults
 * @returns {object}
 */
function getSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[SettingsModel] Could not initialize settings.json:', e.message);
    }
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      autoLeave: {
        ...DEFAULT_SETTINGS.autoLeave,
        ...(parsed.autoLeave || {}),
      },
    };
  } catch (err) {
    console.error('[SettingsModel] Error reading settings.json:', err.message);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Merges and saves updated settings to settings.json
 * @param {object} newSettings
 * @returns {object}
 */
function saveSettings(newSettings) {
  try {
    let current = { ...DEFAULT_SETTINGS };
    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        current = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          autoLeave: {
            ...DEFAULT_SETTINGS.autoLeave,
            ...(parsed.autoLeave || {}),
          },
        };
      } catch (e) {
        // fallback to default
      }
    }

    const merged = {
      ...current,
      ...newSettings,
      autoLeave: {
        ...current.autoLeave,
        ...(newSettings.autoLeave || {}),
      },
    };

    // Ensure storage path directory exists
    if (merged.storagePath && !fs.existsSync(merged.storagePath)) {
      try {
        fs.mkdirSync(merged.storagePath, { recursive: true });
      } catch (e) {
        console.warn(`[SettingsModel] Could not create storage directory ${merged.storagePath}:`, e.message);
      }
    }

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  } catch (err) {
    console.error('[SettingsModel] Error saving settings.json:', err.message);
    throw err;
  }
}

module.exports = {
  SETTINGS_FILE,
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
};
