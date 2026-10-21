/**
 * backend/src/server.js
 * Express Web Dashboard Server for Google Meet Recorder
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const scheduler = require('./scheduler');
const storage = require('./storage');
const accountManager = require('./accountManager');
const settingsManager = require('./settingsManager');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(__dirname, '../public');

app.use(express.json());

// Serve static frontend assets (HTML, CSS, JS)
app.use(express.static(PUBLIC_DIR));

// Dynamic middleware to serve recorded media and transcripts from configured storage directory
app.use('/recordings', (req, res, next) => {
  const downloadDir = config.getDownloadDir();
  express.static(downloadDir)(req, res, next);
});

// -------------------------------------------------------------
// REST API ENDPOINTS
// -------------------------------------------------------------

// 1. Get Live Bot & Scheduler Status
app.get('/api/status', (req, res) => {
  const status = scheduler.getStatus();
  const account = accountManager.getAccountStatus();
  res.json({ ...status, account });
});

// 2. Toggle Scheduler Daemon
app.post('/api/scheduler/toggle', (req, res) => {
  const current = scheduler.getStatus().daemonRunning;
  if (current) {
    scheduler.stopSchedulerDaemon();
  } else {
    scheduler.startSchedulerDaemon();
  }
  res.json(scheduler.getStatus());
});

// 3. Google Account Info
app.get('/api/account', (req, res) => {
  res.json(accountManager.getAccountStatus());
});

// 4. Launch Google Login Window in Chrome
app.post('/api/account/login', async (req, res) => {
  try {
    const result = await accountManager.launchLoginWindow();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5. 1-Click Import Google Login from Desktop Chrome
app.post('/api/account/import', (req, res) => {
  try {
    const result = accountManager.importFromSystemChrome();
    res.json({ ok: true, account: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 5b. Log Out & Disconnect Google Account
app.post('/api/account/logout', (req, res) => {
  try {
    const result = accountManager.logoutAccount();
    res.json({ ok: true, account: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 6. Get Global Settings (Storage directory, Auto-leave rules, Bot preferences)
app.get('/api/settings', (req, res) => {
  res.json(settingsManager.getSettings());
});

// 7. Update Global Settings
app.post('/api/settings', (req, res) => {
  try {
    const updated = settingsManager.saveSettings(req.body);
    res.json({ ok: true, settings: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// 8. Get All Timetable Classes
app.get('/api/timetable', (req, res) => {
  res.json(scheduler.loadTimetable());
});

// 9. Add or Update Class
app.post('/api/timetable', (req, res) => {
  try {
    const entry = scheduler.addOrUpdateClass(req.body);
    res.json({ ok: true, class: entry, timetable: scheduler.loadTimetable() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// 10. Toggle Class Enabled
app.patch('/api/timetable/:id/toggle', (req, res) => {
  const updated = scheduler.toggleClass(req.params.id);
  if (!updated) return res.status(404).json({ ok: false, error: 'Class not found' });
  res.json({ ok: true, class: updated, timetable: scheduler.loadTimetable() });
});

// 11. Delete Class
app.delete('/api/timetable/:id', (req, res) => {
  const updated = scheduler.deleteClass(req.params.id);
  res.json({ ok: true, timetable: updated });
});

// 12. Start Instant Manual Recording
app.post('/api/record/start', async (req, res) => {
  const { link, duration, name } = req.body;
  if (!link || !link.includes('meet.google.com')) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid Google Meet URL.' });
  }

  try {
    const dur = parseInt(duration || '60', 10);
    const session = await scheduler.startManualSession(link, dur, name || 'Manual Session');
    res.json({ ok: true, session });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 13. Stop Active Recording
app.post('/api/record/stop', async (req, res) => {
  try {
    const result = await scheduler.stopActiveSession();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 14. List All Recorded Files from configured directory
app.get('/api/recordings', (req, res) => {
  const downloadDir = config.getDownloadDir();
  const files = storage.listRecordings(downloadDir);
  res.json({ ok: true, directory: downloadDir, count: files.length, files });
});

// 15. Delete a Recording File
app.delete('/api/recordings/:filename', (req, res) => {
  const downloadDir = config.getDownloadDir();
  const safeFilename = path.basename(req.params.filename);
  const targetPath = path.join(downloadDir, safeFilename);

  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ ok: false, error: 'File not found' });
  }

  try {
    fs.unlinkSync(targetPath);
    res.json({ ok: true, deleted: safeFilename });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Start Background Daemon & HTTP Server
scheduler.startSchedulerDaemon();

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n========================================================================');
  console.log(`      🚀 Google Meet Recorder Dashboard running at: http://localhost:${PORT}`);
  console.log('========================================================================\n');
});

module.exports = app;
