/**
 * backend/src/controllers/recordingController.js
 * Controller handling manual session triggers, stopping recordings, and media file management
 */

const schedulerService = require('../services/schedulerService');
const recordingModel = require('../models/recordingModel');
const config = require('../config');

/**
 * Triggers an instant on-demand meeting recording session
 */
async function startRecording(req, res) {
  const { link, duration, name } = req.body;
  if (!link || !link.includes('meet.google.com')) {
    return res.status(400).json({ ok: false, error: 'Please enter a valid Google Meet URL.' });
  }

  try {
    const dur = parseInt(duration || '60', 10);
    const session = await schedulerService.startManualSession(link, dur, name || 'Manual Session');
    res.json({ ok: true, session });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Halts the actively running recording session and finalizes downloads
 */
async function stopRecording(req, res) {
  try {
    const result = await schedulerService.stopActiveSession();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Lists all recorded media, transcripts, and metadata files in the configured storage directory
 */
function listRecordings(req, res) {
  try {
    const downloadDir = config.getDownloadDir();
    const files = recordingModel.listRecordings(downloadDir);
    res.json({ ok: true, directory: downloadDir, count: files.length, files });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Deletes a recorded file by filename
 */
function deleteRecording(req, res) {
  try {
    const downloadDir = config.getDownloadDir();
    const filename = req.params.filename;
    recordingModel.deleteRecordingFile(filename, downloadDir);
    res.json({ ok: true, deleted: filename });
  } catch (err) {
    if (err.message === 'File not found') {
      return res.status(404).json({ ok: false, error: 'File not found' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  startRecording,
  stopRecording,
  listRecordings,
  deleteRecording,
};
