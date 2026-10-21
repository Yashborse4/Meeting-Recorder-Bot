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

  const entry = {
    id,
    name: classData.name || 'Untitled Class',
    link: classData.link || '',
    days: formattedDays,
    time: classData.time || '09:00',
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
  const now = new Date();
  const currentDayIdx = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let closestDiff = Infinity;
  let nextClass = null;

  for (const item of timetable) {
    if (!item.enabled || !item.time || !item.days) continue;

    const [hh, mm] = item.time.split(':').map(Number);
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
          day: DAY_FULL_NAMES[dayIdx],
          diffMinutes: totalDiffMinutes,
        };
      }
    }
  }

  return nextClass;
}

function getStatus() {
  const now = new Date();
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
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
    currentTime: currentHHMM,
    currentDay: DAY_FULL_NAMES[now.getDay()],
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
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentDay = DAY_NAMES[now.getDay()];
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  for (const item of timetable) {
    if (!item.enabled) continue;

    const itemDays = (Array.isArray(item.days) ? item.days : [item.days]).map((d) => d.toLowerCase());
    const isToday = itemDays.includes(currentDay) || itemDays.includes('all') || itemDays.includes('*');

    if (isToday && item.time === currentHHMM) {
      const sessionKey = `${item.id || item.name}_${todayStr}_${item.time}`;

      if (!recordedToday.has(sessionKey)) {
        recordedToday.add(sessionKey);
        console.log('\n========================================================================');
        console.log(`[Scheduler] ⏰ TIME FOR CLASS: "${item.name}"!`);
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
