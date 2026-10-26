/**
 * backend/src/models/startupModel.js
 * Model managing Windows Startup integration (auto-run on PC boot using standard Windows .lnk shortcuts)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const config = require('../config');

const STARTUP_SHORTCUT_NAME = 'Google Meet Recorder.lnk';
const LEGACY_VBS_NAME = 'GoogleMeetRecorder.vbs';

/**
 * Resolves the path to the Windows Startup folder
 * @returns {string|null}
 */
function getStartupFolder() {
  const isWindows = process.platform === 'win32';
  const isWsl = process.platform === 'linux' && os.release().toLowerCase().includes('microsoft');

  if (isWindows && process.env.APPDATA) {
    const dir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    if (fs.existsSync(dir)) return dir;
  }

  // Support WSL environments
  if (isWsl) {
    const candidates = [
      process.env.APPDATA ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup') : null,
      '/mnt/c/Users/yashb/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup',
    ].filter(Boolean);

    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }

    try {
      const usersDir = '/mnt/c/Users';
      if (fs.existsSync(usersDir)) {
        const users = fs.readdirSync(usersDir);
        for (const u of users) {
          const testPath = path.join(usersDir, u, 'AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup');
          if (fs.existsSync(testPath)) return testPath;
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Returns full path to the startup shortcut (.lnk)
 * @returns {string|null}
 */
function getStartupShortcutPath() {
  const folder = getStartupFolder();
  if (!folder) return null;
  return path.join(folder, STARTUP_SHORTCUT_NAME);
}

/**
 * Checks if auto-run on Windows startup is currently active
 * @returns {boolean}
 */
function isStartupEnabled() {
  const folder = getStartupFolder();
  if (!folder) return false;

  const shortcutPath = path.join(folder, STARTUP_SHORTCUT_NAME);
  const legacyVbsPath = path.join(folder, LEGACY_VBS_NAME);

  return fs.existsSync(shortcutPath) || fs.existsSync(legacyVbsPath);
}

/**
 * Generates a standard Windows .lnk Shortcut to launch the bot minimized on PC boot.
 * Standard .lnk shortcuts are native Windows shell objects and are never flagged by antivirus.
 * @param {string} [customProjDir]
 * @returns {object} Status result
 */
function enableStartup(customProjDir = null) {
  const folder = getStartupFolder();
  if (!folder) {
    throw new Error('Windows Startup folder could not be detected on this system.');
  }

  // Clean up any legacy .vbs that might trigger antivirus
  const legacyVbsPath = path.join(folder, LEGACY_VBS_NAME);
  if (fs.existsSync(legacyVbsPath)) {
    try { fs.unlinkSync(legacyVbsPath); } catch {}
  }

  const shortcutPath = path.join(folder, STARTUP_SHORTCUT_NAME);

  // Determine Windows absolute directory path
  let winProjDir = customProjDir;
  if (!winProjDir) {
    const projDir = config.EXTENSION_ROOT; // e.g. E:\Recording Bot\Record Bot
    const wslMatch = projDir.match(/^\/mnt\/([a-zA-Z])\/(.*)/);
    if (wslMatch) {
      const drive = wslMatch[1].toUpperCase();
      const rest = wslMatch[2].replace(/\//g, '\\');
      winProjDir = `${drive}:\\${rest}`;
    } else {
      winProjDir = projDir.replace(/\//g, '\\');
    }
  }

  const targetBat = path.join(winProjDir, 'START_RECORDER.bat');

  // Create standard .lnk shortcut via PowerShell COM object (Run style 7 = Minimized)
  const psCommand = [
    `$ws = New-Object -ComObject WScript.Shell;`,
    `$s = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}');`,
    `$s.TargetPath = '${targetBat.replace(/'/g, "''")}';`,
    `$s.WorkingDirectory = '${winProjDir.replace(/'/g, "''")}';`,
    `$s.WindowStyle = 7;`,
    `$s.Save();`,
  ].join(' ');

  execSync(`powershell -NoProfile -Command "${psCommand}"`, { stdio: 'ignore' });

  return {
    enabled: true,
    path: shortcutPath,
    projectDir: winProjDir,
    message: 'Google Meet Recorder is now set to start automatically on Windows boot.',
  };
}

/**
 * Removes the startup shortcut from the Windows Startup folder
 * @returns {object}
 */
function disableStartup() {
  const folder = getStartupFolder();
  if (folder) {
    const shortcutPath = path.join(folder, STARTUP_SHORTCUT_NAME);
    if (fs.existsSync(shortcutPath)) {
      try { fs.unlinkSync(shortcutPath); } catch {}
    }
    const legacyVbsPath = path.join(folder, LEGACY_VBS_NAME);
    if (fs.existsSync(legacyVbsPath)) {
      try { fs.unlinkSync(legacyVbsPath); } catch {}
    }
  }

  return {
    enabled: false,
    message: 'Google Meet Recorder was removed from Windows Startup.',
  };
}

module.exports = {
  getStartupFolder,
  getStartupShortcutPath,
  isStartupEnabled,
  enableStartup,
  disableStartup,
};
