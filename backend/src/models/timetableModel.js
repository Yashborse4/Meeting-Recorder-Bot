/**
 * backend/src/models/timetableModel.js
 * Model managing timetable persistence, scheduling rules, and upcoming class queries
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const {
  DAY_NAMES,
  DAY_FULL_NAMES,
  normalizeTimeTo24,
  formatTimeTo12IST,
  getISTDate,
} = require('../utils/timeUtils');

/**
 * Loads all scheduled timetable items from timetable.json
 * @returns {Array}
 */
function loadTimetable() {
  const filePath = config.TIMETABLE_FILE;
  if (!fs.existsSync(filePath)) {
    try {
      fs.writeFileSync(filePath, '[]', 'utf-8');
    } catch {}
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[TimetableModel] Error reading ${filePath}:`, e.message);
    return [];
  }
}

/**
 * Persists timetable items to timetable.json
 * @param {Array} data
 * @returns {Array}
 */
function saveTimetable(data) {
  fs.writeFileSync(config.TIMETABLE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

/**
 * Adds or updates class entries, with multi-slot schedule builder support
 * @param {object} classData
 * @returns {object|Array}
 */
function addOrUpdateClass(classData) {
  let timetable = loadTimetable();

  // Multi-slot support for scheduling the same subject across multiple days and times
  if (Array.isArray(classData.slots) && classData.slots.length > 0) {
    const baseName = (classData.name || 'Untitled Class').trim();
    const baseLink = (classData.link || '').trim();
    const enabled = classData.enabled !== false;
    const savedEntries = [];

    // Delete any slots marked for deletion during editing
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

  // Single-slot fallback
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

/**
 * Removes a class from timetable by id
 * @param {string} classId
 * @returns {Array} Updated timetable
 */
function deleteClass(classId) {
  const timetable = loadTimetable();
  const filtered = timetable.filter((c) => c.id !== classId);
  saveTimetable(filtered);
  return filtered;
}

/**
 * Toggles class active/disabled state
 * @param {string} classId
 * @returns {object|null} Updated class or null
 */
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

/**
 * Computes the next chronologically upcoming class relative to current IST time
 * @param {Array} timetable
 * @returns {object|null}
 */
function getNextUpcoming(timetable = loadTimetable()) {
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

/**
 * Outputs a formatted ASCII summary of scheduled classes to the console
 * @param {Array} timetable
 */
function printTimetableSummary(timetable = loadTimetable()) {
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
    'Class Name'.padEnd(22) +
    'Days'.padEnd(28) +
    'Time'.padEnd(16) +
    'Duration'.padEnd(10)
  );
  console.log('-'.repeat(86));

  for (const item of timetable) {
    const status = item.enabled ? 'ACTIVE' : 'DISABLED';
    const days = Array.isArray(item.days) ? item.days.join(', ') : item.days;
    console.log(
      `[${status}]`.padEnd(10) +
      (item.name || 'Untitled').padEnd(22) +
      days.padEnd(28) +
      (item.time12 || item.time || '--:--').padEnd(16) +
      `${item.duration || 60}m`.padEnd(10)
    );
    console.log(`  -> Link: ${item.link}`);
  }
  console.log('========================================================================\n');
}

module.exports = {
  loadTimetable,
  saveTimetable,
  addOrUpdateClass,
  deleteClass,
  toggleClass,
  getNextUpcoming,
  printTimetableSummary,
};
