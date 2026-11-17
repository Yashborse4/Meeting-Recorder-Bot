/**
 * backend/src/services/storageService.js
 * Service for tracking file downloads, polling completion, and recording session metadata
 */

const fs = require('fs');
const path = require('path');

/**
 * Monitors the download directory until active Chrome downloads (.crdownload / .tmp) finish
 * and the expected recording media/transcripts are on disk.
 * @param {string} downloadDir
 * @param {number} [timeoutMs]
 * @param {Set<string>|null} [initialFiles] Snapshot of files existing before download started
 * @returns {Promise<object>}
 */
async function waitForDownloads(downloadDir, timeoutMs = 45000, initialFiles = null) {
  console.log(`[StorageService] Monitoring ${downloadDir} for completed files...`);
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        return reject(new Error('Timed out waiting for file downloads to finalize.'));
      }

      try {
        if (!fs.existsSync(downloadDir)) return;
        const files = fs.readdirSync(downloadDir);
        // Chrome downloads have .crdownload extension while downloading
        const activeDownloads = files.filter((f) => f.endsWith('.crdownload') || f.endsWith('.tmp'));

        // Don't finish while Chrome is actively downloading
        if (activeDownloads.length > 0) return;

        // If initialFiles snapshot was provided, focus on new files
        const candidateFiles = initialFiles
          ? files.filter((f) => !initialFiles.has(f) && !f.startsWith('.'))
          : files.filter((f) => !f.startsWith('.'));

        const webmFiles = candidateFiles.filter((f) => f.endsWith('.webm') || f.endsWith('.mp4'));
        const txtFiles = candidateFiles.filter((f) => f.endsWith('.txt'));
        const vttFiles = candidateFiles.filter((f) => f.endsWith('.vtt'));
        const csvFiles = candidateFiles.filter((f) => f.endsWith('.csv'));

        if (webmFiles.length > 0 || txtFiles.length > 0) {
          clearInterval(checkInterval);
          console.log('[StorageService] All downloads finalized successfully:');
          console.log(`  - Video: ${webmFiles.join(', ') || 'none'}`);
          console.log(`  - Transcripts: ${txtFiles.join(', ') || 'none'}`);
          console.log(`  - Subtitles: ${vttFiles.join(', ') || 'none'}`);
          console.log(`  - Attendance: ${csvFiles.join(', ') || 'none'}`);

          return resolve({
            directory: downloadDir,
            videos: webmFiles.map((f) => path.join(downloadDir, f)),
            transcripts: txtFiles.map((f) => path.join(downloadDir, f)),
            subtitles: vttFiles.map((f) => path.join(downloadDir, f)),
            attendance: csvFiles.map((f) => path.join(downloadDir, f)),
          });
        }
      } catch (err) {
        // Directory read error, retry next tick
      }
    }, 1000);
  });
}

/**
 * Saves JSON metadata about the recording session
 * @param {string} downloadDir
 * @param {object} metadata
 * @returns {string} File path written
 */
function writeSessionMetadata(downloadDir, metadata) {
  const metaPath = path.join(downloadDir, `session-${Date.now()}-metadata.json`);
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`[StorageService] Session metadata saved to: ${metaPath}`);
  return metaPath;
}

module.exports = {
  waitForDownloads,
  writeSessionMetadata,
};
