/**
 * backend/src/services/meetBot.js
 * Google Meet navigation, lobby automation, and recording controller with auto-leave rules
 */

const fs = require('fs');
const { createBrowser } = require('./browserService');
const { waitForDownloads, writeSessionMetadata } = require('./storageService');
const { getSettings } = require('../models/settingsModel');
const config = require('../config');

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
    this.downloadDir = null;
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

  async checkMeetingState() {
    if (!this.page || this.page.isClosed()) {
      return { state: 'CLOSED', message: 'Browser page is closed' };
    }

    return await this.page.evaluate(() => {
      const text = document.body ? document.body.innerText || '' : '';
      const textLower = text.toLowerCase();

      // 1. Check for host rejection / denial
      if (
        text.includes('Someone denied your request to join') ||
        text.includes("You can't join this video call") ||
        text.includes("You can’t join this video call") ||
        text.includes('Your request to join was denied') ||
        text.includes('Unable to join the call')
      ) {
        return { state: 'DENIED', message: 'Host denied request to join the class' };
      }

      // 2. Check for invalid meeting link or fatal connection errors
      if (
        text.includes('This meeting link is invalid') ||
        text.includes('Invalid meeting code') ||
        text.includes("Couldn't connect to the meeting")
      ) {
        return { state: 'ERROR', message: 'Invalid or inaccessible meeting link' };
      }

      // 3. Check if inside the live meeting room
      const hasLeaveBtn = !!document.querySelector(
        'button[aria-label*="leave call" i], button[aria-label*="leave meeting" i], button[aria-label*="end call" i]'
      );
      const hasPeopleBtn = !!document.querySelector(
        'button[aria-label*="everyone" i], button[aria-label*="people" i], button[aria-label*="show everyone" i]'
      );
      const hasChatBtn = !!document.querySelector(
        'button[aria-label*="chat with everyone" i], button[aria-label*="in-call messages" i]'
      );
      const hasCallControls = !!document.querySelector(
        '[data-unhovered-bottom-bar], div[role="region"][aria-label*="call controls" i], div[role="region"][aria-label*="meeting controls" i]'
      );
      const participantTiles = document.querySelectorAll('[data-participant-id], [data-requested-participant-id]');

      if (hasLeaveBtn || (hasCallControls && (hasPeopleBtn || hasChatBtn || participantTiles.length > 0))) {
        return { state: 'IN_MEETING', message: 'Inside meeting room' };
      }

      // 4. Check if waiting for host approval
      if (
        textLower.includes('asking to join') ||
        textLower.includes("you'll join the call when someone lets you in") ||
        textLower.includes("you’ll join the call when someone lets you in") ||
        textLower.includes('someone will let you in soon') ||
        textLower.includes('waiting for host to admit you') ||
        textLower.includes('waiting for host')
      ) {
        return { state: 'WAITING_FOR_HOST', message: 'Waiting for host to admit you to the class...' };
      }

      // 5. In lobby (not yet joined)
      return { state: 'LOBBY', message: 'In Google Meet pre-join lobby' };
    });
  }

  async waitForAdmission(maxWaitMinutes = 15, onStatusUpdate = null) {
    const maxWaitMs = maxWaitMinutes * 60 * 1000;
    const startWait = Date.now();
    let lastLoggedState = '';

    console.log(`[MeetBot] Waiting for host admission (timeout: ${maxWaitMinutes}m)...`);

    while (Date.now() - startWait < maxWaitMs) {
      if (!this.page || this.page.isClosed()) {
        throw new Error('Meeting page was closed while waiting to join.');
      }

      const { state, message } = await this.checkMeetingState();

      if (state === 'IN_MEETING') {
        console.log('[MeetBot] 🎓 Successfully admitted into the class by the host!');
        if (typeof onStatusUpdate === 'function') {
          onStatusUpdate('Admitted by host. Preparing recording...');
        }
        return true;
      }

      if (state === 'DENIED') {
        console.error('[MeetBot] Host denied admission to the meeting.');
        if (typeof onStatusUpdate === 'function') {
          onStatusUpdate('Host denied entry to the class');
        }
        throw new Error('Host denied request to join the class.');
      }

      if (state === 'ERROR') {
        throw new Error(message || 'Google Meet connection error');
      }

      if (state === 'WAITING_FOR_HOST') {
        if (lastLoggedState !== 'WAITING_FOR_HOST') {
          console.log('[MeetBot] ⏳ Request sent. Waiting for host to let you in...');
          lastLoggedState = 'WAITING_FOR_HOST';
        }
        const waitSec = Math.floor((Date.now() - startWait) / 1000);
        const waitMins = Math.floor(waitSec / 60);
        const waitRemSec = waitSec % 60;
        const waitStr = `Waiting for host to let you in (${waitMins}m ${waitRemSec}s)...`;
        if (typeof onStatusUpdate === 'function') {
          onStatusUpdate(waitStr);
        }
      } else if (state === 'LOBBY') {
        // If still in lobby, try clicking Join / Ask to join / Rejoin again if visible
        try {
          await this.page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
            for (const btn of buttons) {
              const text = (btn.innerText || '').trim();
              const aria = (btn.getAttribute('aria-label') || '').trim();
              const combined = `${text} ${aria}`.toLowerCase();
              if (
                /^(join now|ask to join|join|rejoin)$/i.test(text) ||
                combined.includes('join now') ||
                combined.includes('ask to join') ||
                combined.includes('rejoin')
              ) {
                btn.click();
                break;
              }
            }
          });
        } catch {}
      }

      await new Promise((r) => setTimeout(r, 2000));
    }

    throw new Error(`Timed out waiting ${maxWaitMinutes}m for host to admit you into the class.`);
  }

  async joinMeeting(meetingUrl, onStatusUpdate = null) {
    if (!this.page) throw new Error('Bot not launched. Call launch() first.');

    console.log(`[MeetBot] Navigating to: ${meetingUrl}`);
    const context = this.browser.defaultBrowserContext();
    await context.overridePermissions(meetingUrl, ['microphone', 'camera']);

    await this.page.goto(meetingUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 3000));

    // Handle lobby name input (if not logged into Google account)
    try {
      const nameInputSelector = 'input[type="text"][aria-label*="name" i], input[placeholder*="name" i]';
      const nameInput = await this.page.$(nameInputSelector);
      if (nameInput) {
        console.log(`[MeetBot] Guest mode: entering display name "${this.options.botName}"`);
        await nameInput.click({ clickCount: 3 });
        await nameInput.type(this.options.botName, { delay: 40 });
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (e) {
      console.warn('[MeetBot] Name input handling:', e.message);
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
    console.log('[MeetBot] Searching for Join/Rejoin button...');
    const maxPollAttempts = 8;
    for (let i = 0; i < maxPollAttempts; i++) {
      const { state, message } = await this.checkMeetingState();
      if (state === 'IN_MEETING') {
        console.log('[MeetBot] Already entered meeting room.');
        break;
      }
      if (state === 'WAITING_FOR_HOST') {
        console.log('[MeetBot] In waiting lobby for host.');
        break;
      }
      if (state === 'DENIED' || state === 'ERROR') {
        throw new Error(message);
      }

      // Auto-dismiss any blocking prompt dialogs if present ("Got it", "Dismiss", "Join anyway")
      try {
        await this.page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
          for (const b of buttons) {
            const text = (b.innerText || '').trim().toLowerCase();
            if (text === 'got it' || text === 'dismiss' || text === 'join anyway') {
              b.click();
            }
          }
        });
      } catch {}

      // Find and click Join / Rejoin / Ask to join button
      const clicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        for (const btn of buttons) {
          const text = (btn.innerText || '').trim();
          const aria = (btn.getAttribute('aria-label') || '').trim();
          const combined = `${text} ${aria}`.toLowerCase();

          if (
            /^(join now|ask to join|join|rejoin)$/i.test(text) ||
            combined.includes('join now') ||
            combined.includes('ask to join') ||
            combined.includes('rejoin') ||
            combined === 'join'
          ) {
            btn.click();
            return text || aria || 'Join';
          }
        }
        return null;
      });

      if (clicked) {
        console.log(`[MeetBot] Clicked button: "${clicked}"`);
        break;
      }

      await new Promise((r) => setTimeout(r, 1500));
    }

    // Wait for the Host to admit the bot into the meeting before returning
    const settings = getSettings();
    const maxLobbyWaitMin = this.options.maxLobbyWaitMin || settings.maxLobbyWaitMin || 15;
    await this.waitForAdmission(maxLobbyWaitMin, onStatusUpdate);

    await new Promise((r) => setTimeout(r, 2000));

    // Turn on live captions in Meet so the content script can harvest transcripts
    try {
      await this.page.evaluate(() => {
        const captionBtn = document.querySelector('button[aria-label*="caption" i], button[aria-label*="subtitles" i]');
        if (captionBtn && captionBtn.getAttribute('aria-pressed') !== 'true') {
          captionBtn.click();
        }
      });
      await this.page.keyboard.press('KeyC');
      console.log('[MeetBot] Live captions enabled.');
    } catch {}
  }

  async startRecording(durationMinutes = 60, onAutoLeave = null, onUnexpectedDisconnect = null) {
    if (!this.page) throw new Error('Bot not active.');

    // Guarantee that recording strictly starts only after host admission
    const { state } = await this.checkMeetingState();
    if (state !== 'IN_MEETING') {
      console.warn(`[MeetBot] startRecording called but state is "${state}". Waiting for host admission...`);
      const settings = getSettings();
      await this.waitForAdmission(this.options.maxLobbyWaitMin || settings.maxLobbyWaitMin || 15);
    }

    console.log('[MeetBot] Inside meeting room confirmed! Starting recording now...');

    // In-page DOM events (zero user interaction required)
    await this.page.evaluate(() => {
      window.postMessage({ type: 'START_RECORDING_BOT' }, '*');
      window.dispatchEvent(new CustomEvent('START_RECORDING_BOT'));
    });

    this.isRecording = true;
    console.log('[MeetBot] Recording successfully initiated inside the live class!');

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
          console.log('[MeetBot] Meet page was closed unexpectedly.');
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
          console.log('[MeetBot] 🔄 Detected on-screen Rejoin button after disconnect. Clicked Rejoin!');
          return;
        }

        // 1. Check max duration limit
        if (autoLeave.enabled && autoLeave.maxDurationEnforced && Date.now() - startTime >= maxDurationMs) {
          console.log(`[MeetBot] Max scheduled duration (${durationMinutes}m) reached. Auto-leaving meeting...`);
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
            console.log('[MeetBot] Host ended call or removed from meeting. Auto-leaving...');
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
          console.warn('[MeetBot] Network connection dropped in Google Meet.');
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
                  `[MeetBot] Participants dropped to ${participantCount} (<= ${autoLeave.minParticipants}). Grace timer started...`
                );
              } else {
                const elapsedGrace = (Date.now() - lowParticipantStart) / 1000;
                const graceNeeded = autoLeave.gracePeriodSec || 60;
                if (elapsedGrace >= graceNeeded) {
                  console.log(
                    `[MeetBot] Participant count remained <= ${autoLeave.minParticipants} for ${graceNeeded}s. Auto-leaving meeting...`
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
                console.log(`[MeetBot] Participant count increased to ${participantCount}. Grace timer reset.`);
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
    console.log('[MeetBot] Dispatching STOP_RECORDING_BOT event...');

    // Snapshot existing files before trigger to reliably track newly created recordings
    let initialFiles = null;
    try {
      if (fs.existsSync(this.downloadDir)) {
        initialFiles = new Set(fs.readdirSync(this.downloadDir));
      }
    } catch {}

    try {
      await this.page.evaluate(() => {
        window.postMessage({ type: 'STOP_RECORDING_BOT' }, '*');
        window.dispatchEvent(new CustomEvent('STOP_RECORDING_BOT'));
      });
    } catch {}

    this.isRecording = false;
    console.log(`[MeetBot] Stop command sent. Waiting for downloads in ${this.downloadDir}...`);

    // Give browser a moment to initiate file stream
    await new Promise((r) => setTimeout(r, 2000));

    // Wait for the new .webm and transcripts to finish saving
    const results = await waitForDownloads(this.downloadDir, 45000, initialFiles);
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
