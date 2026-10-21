/**
 * backend/src/utils/timeUtils.js
 * Time formatting, parsing, and Indian Standard Time (IST, Asia/Kolkata) utilities
 */

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Normalizes any time string (e.g. "02:30 PM", "2:30pm", "14:30", "02:30 PM IST") to standard "HH:MM" 24h format
 * @param {string} timeStr
 * @returns {string} Standardized HH:MM string in 24h clock
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
 * @param {string} timeStr
 * @returns {string}
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
 * Reliably returns current Indian Standard Time components (IST, UTC+5:30 - Asia/Kolkata)
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

module.exports = {
  DAY_NAMES,
  DAY_FULL_NAMES,
  normalizeTimeTo24,
  formatTimeTo12IST,
  getISTDate,
};
