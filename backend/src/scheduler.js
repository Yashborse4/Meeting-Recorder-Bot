/**
 * backend/src/scheduler.js
 * Automated Weekly Timetable Scheduler for Google Meet classes/meetings (Mon-Sun)
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { MeetRecorderBot } = require('./meetBot');
const { getSettings } = require('./settingsManager');

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let activeRecordingState = null;
let activeBotInstance = null;
let activeStopTimer = null;
let isMidSessionRejoining = false;
let isDaemonRunning = false;
let daemonInterval = null;
const recordedToday = new Set(); // Prevents duplicate recordings on the same day

/**
 * Normalizes any time string (e.g. "02:30 PM", "2:30pm", "14:30", "02:30 PM IST") to standard "HH:MM" 24h format
 */
function normalizeTimeTo24(timeStr) {
  if (!timeStr) return '09:00';
  const cleaned = String(timeStr).trim().replace(/\s+(IST|GMT|UTC[+-]?\d*)$/i, '');
  const match = cleaned.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return String(timeStr);
  let [_, hStr, mStr, ampm] = match;
  let h = parseInt(hStr, 10);
  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
    if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
  }
  return `${String(h).padStart(2, '0')}:${mStr}`;
}

/**
 * Formats "HH:MM" 24h into 12h Indian Standard Time with AM/PM (e.g. "02:30 PM IST")
 */
function formatTimeTo12IST(timeStr) {
  if (!timeStr) return '--:--';
  if (/am|pm/i.test(timeStr)) {
    return timeStr.includes('IST') ? timeStr : `${timeStr} IST`;
  }
  const [hStr, mStr] = String(timeStr).split(':');
  let h = parseInt(hStr, 10);
  const m = mStr ? mStr.padStart(2, '0') : '00';
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${m} ${ampm} IST`;
}

/**
 * Reliably returns current Indian Standard Time (IST, UTC+5:30 - Asia/Kolkata)
 */
function getISTDate() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(now);
  const map = {};
  for (const p of parts) map[p.type] = p.value;

  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayIdx = weekdayMap[map.weekday] ?? now.getDay();
  const hours = parseInt(map.hour, 10) || 0;
  const minutes = parseInt(map.minute, 10) || 0;
  const hhmm = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  const time12 = `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm} IST`;

  return {
    dayIdx,
    dayName: DAY_NAMES[dayIdx],
    dayFullName: DAY_FULL_NAMES[dayIdx],
    hours,
    minutes,
    hhmm,
    time12,
    isoDate: `${map.year}-${map.month}-${map.day}`,
  };
}

function loadTimetable() {
  if (!fs.existsSync(config.TIMETABLE_FILE)) {
    try {
      fs.writeFileSync(config.TIMETABLE_FILE, '[]', 'utf-8');
    } catch {}
    return [];
  }
  try {
    const raw = fs.readFileSync(config.TIMETABLE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[Scheduler] Error reading ${config.TIMETABLE_FILE}:`, e.message);
    return [];
  }
}

function saveTimetable(data) {
  fs.writeFileSync(config.TIMETABLE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

function addOrUpdateClass(classData) {
  let timetable = loadTimetable();

  // Multi-slot support for scheduling the same subject across multiple days and times
  if (Array.isArray(classData.slots) && classData.slots.length > 0) {
    const baseName = (classData.name || 'Untitled Class').trim();
    const baseLink = (classData.link || '').trim();
    const enabled = classData.enabled !== false;
    const savedEntries = [];

    // Delete any slots marked for deletion
    if (Array.isArray(classData.deletedSlotIds) && classData.deletedSlotIds.length > 0) {
      timetable = timetable.filter((c) => !classData.deletedSlotIds.includes(c.id));
    }

    classData.slots.forEach((slot, index) => {
      const slotId = slot.id || `class-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 4)}`;
      const existingIdx = timetable.findIndex((c) => c.id === slotId);

      const formattedDays = Array.isArray(slot.days)
        ? slot.days.map((d) => String(d).toLowerCase())
        : [String(slot.days || 'mon').toLowerCase()];

      const normalizedTime = normalizeTimeTo24(slot.time);
      const time12 = formatTimeTo12IST(normalizedTime);

      const entry = {
        id: slotId,
        name: baseName,
        link: baseLink,
        days: formattedDays,
        time: normalizedTime,
        time12,
        duration: parseInt(slot.duration || classData.duration || '60', 10),
        enabled,
      };

      if (existingIdx >= 0) {
        timetable[existingIdx] = entry;
      } else {
        timetable.push(entry);
      }
      savedEntries.push(entry);
    });

    saveTimetable(timetable);
    return savedEntries;
  }

  // Single slot fallback
  const id = classData.id || `class-${Date.now()}`;
  const existingIdx = timetable.findIndex((c) => c.id === id);

  const formattedDays = Array.isArray(classData.days)
    ? classData.days.map((d) => String(d).toLowerCase())
    : [String(classData.days || 'mon').toLowerCase()];

  const normalizedTime = normalizeTimeTo24(classData.time);
  const time12 = formatTimeTo12IST(normalizedTime);

  const entry = {
    id,
    name: classData.name || 'Untitled Class',
    link: classData.link || '',
    days: formattedDays,
    time: normalizedTime,
    time12,
    duration: parseInt(classData.duration || '60', 10),
    enabled: classData.enabled !== false,
  };

  if (existingIdx >= 0) {
    timetable[existingIdx] = entry;
  } else {
    timetable.push(entry);
  }

  saveTimetable(timetable);
  return entry;
}

function deleteClass(classId) {
  const timetable = loadTimetable();
  const filtered = timetable.filter((c) => c.id !== classId);
  saveTimetable(filtered);
  return filtered;
}

function toggleClass(classId) {
  const timetable = loadTimetable();
  const item = timetable.find((c) => c.id === classId);
  if (item) {
    item.enabled = !item.enabled;
    saveTimetable(timetable);
    return item;
  }
  return null;
}

function printTimetableSummary(timetable) {
  console.log('\n========================================================================');
  console.log('                 WEEKLY CLASS & MEETING TIMETABLE                      ');
  console.log('========================================================================');
  if (timetable.length === 0) {
    console.log(' No classes scheduled. Add classes via dashboard or backend/timetable.json');
    console.log('========================================================================\n');
    return;
  }

  console.log(
    'Status'.padEnd(10) +
    'Class Name'.padEnd(25) +
    'Days'.padEnd(20) +
    'Time'.padEnd(10) +
    'Duration'.padEnd(10)
  );
  console.log('-'.repeat(72));

  for (const item of timetable) {
    const status = item.enabled ? 'ACTIVE' : 'DISABLED';
    const days = Array.isArray(item.days) ? item.days.join(', ') : item.days;
    console.log(
      `[${status}]`.padEnd(10) +
      (item.name || 'Untitled').padEnd(25) +
      days.padEnd(20) +
      (item.time || '--:--').padEnd(10) +
      `${item.duration || 60}m`.padEnd(10)
    );
    console.log(`  -> Link: ${item.link}`);
  }
  console.log('========================================================================\n');
}

function getNextUpcoming(timetable) {
  const ist = getISTDate();
  const currentDayIdx = ist.dayIdx;
  const currentMinutes = ist.hours * 60 + ist.minutes;

  let closestDiff = Infinity;
  let nextClass = null;

  for (const item of timetable) {
    if (!item.enabled || !item.time || !item.days) continue;

    const normalizedTime = normalizeTimeTo24(item.time);
    const [hh, mm] = normalizedTime.split(':').map(Number);
    const targetMinutes = hh * 60 + mm;

    for (const d of item.days) {
      const d3 = String(d).toLowerCase().trim().slice(0, 3);
      const dayIdx = DAY_NAMES.indexOf(d3);
      if (dayIdx === -1) continue;

      let dayDelta = (dayIdx - currentDayIdx + 7) % 7;
      let minuteDelta = targetMinutes - currentMinutes;

      // If scheduled today but earlier than current minute, schedule for next week
      if (dayDelta === 0 && minuteDelta < 0) {
        dayDelta = 7;
      }

      const totalDiffMinutes = dayDelta * 24 * 60 + minuteDelta;

      if (totalDiffMinutes >= 0 && totalDiffMinutes < closestDiff) {
        closestDiff = totalDiffMinutes;
        nextClass = {
          ...item,
          time: normalizedTime,
          time12: item.time12 || formatTimeTo12IST(normalizedTime),
          day: DAY_FULL_NAMES[dayIdx],
          diffMinutes: totalDiffMinutes,
        };
      }
    }
  }

  return nextClass;
}

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

    console.log(`[Scheduler] ${activeRecordingState.status} - "${name}"`);

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
        console.log(`[Scheduler] Auto-leave triggered (${reason}) for "${name}". Finalizing session...`);
        await stopActiveSession().catch(() => {});
      };

      const onUnexpectedDisconnect = async (reason) => {
        console.warn(`[Scheduler] Unexpected disconnect (${reason}) during "${name}".`);
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
      console.log(`[Scheduler] Host let bot in! Recording live for: "${name}" (Attempt ${attempt}/${maxRetries})`);

      // Set auto-stop timer starting from actual joined time
      if (activeStopTimer) clearTimeout(activeStopTimer);
      activeStopTimer = setTimeout(async () => {
        if (activeBotInstance === bot) {
          console.log(`[Scheduler] Scheduled duration (${durationMinutes}m) reached. Auto-stopping.`);
          await stopActiveSession().catch(() => {});
        }
      }, durationMs);

      return { ok: true, name, link, durationMinutes, attempt, maxRetries };
    } catch (err) {
      lastError = err;
      console.error(`[Scheduler] Attempt ${attempt}/${maxRetries} failed for "${name}":`, err.message);

      if (bot) {
        try { await bot.close(); } catch {}
        bot = null;
      }
      activeBotInstance = null;

      if (attempt < maxRetries) {
        activeRecordingState.status = `Attempt ${attempt}/${maxRetries} failed. Retrying rejoin in ${retryDelaySec}s...`;
        console.log(`[Scheduler] Waiting ${retryDelaySec}s before attempt ${attempt + 1}/${maxRetries}...`);
        await new Promise((r) => setTimeout(r, retryDelaySec * 1000));
      }
    }
  }

  // All retries failed
  activeBotInstance = null;
  activeRecordingState = null;
  throw new Error(`Failed to join class "${name}" after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown'}`);
}

async function handleMidSessionRejoin(link, durationMinutes, name) {
  if (isMidSessionRejoining || !activeRecordingState) return;
  isMidSessionRejoining = true;

  const settings = getSettings();
  const maxRetries = settings.rejoinRetries !== undefined ? Math.max(1, parseInt(settings.rejoinRetries, 10)) : 3;
  const retryDelaySec = settings.rejoinDelaySec !== undefined ? Math.max(1, parseInt(settings.rejoinDelaySec, 10)) : 10;

  console.log(`[Scheduler] Initiating automatic mid-session rejoin for "${name}" (up to ${maxRetries} attempts)...`);

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
      console.log(`[Scheduler] Successfully reconnected to "${name}"!`);
      isMidSessionRejoining = false;
      return;
    } catch (e) {
      console.warn(`[Scheduler] Mid-session rejoin attempt ${retry}/${maxRetries} failed:`, e.message);
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

  console.error(`[Scheduler] Exhausted all ${maxRetries} rejoin attempts for "${name}". Ending session.`);
  isMidSessionRejoining = false;
  activeBotInstance = null;
  activeRecordingState = null;
}

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

  console.log(`[Scheduler] Stopping session for "${session?.name || 'Meeting'}"...`);
  try {
    const results = await bot.stopRecording();
    return { ok: true, results };
  } finally {
    try { await bot.close(); } catch {}
    activeBotInstance = null;
    activeRecordingState = null;
  }
}

async function checkAndTriggerSchedule() {
  if (activeBotInstance) return; // Busy recording, don't overlap

  const timetable = loadTimetable();
  const ist = getISTDate();
  const todayStr = ist.isoDate;
  const currentDay = ist.dayName;
  const currentHHMM = ist.hhmm;

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
        console.log(`[Scheduler] ⏰ TIME FOR CLASS: "${item.name}" (${displayTime})!`);
        console.log(`[Scheduler] Link: ${item.link}`);
        console.log(`[Scheduler] Duration: ${item.duration || 60} minutes`);
        console.log('========================================================================\n');

        startManualSession(item.link, item.duration || 60, item.name).catch((err) => {
          console.error(`[Scheduler Error starting ${item.name}]:`, err.message);
        });
        break;
      }
    }
  }
}

function startSchedulerDaemon() {
  if (isDaemonRunning) return;
  isDaemonRunning = true;
  console.log('[Scheduler] Timetable daemon active. Monitoring schedule every 15s...');

  checkAndTriggerSchedule();
  daemonInterval = setInterval(checkAndTriggerSchedule, 15000);
}

function stopSchedulerDaemon() {
  isDaemonRunning = false;
  if (daemonInterval) {
    clearInterval(daemonInterval);
    daemonInterval = null;
  }
  console.log('[Scheduler] Timetable daemon paused.');
}

if (require.main === module) {
  const timetable = loadTimetable();
  printTimetableSummary(timetable);
  startSchedulerDaemon();
}

module.exports = {
  loadTimetable,
  saveTimetable,
  addOrUpdateClass,
  deleteClass,
  toggleClass,
  printTimetableSummary,
  getNextUpcoming,
  getStatus,
  startManualSession,
  stopActiveSession,
  startSchedulerDaemon,
  stopSchedulerDaemon,
};
