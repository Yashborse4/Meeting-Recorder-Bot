/**
 * backend/src/server.js
 * Application entry point for the Web Dashboard and background timetable daemon
 */

const app = require('./app');
const schedulerService = require('./services/schedulerService');
const { getSettings } = require('./models/settingsModel');
const { openInDefaultBrowser } = require('./utils/browserLauncher');

const PORT = process.env.PORT || 3000;

// Start background timetable monitoring daemon
schedulerService.startSchedulerDaemon();

// Start HTTP server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n========================================================================');
  console.log(`      🚀 Google Meet Recorder Dashboard running at: http://localhost:${PORT}`);
  console.log('========================================================================\n');

  // Automatically launch dashboard in user's default browser if enabled in settings (unless launched silently via Windows startup)
  try {
    const isStartup = process.argv.includes('--startup');
    const settings = getSettings();
    if (!isStartup && settings.autoOpenBrowser !== false) {
      setTimeout(() => {
        openInDefaultBrowser(`http://localhost:${PORT}`);
      }, 750);
    }
  } catch {}
});

// Handle server errors (e.g. port already in use)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[Server Warning] Port ${PORT} is already in use by another running instance.`);
    console.log(`[Server] Access the dashboard at: http://localhost:${PORT}`);
    console.log('[Server] Or run STOP_RECORDER.bat if you need to restart the server.\n');
  } else {
    console.error('\n[Server ERROR]', err.message);
  }
  process.exit(1);
});

// Graceful shutdown handling
function handleShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
  schedulerService.stopSchedulerDaemon();
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

module.exports = server;
