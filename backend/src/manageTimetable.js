/**
 * backend/src/manageTimetable.js
 * CLI Helper to view, add, and manage scheduled classes
 */

const fs = require('fs');
const config = require('./config');
const { loadTimetable, printTimetableSummary } = require('./scheduler');

function saveTimetable(data) {
  fs.writeFileSync(config.TIMETABLE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function handleAdd(args) {
  // Usage: node manageTimetable.js add "Class Name" "https://meet.google.com/xyz" "mon,wed,fri" "10:00" [durationMinutes]
  const name = args[0];
  const link = args[1];
  const daysStr = args[2];
  const time = args[3];
  const duration = parseInt(args[4] || '60', 10);

  if (!name || !link || !daysStr || !time) {
    console.log('\nUsage to add a class:');
    console.log('  node backend/src/manageTimetable.js add "<Name>" "<Meet Link>" "<Days: mon,tue,wed,thu,fri,sat,sun>" "<HH:MM>" [DurationMinutes]\n');
    console.log('Example:');
    console.log('  node backend/src/manageTimetable.js add "Data Structures" "https://meet.google.com/abc-defg-hij" "mon,wed,fri" "10:30" 60\n');
    return;
  }

  const days = daysStr.split(',').map((d) => d.trim().toLowerCase());
  const timetable = loadTimetable();

  const id = `class-${Date.now()}`;
  const newClass = {
    id,
    name,
    link,
    days,
    time,
    duration,
    enabled: true,
  };

  timetable.push(newClass);
  saveTimetable(timetable);

  console.log(`\nSuccessfully added class: "${name}" (${days.join(', ')} at ${time})`);
  printTimetableSummary(timetable);
}

function handleList() {
  const timetable = loadTimetable();
  printTimetableSummary(timetable);
}

function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === 'add') {
    handleAdd(args);
  } else if (cmd === 'list' || !cmd) {
    handleList();
  } else {
    console.log(`Unknown command: ${cmd}. Available commands: list, add`);
  }
}

main();
