/**
 * backend/src/meetBot.js
 * Google Meet navigation, lobby automation, and recording controller with auto-leave rules
 */

const { createBrowser } = require('./browser');
const { waitForDownloads, writeSessionMetadata } = require('./storage');
const { getSettings } = require('./settingsManager');
const config = require('./config');

class MeetRecorderBot {
  constructor(options = {}) {
    const settings = getSettings();
    this.options = {
      botName: options.botName || settings.botName || config.DEFAULT_BOT_NAME,
      muteMicOnJoin: options.muteMicOnJoin !== undefined ? options.muteMicOnJoin : settings.muteMicOnJoin,
      turnOffCameraOnJoin: options.turnOffCameraOnJoin !== undefined ? options.turnOffCameraOnJoin : settings.turnOffCameraOnJoin,
      autoLeave: {
        ...settings.autoLeave,
        ...(options.autoLeave || {}),
      },
      ...options,
    };
    this.browser = null;
    this.page = null;
    this.isRecording = false;
    this.monitorInterval = null;
  }

  async launch() {
    const downloadDir = config.getDownloadDir();
    const { browser, page } = await createBrowser({
      ...this.options,
      downloadDir,
    });
    this.browser = browser;
    this.page = page;
    this.downloadDir = downloadDir;
  }

  async joinMeeting(meetingUrl) {
    if (!this.page) throw new Error('Bot not launched. Call launch() first.');

    console.log(`[Backend/MeetBot] Navigating to: ${meetingUrl}`);
    const context = this.browser.defaultBrowserContext();
    await context.overridePermissions(meetingUrl, ['microphone', 'camera']);

    await this.page.goto(meetingUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 4000));

    // Handle lobby name input (if not logged into Google account)
    try {
      const nameInputSelector = 'input[type="text"][aria-label*="name" i], input[placeholder*="name" i]';
      const nameInput = await this.page.$(nameInputSelector);
      if (nameInput) {
        console.log(`[Backend/MeetBot] Guest mode: entering display name "${this.options.botName}"`);
        await nameInput.click({ clickCount: 3 });
        await nameInput.type(this.options.botName, { delay: 40 });
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch {}

    // Turn off camera and mute mic if requested
    if (this.options.turnOffCameraOnJoin) {
      try {
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyE');
        await this.page.keyboard.up('Control');
      } catch {}
    }

    if (this.options.muteMicOnJoin) {
      try {
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyD');
        await this.page.keyboard.up('Control');
      } catch {}
    }

    // Click "Join now" or "Ask to join" button
    console.log('[Backend/MeetBot] Attempting to click Join button...');
    try {
      const joinButtons = await this.page.$$('button');
      for (const btn of joinButtons) {
        const text = await (await btn.getProperty('innerText')).jsonValue();
        if (/join now|ask to join|join/i.test(text.trim())) {
          await btn.click();
          console.log(`[Backend/MeetBot] Clicked button: "${text.trim()}"`);
          break;
        }
      }
    } catch (e) {
      console.warn('[Backend/MeetBot] Join button click warning:', e.message);
    }

    await new Promise((r) => setTimeout(r, 4000));

    // Turn on live captions in Meet so the content script can harvest transcripts
    try {
      await this.page.keyboard.press('KeyC');
      console.log('[Backend/MeetBot] Turned on captions (KeyC).');
    } catch {}
  }

  async startRecording(durationMinutes = 60, onAutoLeave = null) {
    if (!this.page) throw new Error('Bot not active.');
    console.log('[Backend/MeetBot] Dispatching START_RECORDING_BOT event hands-free...');

    // In-page DOM event (zero user interaction required)
    await this.page.evaluate(() => {
      window.postMessage({ type: 'START_RECORDING_BOT' }, '*');
    });

    this.isRecording = true;
    console.log('[Backend/MeetBot] Recording successfully initiated!');

    // Start auto-leave watcher
    this.startAutoLeaveWatcher(durationMinutes, onAutoLeave);
  }

  startAutoLeaveWatcher(durationMinutes, onAutoLeave) {
    const autoLeave = this.options.autoLeave || {};
    if (!autoLeave.enabled) return;

    const startTime = Date.now();
    const maxDurationMs = durationMinutes * 60 * 1000;
    let lowParticipantStart = null;

    this.monitorInterval = setInterval(async () => {
      if (!this.isRecording || !this.page) {
        clearInterval(this.monitorInterval);
        return;
      }

      try {
        // 1. Check max duration limit
        if (autoLeave.maxDurationEnforced && Date.now() - startTime >= maxDurationMs) {
          console.log(`[Backend/MeetBot] Max scheduled duration (${durationMinutes}m) reached. Auto-leaving meeting...`);
          clearInterval(this.monitorInterval);
          await this.leaveAndStop();
          if (typeof onAutoLeave === 'function') onAutoLeave('duration_reached');
          return;
        }

        // 2. Check if host ended call or exit screen is visible
        if (autoLeave.onHostExit) {
          const isExitScreen = await this.page.evaluate(() => {
            const body = document.body.innerText || '';
            return (
              body.includes('The meeting has ended for everyone') ||
              body.includes('Your host ended the meeting') ||
              body.includes('You have been removed from the meeting') ||
              body.includes('You’ve been removed from the meeting')
            );
          });

          if (isExitScreen) {
            console.log('[Backend/MeetBot] Host ended call or removed from meeting. Auto-leaving...');
            clearInterval(this.monitorInterval);
            await this.leaveAndStop();
            if (typeof onAutoLeave === 'function') onAutoLeave('host_ended');
            return;
          }
        }

        // 3. Check participant count drop
        if (autoLeave.minParticipants && autoLeave.minParticipants > 0) {
          const participantCount = await this.page.evaluate(() => {
            const peopleBtn = document.querySelector(
              'button[aria-label*="people" i], button[aria-label*="everyone" i], button[aria-label*="participants" i]'
            );
            if (peopleBtn) {
              const match = (peopleBtn.getAttribute('aria-label') || '').match(/\d+/);
              if (match) return parseInt(match[0], 10);
            }
            const tiles = document.querySelectorAll('[data-participant-id], [data-requested-participant-id]');
            if (tiles.length > 0) return tiles.length;
            return null;
          });

          if (typeof participantCount === 'number') {
            if (participantCount <= autoLeave.minParticipants) {
              if (!lowParticipantStart) {
                lowParticipantStart = Date.now();
                console.log(
                  `[Backend/MeetBot] Participants dropped to ${participantCount} (<= ${autoLeave.minParticipants}). Grace timer started...`
                );
              } else {
                const elapsedGrace = (Date.now() - lowParticipantStart) / 1000;
                const graceNeeded = autoLeave.gracePeriodSec || 60;
                if (elapsedGrace >= graceNeeded) {
                  console.log(
                    `[Backend/MeetBot] Participant count remained <= ${autoLeave.minParticipants} for ${graceNeeded}s. Auto-leaving meeting...`
                  );
                  clearInterval(this.monitorInterval);
                  await this.leaveAndStop();
                  if (typeof onAutoLeave === 'function') onAutoLeave('min_participants');
                  return;
                }
              }
            } else {
              // Participant count recovered
              if (lowParticipantStart) {
                console.log(`[Backend/MeetBot] Participant count increased to ${participantCount}. Grace timer reset.`);
                lowParticipantStart = null;
              }
            }
          }
        }
      } catch (err) {
        // Page navigation or evaluation error
      }
    }, 5000);
  }

  async leaveAndStop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    // Attempt to click Meet's red Leave Call button
    if (this.page) {
      try {
        await this.page.evaluate(() => {
          const leaveBtn = document.querySelector('button[aria-label*="leave call" i], button[aria-label*="leave meeting" i]');
          if (leaveBtn) leaveBtn.click();
        });
      } catch {}
    }

    return this.stopRecording();
  }

  async stopRecording() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (!this.page || !this.isRecording) return;
    console.log('[Backend/MeetBot] Dispatching STOP_RECORDING_BOT event...');

    try {
      await this.page.evaluate(() => {
        window.postMessage({ type: 'STOP_RECORDING_BOT' }, '*');
      });
    } catch {}

    this.isRecording = false;
    console.log(`[Backend/MeetBot] Stop command sent. Waiting for downloads in ${this.downloadDir}...`);

    // Wait for the .webm and transcripts to finish saving
    const results = await waitForDownloads(this.downloadDir);
    writeSessionMetadata(this.downloadDir, {
      completedAt: new Date().toISOString(),
      files: results,
    });
    return results;
  }

  async close() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = { MeetRecorderBot };
