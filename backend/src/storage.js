/**
 * backend/src/storage.js
 * Tracks and organizes completed recordings and transcripts
 */

const fs = require('fs');
const path = require('path');

async function waitForDownloads(downloadDir, timeoutMs = 45000, initialFiles = null) {
  console.log(`[Backend/Storage] Monitoring ${downloadDir} for completed files...`);
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
          console.log('[Backend/Storage] All downloads finalized successfully:');
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

function writeSessionMetadata(downloadDir, metadata) {
  const metaPath = path.join(downloadDir, `session-${Date.now()}-metadata.json`);
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
  console.log(`[Backend/Storage] Session metadata saved to: ${metaPath}`);
  return metaPath;
}

function listRecordings(downloadDir) {
  if (!fs.existsSync(downloadDir)) return [];
  try {
    const allFiles = fs.readdirSync(downloadDir);
    // Ignore temp/in-progress files
    const validFiles = allFiles.filter(f => !f.endsWith('.crdownload') && !f.endsWith('.tmp') && !f.startsWith('.'));

    return validFiles.map((filename) => {
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
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (e) {
    console.error('[Backend/Storage] Error reading recordings list:', e.message);
    return [];
  }
}

module.exports = { waitForDownloads, writeSessionMetadata, listRecordings };
