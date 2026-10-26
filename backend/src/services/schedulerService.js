/**
 * backend/src/services/schedulerService.js
 * Timetable daemon, active recording session manager, 3-attempt rejoin loop, and schedule monitoring
 */

const { MeetRecorderBot } = require('./meetBot');
const { getSettings } = require('../models/settingsModel');
const { loadTimetable, getNextUpcoming } = require('../models/timetableModel');
const {
  getISTDate,
  normalizeTimeTo24,
  formatTimeTo12IST,
} = require('../utils/timeUtils');

let activeRecordingState = null;
let activeBotInstance = null;
let activeStopTimer = null;
let isMidSessionRejoining = false;
let isDaemonRunning = false;
let daemonInterval = null;
const recordedToday = new Set(); // Prevents duplicate recordings on the same day

/**
 * Returns current status of scheduler daemon, live session, upcoming class, and IST time
 * @returns {object}
 */
function getStatus() {
  const ist = getISTDate();
  const timetable = loadTimetable();

  let activeInfo = null;
  if (activeRecordingState) {
    const elapsed = activeRecordingState.joinedAt
      ? Date.now() - activeRecordingState.joinedAt
      : Date.now() - activeRecordingState.startedAt;
    const remainingMs = Math.max(0, activeRecordingState.durationMs - elapsed);
    const elapsedMinutes = Math.floor(elapsed / 60000);
    const elapsedSeconds = Math.floor((elapsed % 60000) / 1000);

    activeInfo = {
      ...activeRecordingState,
      elapsedMs: elapsed,
      remainingMs,
      elapsedStr: activeRecordingState.joinedAt
        ? `${elapsedMinutes}m ${elapsedSeconds}s`
        : 'Waiting for host...',
    };
  }

  return {
    daemonRunning: isDaemonRunning,
    activeRecording: activeInfo,
    nextClass: getNextUpcoming(timetable),
    currentTime: ist.hhmm,
    currentTime12: ist.time12,
    currentDay: ist.dayFullName,
    timezone: 'Asia/Kolkata (IST)',
    timetableCount: timetable.length,
    activeCount: timetable.filter((c) => c.enabled).length,
  };
}

/**
 * Initiates a meeting recording session with up to 3 automatic join attempts
 * @param {string} link
 * @param {number} [durationMinutes]
 * @param {string} [name]
 * @returns {Promise<object>}
 */
async function startManualSession(link, durationMinutes = 60, name = 'Manual Recording') {
  if (activeBotInstance) {
    throw new Error('A recording session is already currently active!');
  }

  const settings = getSettings();
  const maxRetries = settings.rejoinRetries !== undefined ? Math.max(1, parseInt(settings.rejoinRetries, 10)) : 3;
  const retryDelaySec = settings.rejoinDelaySec !== undefined ? Math.max(1, parseInt(settings.rejoinDelaySec, 10)) : 10;
  const durationMs = durationMinutes * 60 * 1000;

  activeRecordingState = {
    name,
    link,
    startedAt: Date.now(),
    joinedAt: null,
    durationMinutes,
    durationMs,
    attempt: 1,
    maxRetries,
    status: `Joining class (Attempt 1/${maxRetries})...`,
  };

  let bot = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    activeRecordingState.attempt = attempt;
    activeRecordingState.status = attempt === 1
      ? `Joining class (Attempt 1/${maxRetries})...`
      : `Rejoining class (Attempt ${attempt}/${maxRetries})...`;

    console.log(`[SchedulerService] ${activeRecordingState.status} - "${name}"`);

    bot = new MeetRecorderBot({
      botName: `${name} Bot`,
      muteMicOnJoin: settings.muteMicOnJoin !== false,
      turnOffCameraOnJoin: settings.turnOffCameraOnJoin !== false,
      autoLeave: settings.autoLeave,
      maxLobbyWaitMin: settings.maxLobbyWaitMin || 15,
    });
    activeBotInstance = bot;

    try {
      await bot.launch();

      const onStatusUpdate = (statusText) => {
        if (activeRecordingState) {
          activeRecordingState.status = statusText;
        }
      };

      // Waits for host to admit bot into the class before returning
      await bot.joinMeeting(link, onStatusUpdate);

      const onAutoLeave = async (reason) => {
        console.log(`[SchedulerService] Auto-leave triggered (${reason}) for "${name}". Finalizing session...`);
        await stopActiveSession().catch(() => {});
      };

      const onUnexpectedDisconnect = async (reason) => {
        console.warn(`[SchedulerService] Unexpected disconnect (${reason}) during "${name}".`);
        if (settings.autoRejoinOnDisconnect !== false && activeRecordingState) {
          handleMidSessionRejoin(link, durationMinutes, name);
        } else {
          await stopActiveSession().catch(() => {});
        }
      };

      // Recording strictly starts only AFTER host admits the bot into class
      await bot.startRecording(durationMinutes, onAutoLeave, onUnexpectedDisconnect);

      activeRecordingState.joinedAt = Date.now();
      activeRecordingState.status = 'Recording live';
      console.log(`[SchedulerService] Host let bot in! Recording live for: "${name}" (Attempt ${attempt}/${maxRetries})`);

      // Set auto-stop timer starting from actual joined time
      if (activeStopTimer) clearTimeout(activeStopTimer);
      activeStopTimer = setTimeout(async () => {
        if (activeBotInstance === bot) {
          console.log(`[SchedulerService] Scheduled duration (${durationMinutes}m) reached. Auto-stopping.`);
          await stopActiveSession().catch(() => {});
        }
      }, durationMs);

      return { ok: true, name, link, durationMinutes, attempt, maxRetries };
    } catch (err) {
      lastError = err;
      console.error(`[SchedulerService] Attempt ${attempt}/${maxRetries} failed for "${name}":`, err.message);

      if (bot) {
        try { await bot.close(); } catch {}
        bot = null;
      }
      activeBotInstance = null;

      if (attempt < maxRetries) {
        activeRecordingState.status = `Attempt ${attempt}/${maxRetries} failed. Retrying rejoin in ${retryDelaySec}s...`;
        console.log(`[SchedulerService] Waiting ${retryDelaySec}s before attempt ${attempt + 1}/${maxRetries}...`);
        await new Promise((r) => setTimeout(r, retryDelaySec * 1000));
      }
    }
  }

  // All retries failed
  activeBotInstance = null;
  activeRecordingState = null;
  throw new Error(`Failed to join class "${name}" after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown'}`);
}

/**
 * Handles automatic rejoining if the connection drops unexpectedly mid-session
 * @param {string} link
 * @param {number} durationMinutes
 * @param {string} name
 */
async function handleMidSessionRejoin(link, durationMinutes, name) {
  if (isMidSessionRejoining || !activeRecordingState) return;
  isMidSessionRejoining = true;

  const settings = getSettings();
  const maxRetries = settings.rejoinRetries !== undefined ? Math.max(1, parseInt(settings.rejoinRetries, 10)) : 3;
  const retryDelaySec = settings.rejoinDelaySec !== undefined ? Math.max(1, parseInt(settings.rejoinDelaySec, 10)) : 10;

  console.log(`[SchedulerService] Initiating automatic mid-session rejoin for "${name}" (up to ${maxRetries} attempts)...`);

  if (activeBotInstance) {
    try { await activeBotInstance.close(); } catch {}
    activeBotInstance = null;
  }

  const elapsed = Date.now() - (activeRecordingState.joinedAt || activeRecordingState.startedAt || Date.now());
  const remainingMinutes = Math.max(5, Math.ceil((activeRecordingState.durationMs - elapsed) / 60000));

  for (let retry = 1; retry <= maxRetries; retry++) {
    if (!activeRecordingState) break; // Terminated manually
    activeRecordingState.status = `Rejoining class after disconnect (Attempt ${retry}/${maxRetries})...`;

    try {
      const bot = new MeetRecorderBot({
        botName: `${name} Bot`,
        muteMicOnJoin: settings.muteMicOnJoin !== false,
        turnOffCameraOnJoin: settings.turnOffCameraOnJoin !== false,
        autoLeave: settings.autoLeave,
        maxLobbyWaitMin: settings.maxLobbyWaitMin || 15,
      });
      activeBotInstance = bot;

      await bot.launch();

      const onStatusUpdate = (statusText) => {
        if (activeRecordingState) activeRecordingState.status = statusText;
      };
      await bot.joinMeeting(link, onStatusUpdate);

      await bot.startRecording(
        remainingMinutes,
        async () => { await stopActiveSession().catch(() => {}); },
        () => { handleMidSessionRejoin(link, remainingMinutes, name); }
      );

      activeRecordingState.joinedAt = Date.now();
      activeRecordingState.status = 'Recording live';
      console.log(`[SchedulerService] Successfully reconnected to "${name}"!`);
      isMidSessionRejoining = false;
      return;
    } catch (e) {
      console.warn(`[SchedulerService] Mid-session rejoin attempt ${retry}/${maxRetries} failed:`, e.message);
      if (activeBotInstance) {
        try { await activeBotInstance.close(); } catch {}
        activeBotInstance = null;
      }
      if (retry < maxRetries) {
        activeRecordingState.status = `Rejoin attempt ${retry}/${maxRetries} failed. Retrying in ${retryDelaySec}s...`;
        await new Promise((r) => setTimeout(r, retryDelaySec * 1000));
      }
    }
  }

  console.error(`[SchedulerService] Exhausted all ${maxRetries} rejoin attempts for "${name}". Ending session.`);
  isMidSessionRejoining = false;
  activeBotInstance = null;
  activeRecordingState = null;
}

/**
 * Halts any active recording session, dispatches stop events, and collects output files
 * @returns {Promise<object>}
 */
async function stopActiveSession() {
  if (activeStopTimer) {
    clearTimeout(activeStopTimer);
    activeStopTimer = null;
  }
  isMidSessionRejoining = false;

  if (!activeBotInstance) {
    return { ok: false, message: 'No recording is currently active.' };
  }

  const bot = activeBotInstance;
  const session = activeRecordingState;

  console.log(`[SchedulerService] Stopping session for "${session?.name || 'Meeting'}"...`);
  try {
    const results = await bot.stopRecording();
    return { ok: true, results };
  } finally {
    try { await bot.close(); } catch {}
    activeBotInstance = null;
    activeRecordingState = null;
  }
}

/**
 * Checks scheduled timetable entries against current IST time and triggers due meetings
 */
async function checkAndTriggerSchedule() {
  if (activeBotInstance) return; // Busy recording, don't overlap

  const timetable = loadTimetable();
  const ist = getISTDate();
  const todayStr = ist.isoDate;
  const currentDay = ist.dayName;
  const currentHHMM = ist.hhmm;

  // Prune any stale recording keys from previous days
  for (const key of recordedToday) {
    if (!key.includes(todayStr)) {
      recordedToday.delete(key);
    }
  }

  for (const item of timetable) {
    if (!item.enabled) continue;

    const itemDays = (Array.isArray(item.days) ? item.days : [item.days]).map((d) =>
      String(d).toLowerCase().trim().slice(0, 3)
    );
    const isToday =
      itemDays.includes(currentDay) ||
      itemDays.includes('all') ||
      itemDays.includes('*');
    const normalizedItemTime = normalizeTimeTo24(item.time);

    if (isToday && normalizedItemTime === currentHHMM) {
      const sessionKey = `${item.id || item.name}_${todayStr}_${normalizedItemTime}`;

      if (!recordedToday.has(sessionKey)) {
        recordedToday.add(sessionKey);
        const displayTime = item.time12 || formatTimeTo12IST(normalizedItemTime);
        console.log('\n========================================================================');
        console.log(`[SchedulerService] ⏰ TIME FOR CLASS: "${item.name}" (${displayTime})!`);
        console.log(`[SchedulerService] Link: ${item.link}`);
        console.log(`[SchedulerService] Duration: ${item.duration || 60} minutes`);
        console.log('========================================================================\n');

        startManualSession(item.link, item.duration || 60, item.name).catch((err) => {
          console.error(`[SchedulerService Error starting ${item.name}]:`, err.message);
        });
        break;
      }
    }
  }
}

/**
 * Starts background daemon monitoring timetable schedule every 15 seconds
 */
function startSchedulerDaemon() {
  if (isDaemonRunning) return;
  isDaemonRunning = true;
  console.log('[SchedulerService] Timetable daemon active. Monitoring schedule every 15s...');

  checkAndTriggerSchedule();
  daemonInterval = setInterval(checkAndTriggerSchedule, 15000);
}

/**
 * Pauses background timetable daemon
 */
function stopSchedulerDaemon() {
  isDaemonRunning = false;
  if (daemonInterval) {
    clearInterval(daemonInterval);
    daemonInterval = null;
  }
  console.log('[SchedulerService] Timetable daemon paused.');
}

module.exports = {
  getStatus,
  startManualSession,
  stopActiveSession,
  startSchedulerDaemon,
  stopSchedulerDaemon,
  checkAndTriggerSchedule,
};
