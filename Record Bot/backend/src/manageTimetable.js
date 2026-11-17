/**
 * backend/src/manageTimetable.js
 * CLI helper to view, add, and manage scheduled classes
 */

const timetableModel = require('./models/timetableModel');

function handleAdd(args) {
  // Usage: node manageTimetable.js add "Class Name" "https://meet.google.com/xyz" "mon,wed,fri" "10:00" [durationMinutes]
  const name = args[0];
  const link = args[1];
  const daysStr = args[2];
  const time = args[3];
  let endTime = null;
  let duration = 60;
  if (args[4]) {
    if (String(args[4]).includes(':')) {
      endTime = args[4];
    } else {
      duration = parseInt(args[4], 10) || 60;
    }
  }

  if (!name || !link || !daysStr || !time) {
    console.log('\nUsage to add a class:');
    console.log('  node backend/src/manageTimetable.js add "<Name>" "<Meet Link>" "<Days: mon,tue,wed,thu,fri,sat,sun>" "<From HH:MM>" ["<To HH:MM>" or DurationMinutes]\n');
    console.log('Example:');
    console.log('  node backend/src/manageTimetable.js add "Data Structures" "https://meet.google.com/abc-defg-hij" "mon,wed,fri" "10:30" "12:00"\n');
    return;
  }

  const days = daysStr.split(',').map((d) => d.trim().toLowerCase());
  const entry = timetableModel.addOrUpdateClass({
    name,
    link,
    days,
    time,
    endTime,
    duration,
    enabled: true,
  });

  console.log(`\nSuccessfully added class: "${name}" (${days.join(', ')} at ${time})`);
  timetableModel.printTimetableSummary();
}

function handleList() {
  timetableModel.printTimetableSummary();
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

if (require.main === module) {
  main();
}

module.exports = { handleAdd, handleList };
