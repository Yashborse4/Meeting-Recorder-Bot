/**
 * backend/src/scheduler.js
 * CLI scheduler entry point and facade module for backward compatibility
 */

const timetableModel = require('./models/timetableModel');
const schedulerService = require('./services/schedulerService');

// CLI Execution: node src/scheduler.js
if (require.main === module) {
  const timetable = timetableModel.loadTimetable();
  timetableModel.printTimetableSummary(timetable);
  schedulerService.startSchedulerDaemon();
}

module.exports = {
  // Timetable Model Operations
  loadTimetable: timetableModel.loadTimetable,
  saveTimetable: timetableModel.saveTimetable,
  addOrUpdateClass: timetableModel.addOrUpdateClass,
  deleteClass: timetableModel.deleteClass,
  toggleClass: timetableModel.toggleClass,
  printTimetableSummary: timetableModel.printTimetableSummary,
  getNextUpcoming: timetableModel.getNextUpcoming,

  // Scheduler Service Operations
  getStatus: schedulerService.getStatus,
  startManualSession: schedulerService.startManualSession,
  stopActiveSession: schedulerService.stopActiveSession,
  startSchedulerDaemon: schedulerService.startSchedulerDaemon,
  stopSchedulerDaemon: schedulerService.stopSchedulerDaemon,
  checkAndTriggerSchedule: schedulerService.checkAndTriggerSchedule,
};
