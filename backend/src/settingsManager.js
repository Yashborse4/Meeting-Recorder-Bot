/**
 * backend/src/settingsManager.js
 * Persistent configuration for bot settings, storage path, and auto-leave rules
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SETTINGS_FILE = path.resolve(ROOT_DIR, 'settings.json');

const DEFAULT_SETTINGS = {
  storagePath: path.resolve(ROOT_DIR, 'recordings'),
  botName: 'Meeting Recorder Bot',
  muteMicOnJoin: true,
  turnOffCameraOnJoin: true,
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

function getSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[Settings] Could not initialize settings.json:', e.message);
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
    console.error('[Settings] Error reading settings.json:', err.message);
    return { ...DEFAULT_SETTINGS };
  }
}

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
        console.warn(`[Settings] Could not create storage directory ${merged.storagePath}:`, e.message);
      }
    }

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  } catch (err) {
    console.error('[Settings] Error saving settings.json:', err.message);
    throw err;
  }
}

module.exports = { getSettings, saveSettings, DEFAULT_SETTINGS };
