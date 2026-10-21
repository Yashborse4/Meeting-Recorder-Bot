/**
 * backend/src/accountManager.js
 * Manages Google Account authentication, persistent profiles, and account detection
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const config = require('./config');

const ROOT_DIR = path.resolve(__dirname, '..');
const BOT_PROFILE_DIR = path.resolve(ROOT_DIR, 'bot_profile');

// Typical default Google Chrome user data path on Windows
const SYSTEM_CHROME_DIR = 'C:\\Users\\yashb\\AppData\\Local\\Google\\Chrome\\User Data\\Default';

function readAccountFromPreferences(prefPath) {
  if (!fs.existsSync(prefPath)) return null;
  try {
    const raw = fs.readFileSync(prefPath, 'utf-8');
    const data = JSON.parse(raw);

    // 1. Check account_info array (standard modern Chromium)
    if (Array.isArray(data.account_info) && data.account_info.length > 0) {
      const acc = data.account_info[0];
      return {
        email: acc.email || 'Unknown Email',
        name: acc.full_name || acc.given_name || 'Google User',
        avatar: acc.picture_url || acc.last_downloaded_image_url_with_size || null,
        gaia: acc.gaia || acc.account_id || null,
      };
    }

    // 2. Fallback: check profile.name or signin
    if (data.google?.services?.username) {
      return {
        email: data.google.services.username,
        name: data.profile?.name || 'Google User',
        avatar: null,
      };
    }
  } catch (err) {
    // Error reading JSON, profile might be locked by another process
  }
  return null;
}

function getAccountStatus() {
  const botPref = path.join(BOT_PROFILE_DIR, 'Default', 'Preferences');
  const botAccount = readAccountFromPreferences(botPref);

  if (botAccount) {
    return {
      connected: true,
      account: botAccount,
      source: 'bot_profile',
      message: `Connected as ${botAccount.email}`,
    };
  }

  // Check if system Chrome has an account available for 1-click import
  const sysPref = path.join(SYSTEM_CHROME_DIR, 'Preferences');
  const sysAccount = readAccountFromPreferences(sysPref);

  if (sysAccount) {
    return {
      connected: false,
      hasSystemAccount: true,
      systemAccount: sysAccount,
      message: `Detected desktop Chrome account: ${sysAccount.email}. Click "Quick Import" or "Log In".`,
    };
  }

  return {
    connected: false,
    hasSystemAccount: false,
    message: 'No Google account connected. Running in Guest mode.',
  };
}

let activeLoginBrowser = null;

async function launchLoginWindow() {
  if (activeLoginBrowser) {
    return { ok: true, message: 'Login window is already open.' };
  }

  const executablePath = config.getExecutablePath();
  console.log('[AccountManager] Launching Google Login window in Chrome...');

  try {
    const browser = await puppeteer.launch({
      executablePath,
      headless: false,
      defaultViewport: null,
      userDataDir: BOT_PROFILE_DIR,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--app=https://accounts.google.com/signin',
      ],
    });

    activeLoginBrowser = browser;

    browser.on('disconnected', () => {
      activeLoginBrowser = null;
      console.log('[AccountManager] Login window closed by user.');
    });

    return { ok: true, message: 'Login window opened. Complete login in the browser window.' };
  } catch (err) {
    activeLoginBrowser = null;
    console.error('[AccountManager] Failed to launch login window:', err.message);
    throw err;
  }
}

function importFromSystemChrome() {
  if (!fs.existsSync(SYSTEM_CHROME_DIR)) {
    throw new Error('Default Google Chrome profile not found on this computer.');
  }

  console.log(`[AccountManager] Importing Google login from ${SYSTEM_CHROME_DIR}...`);

  if (!fs.existsSync(BOT_PROFILE_DIR)) {
    fs.mkdirSync(BOT_PROFILE_DIR, { recursive: true });
  }

  const botDefault = path.join(BOT_PROFILE_DIR, 'Default');
  if (!fs.existsSync(botDefault)) {
    fs.mkdirSync(botDefault, { recursive: true });
  }

  // Essential files for preserving login sessions
  const filesToCopy = [
    'Preferences',
    'Secure Preferences',
    'Cookies',
    'Network',
    'Login Data',
    'Web Data',
  ];

  for (const item of filesToCopy) {
    const src = path.join(SYSTEM_CHROME_DIR, item);
    const dest = path.join(botDefault, item);

    try {
      if (fs.existsSync(src)) {
        if (fs.statSync(src).isDirectory()) {
          fs.cpSync(src, dest, { recursive: true });
        } else {
          fs.copyFileSync(src, dest);
        }
      }
    } catch (e) {
      console.warn(`[AccountManager] Warning copying ${item}:`, e.message);
    }
  }

  const updatedStatus = getAccountStatus();
  console.log('[AccountManager] Import completed. New status:', updatedStatus);
  return updatedStatus;
}

function logoutAccount() {
  console.log('[AccountManager] Logging out and clearing bot profile credentials...');
  const botDefault = path.join(BOT_PROFILE_DIR, 'Default');
  if (fs.existsSync(botDefault)) {
    const filesToRemove = ['Preferences', 'Secure Preferences', 'Cookies', 'Network', 'Login Data', 'Web Data'];
    for (const item of filesToRemove) {
      const p = path.join(botDefault, item);
      try {
        if (fs.existsSync(p)) {
          if (fs.statSync(p).isDirectory()) {
            fs.rmSync(p, { recursive: true, force: true });
          } else {
            fs.unlinkSync(p);
          }
        }
      } catch (e) {
        console.warn(`[AccountManager] Could not remove ${item}:`, e.message);
      }
    }
  }
  return getAccountStatus();
}

module.exports = {
  BOT_PROFILE_DIR,
  getAccountStatus,
  launchLoginWindow,
  importFromSystemChrome,
  logoutAccount,
};
