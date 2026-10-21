/**
 * backend/src/storage.js
 * Backward compatibility facade combining services/storageService.js and models/recordingModel.js
 */

const { waitForDownloads, writeSessionMetadata } = require('./services/storageService');
const { listRecordings, deleteRecordingFile } = require('./models/recordingModel');

module.exports = {
  waitForDownloads,
  writeSessionMetadata,
  listRecordings,
  deleteRecordingFile,
};
