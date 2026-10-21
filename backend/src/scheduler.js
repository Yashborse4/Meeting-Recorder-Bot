/**
 * backend/src/scheduler.js
 * Automated Weekly Timetable Scheduler for Google Meet classes/meetings (Mon-Sun)
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { MeetRecorderBot } = require('./meetBot');

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let activeRecordingState = null;
let activeBotInstance = null;
let isDaemonRunning = false;
let daemonInterval = null;
const recordedToday = new Set(); // Prevents duplicate recordings on the same day

/**
 * Normalizes any time string (e.g. "02:30 PM", "2:30pm", "14:30") to standard "HH:MM" 24h format
 */
function normalizeTimeTo24(timeStr) {
  if (!timeStr) return '09:00';
  const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
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
  const timetable = loadTimetable();
  const id = classData.id || `class-${Date.now()}`;
  const existingIdx = timetable.findIndex((c) => c.id === id);

  const formattedDays = Array.isArray(classData.days)
    ? classData.days.map((d) => d.toLowerCase())
    : [String(classData.days).toLowerCase()];

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
      const dayIdx = DAY_NAMES.indexOf(d.toLowerCase());
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
    const elapsed = Date.now() - activeRecordingState.startedAt;
    const remainingMs = Math.max(0, activeRecordingState.durationMs - elapsed);
    activeInfo = {
      ...activeRecordingState,
      elapsedMs: elapsed,
      remainingMs,
      elapsedStr: `${Math.floor(elapsed / 60000)}m ${Math.floor((elapsed % 60000) / 1000)}s`,
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

  const durationMs = durationMinutes * 60 * 1000;
  const bot = new MeetRecorderBot({
    botName: `${name} Bot`,
    muteMicOnJoin: true,
    turnOffCameraOnJoin: true,
  });

  activeBotInstance = bot;
  activeRecordingState = {
    name,
    link,
    startedAt: Date.now(),
    durationMinutes,
    durationMs,
  };

  try {
    await bot.launch();
    await bot.joinMeeting(link);
    await new Promise((r) => setTimeout(r, 4000));
    await bot.startRecording();

    // Set auto-stop timer
    setTimeout(async () => {
      if (activeBotInstance === bot) {
        await stopActiveSession().catch(() => {});
      }
    }, durationMs);

    return { ok: true, name, link, durationMinutes };
  } catch (err) {
    activeBotInstance = null;
    activeRecordingState = null;
    try { await bot.close(); } catch {}
    throw err;
  }
}

async function stopActiveSession() {
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

    const itemDays = (Array.isArray(item.days) ? item.days : [item.days]).map((d) => d.toLowerCase());
    const isToday = itemDays.includes(currentDay) || itemDays.includes('all') || itemDays.includes('*');
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
