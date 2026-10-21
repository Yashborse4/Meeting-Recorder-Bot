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
    await new Promise((r) => setTimeout(r, 3000));

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
    } catch (e) {
      console.warn('[Backend/MeetBot] Name input handling:', e.message);
    }

    // Turn off camera and mute mic if requested
    if (this.options.turnOffCameraOnJoin) {
      try {
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyE');
        await this.page.keyboard.up('Control');
        await new Promise((r) => setTimeout(r, 500));
      } catch {}
    }

    if (this.options.muteMicOnJoin) {
      try {
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyD');
        await this.page.keyboard.up('Control');
        await new Promise((r) => setTimeout(r, 500));
      } catch {}
    }

    // Poll for Join / Ask to join / Rejoin button
    console.log('[Backend/MeetBot] Searching for Join/Rejoin button...');
    let joined = false;
    const maxPollAttempts = 10;
    for (let i = 0; i < maxPollAttempts; i++) {
      // 1. Check if an error message is visible
      const errorMsg = await this.page.evaluate(() => {
        const text = document.body ? document.body.innerText || '' : '';
        if (text.includes("You can't join this video call")) return "You can't join this video call";
        if (text.includes("Couldn't connect to the meeting")) return "Couldn't connect to the meeting";
        if (text.includes("This meeting link is invalid") || text.includes("Invalid meeting code")) return "Invalid meeting link";
        return null;
      });

      if (errorMsg) {
        throw new Error(`Google Meet lobby error: ${errorMsg}`);
      }

      // 2. Check if already in meeting (leave call button present)
      const inCall = await this.page.evaluate(() => {
        const leaveBtn = document.querySelector('button[aria-label*="leave call" i], button[aria-label*="leave meeting" i]');
        return !!leaveBtn;
      });

      if (inCall) {
        console.log('[Backend/MeetBot] Already entered meeting room.');
        joined = true;
        break;
      }

      // 3. Find and click Join / Rejoin / Ask to join button
      const clicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        for (const btn of buttons) {
          const text = (btn.innerText || '').trim();
          const aria = (btn.getAttribute('aria-label') || '').trim();
          const combined = `${text} ${aria}`.toLowerCase();

          if (/^(join now|ask to join|join|rejoin)$/i.test(text) ||
              combined.includes('join now') ||
              combined.includes('ask to join') ||
              combined.includes('rejoin') ||
              combined === 'join') {
            btn.click();
            return text || aria || 'Join';
          }
        }
        return null;
      });

      if (clicked) {
        console.log(`[Backend/MeetBot] Clicked button: "${clicked}"`);
        joined = true;
        break;
      }

      await new Promise((r) => setTimeout(r, 1500));
    }

    if (!joined) {
      console.warn('[Backend/MeetBot] Could not find explicit Join button, checking if already in waiting lobby...');
    }

    await new Promise((r) => setTimeout(r, 4000));

    // Turn on live captions in Meet so the content script can harvest transcripts
    try {
      await this.page.keyboard.press('KeyC');
      console.log('[Backend/MeetBot] Turned on captions (KeyC).');
    } catch {}
  }

  async startRecording(durationMinutes = 60, onAutoLeave = null, onUnexpectedDisconnect = null) {
    if (!this.page) throw new Error('Bot not active.');
    console.log('[Backend/MeetBot] Dispatching START_RECORDING_BOT event hands-free...');

    // In-page DOM event (zero user interaction required)
    await this.page.evaluate(() => {
      window.postMessage({ type: 'START_RECORDING_BOT' }, '*');
    });

    this.isRecording = true;
    console.log('[Backend/MeetBot] Recording successfully initiated!');

    // Start auto-leave and disconnect watcher
    this.startAutoLeaveWatcher(durationMinutes, onAutoLeave, onUnexpectedDisconnect);
  }

  startAutoLeaveWatcher(durationMinutes, onAutoLeave, onUnexpectedDisconnect) {
    const autoLeave = this.options.autoLeave || {};
    const startTime = Date.now();
    const maxDurationMs = durationMinutes * 60 * 1000;
    let lowParticipantStart = null;

    this.monitorInterval = setInterval(async () => {
      if (!this.isRecording || !this.page) {
        clearInterval(this.monitorInterval);
        return;
      }

      try {
        if (this.page.isClosed()) {
          console.log('[Backend/MeetBot] Meet page was closed unexpectedly.');
          clearInterval(this.monitorInterval);
          if (typeof onUnexpectedDisconnect === 'function') onUnexpectedDisconnect('page_closed');
          return;
        }

        // Check for on-screen "Rejoin" / "Try again" prompt after connection drop
        const clickedRejoin = await this.page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'));
          const rejoinBtn = buttons.find((b) => {
            const text = (b.innerText || '').trim().toLowerCase();
            const aria = (b.getAttribute('aria-label') || '').toLowerCase();
            return text === 'rejoin' || aria.includes('rejoin') || text === 'try again';
          });
          if (rejoinBtn) {
            rejoinBtn.click();
            return true;
          }
          return false;
        });

        if (clickedRejoin) {
          console.log('[Backend/MeetBot] 🔄 Detected on-screen Rejoin button after disconnect. Clicked Rejoin!');
          return;
        }

        // 1. Check max duration limit
        if (autoLeave.enabled && autoLeave.maxDurationEnforced && Date.now() - startTime >= maxDurationMs) {
          console.log(`[Backend/MeetBot] Max scheduled duration (${durationMinutes}m) reached. Auto-leaving meeting...`);
          clearInterval(this.monitorInterval);
          await this.leaveAndStop();
          if (typeof onAutoLeave === 'function') onAutoLeave('duration_reached');
          return;
        }

        // 2. Check if host ended call or exit screen is visible
        if (autoLeave.enabled && autoLeave.onHostExit) {
          const isExitScreen = await this.page.evaluate(() => {
            const body = document.body ? document.body.innerText || '' : '';
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

        // 3. Check for unexpected network disconnected screen (without a clickable rejoin)
        const isNetworkDropped = await this.page.evaluate(() => {
          const body = document.body ? document.body.innerText || '' : '';
          return body.includes('You lost your network connection') || body.includes('Unable to join the call');
        });

        if (isNetworkDropped) {
          console.warn('[Backend/MeetBot] Network connection dropped in Google Meet.');
          clearInterval(this.monitorInterval);
          if (typeof onUnexpectedDisconnect === 'function') {
            onUnexpectedDisconnect('network_dropped');
            return;
          }
        }

        // 4. Check participant count drop
        if (autoLeave.enabled && autoLeave.minParticipants && autoLeave.minParticipants > 0) {
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
    }, 4000);
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
