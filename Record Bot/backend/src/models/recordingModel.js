/**
 * backend/src/models/recordingModel.js
 * Model managing recorded video media, transcripts, subtitle files, and file deletions
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * Scans the designated recordings directory and returns a sorted list of media assets
 * @param {string} [downloadDir]
 * @returns {Array<object>}
 */
function listRecordings(downloadDir = config.getDownloadDir()) {
  if (!fs.existsSync(downloadDir)) return [];
  try {
    const allFiles = fs.readdirSync(downloadDir);
    // Ignore in-progress downloads or temporary dot files
    const validFiles = allFiles.filter(
      (f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp') && !f.startsWith('.')
    );

    return validFiles
      .map((filename) => {
        const fullPath = path.join(downloadDir, filename);
        const stat = fs.statSync(fullPath);
        let type = 'other';
        if (filename.endsWith('.webm') || filename.endsWith('.mp4')) type = 'video';
        else if (filename.endsWith('.txt')) type = 'transcript';
        else if (filename.endsWith('.vtt')) type = 'subtitles';
        else if (filename.endsWith('.csv')) type = 'attendance';
        else if (filename.endsWith('.json')) type = 'metadata';

        return {
          filename,
          type,
          size: stat.size,
          formattedSize: (stat.size / (1024 * 1024)).toFixed(2) + ' MB',
          createdAt: stat.birthtime || stat.mtime,
          url: `/recordings/${encodeURIComponent(filename)}`,
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (e) {
    console.error('[RecordingModel] Error listing recordings:', e.message);
    return [];
  }
}

/**
 * Safely deletes a recording file from the designated directory
 * @param {string} filename
 * @param {string} [downloadDir]
 * @returns {boolean} True if successfully deleted
 */
function deleteRecordingFile(filename, downloadDir = config.getDownloadDir()) {
  const safeFilename = path.basename(filename);
  const targetPath = path.join(downloadDir, safeFilename);

  if (!fs.existsSync(targetPath)) {
    throw new Error('File not found');
  }

  fs.unlinkSync(targetPath);
  return true;
}

module.exports = {
  listRecordings,
  deleteRecordingFile,
};
