/**
 * backend/src/services/browserService.js
 * Service managing Chromium browser lifecycle, flags, persistent profile, and CDP behaviors
 */

const puppeteer = require('puppeteer');
const config = require('../config');

/**
 * Creates and launches a configured Puppeteer browser instance with Chrome extension loaded
 * @param {object} options
 * @returns {Promise<{browser: any, page: any, cdpSession: any, downloadDir: string}>}
 */
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

  console.log(`[BrowserService] Launching browser: ${executablePath || 'default'}`);
  console.log(`[BrowserService] Persistent Profile: ${userDataDir}`);
  console.log(`[BrowserService] Destination Directory: ${downloadDir}`);

  const browser = await puppeteer.launch({
    headless: false, // Chrome extension tabCapture requires non-headless rendering
    defaultViewport: null,
    executablePath,
    userDataDir,
    ignoreDefaultArgs: ['--disable-extensions'],
    args,
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();

  // Configure Chrome DevTools Protocol to route downloads to configured storage folder
  const cdpSession = await page.target().createCDPSession();
  await cdpSession.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir,
  });

  return { browser, page, cdpSession, downloadDir };
}

module.exports = { createBrowser };
