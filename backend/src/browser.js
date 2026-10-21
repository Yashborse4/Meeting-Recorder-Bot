/**
 * backend/src/browser.js
 * Manages Chromium browser lifecycle, flags, persistent profile, and CDP behaviors
 */

const puppeteer = require('puppeteer');
const config = require('./config');

async function createBrowser(options = {}) {
  const extensionPath = options.extensionPath || config.EXTENSION_PATH;
  const extensionId = options.extensionId || config.EXTENSION_ID;
  const downloadDir = options.downloadDir || config.getDownloadDir();
  const executablePath = options.executablePath || config.getExecutablePath();
  const userDataDir = options.userDataDir || config.BOT_PROFILE_DIR;

  const args = config.getChromeArgs(extensionPath, extensionId);

  if (options.additionalArgs && Array.isArray(options.additionalArgs)) {
    args.push(...options.additionalArgs);
  }

  console.log(`[Backend/Browser] Launching browser: ${executablePath || 'default'}`);
  console.log(`[Backend/Browser] Persistent Profile: ${userDataDir}`);
  console.log(`[Backend/Browser] Destination Directory: ${downloadDir}`);

  const browser = await puppeteer.launch({
    headless: false, // tabCapture requires non-headless rendering
    defaultViewport: null,
    executablePath,
    userDataDir,
    ignoreDefaultArgs: ['--disable-extensions'],
    args,
  });

  const page = await browser.newPage();

  // Configure Chrome DevTools Protocol to route downloads to configured storage folder
  const cdpSession = await page.target().createCDPSession();
  await cdpSession.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  });

  return { browser, page, cdpSession, downloadDir };
}

module.exports = { createBrowser };
