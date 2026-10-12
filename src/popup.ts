// src/popup.ts
// Extension Popup:
// - Orphan / Crash Recovery detection (MeetRecorderDB)
// - Microphone permission priming & verification
// - Manual Start / Stop tab recording controls
// - Real-time recording duration and session timer
// - In-extension settings & preferences configuration

import { recorderDB, SessionRecord } from './db';
import { fixWebmDuration } from './webmFix';
import { getSettings, saveSettings, ExtensionSettings } from './settings';

// Recording UI elements
const toggleMic = document.getElementById('toggle-mic-enable') as HTMLInputElement | null;
const micDesc = document.getElementById('mic-desc') as HTMLDivElement | null;
const startBtn = document.getElementById('start-rec') as HTMLButtonElement | null;
const pauseBtn = document.getElementById('pause-rec') as HTMLButtonElement | null;
const resumeBtn = document.getElementById('resume-rec') as HTMLButtonElement | null;
const stopBtn = document.getElementById('stop-rec') as HTMLButtonElement | null;
const btnDownloadAttendance = document.getElementById('btn-download-attendance') as HTMLButtonElement | null;

const statusPill = document.getElementById('status-pill') as HTMLDivElement | null;
const statusText = document.getElementById('status-text') as HTMLSpanElement | null;
const timerCard = document.getElementById('timer-card') as HTMLDivElement | null;
const timerDigits = document.getElementById('timer-digits') as HTMLDivElement | null;
const startTimeInfo = document.getElementById('start-time-info') as HTMLDivElement | null;

const recoveryCard = document.getElementById('recovery-card') as HTMLDivElement | null;
const recoveryMsg = document.getElementById('recovery-msg') as HTMLParagraphElement | null;
const recoverBtn = document.getElementById('recover-btn') as HTMLButtonElement | null;
const discardBtn = document.getElementById('discard-btn') as HTMLButtonElement | null;

// Settings & View Navigation elements
const viewMain = document.getElementById('view-main') as HTMLDivElement | null;
const viewSettings = document.getElementById('view-settings') as HTMLDivElement | null;
const btnSettingsToggle = document.getElementById('btn-settings-toggle') as HTMLButtonElement | null;
const btnSettingsBack = document.getElementById('btn-settings-back') as HTMLButtonElement | null;

const settingSaveVideo = document.getElementById('setting-save-video') as HTMLInputElement | null;
const settingSaveTxt = document.getElementById('setting-save-txt') as HTMLInputElement | null;
const settingSaveVtt = document.getElementById('setting-save-vtt') as HTMLInputElement | null;
const settingSaveAttendance = document.getElementById('setting-save-attendance') as HTMLInputElement | null;
const settingVideoQuality = document.getElementById('setting-video-quality') as HTMLSelectElement | null;
const settingAutoMic = document.getElementById('setting-auto-mic') as HTMLInputElement | null;
const settingNoiseSuppression = document.getElementById('setting-noise-suppression') as HTMLInputElement | null;
const settingAutoStop = document.getElementById('setting-auto-stop') as HTMLInputElement | null;
const btnClearCache = document.getElementById('btn-clear-cache') as HTMLButtonElement | null;

let liveTimerInterval: number | null = null;

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function setUI(recording: boolean, startedAt?: number, paused = false, realStart?: number, waitingForRejoin = false) {
  if (!startBtn || !stopBtn) return;
  startBtn.disabled = recording;
  stopBtn.disabled = !recording;
  if (pauseBtn) pauseBtn.disabled = !recording || paused;
  if (resumeBtn) resumeBtn.disabled = !recording || !paused;

  if (recording) {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
    if (pauseBtn) pauseBtn.style.display = paused ? 'none' : 'flex';
    if (resumeBtn) resumeBtn.style.display = paused ? 'flex' : 'none';

    if (statusPill) {
      statusPill.classList.add('recording');
      if (paused || waitingForRejoin) statusPill.style.opacity = '0.7';
      else statusPill.style.opacity = '1';
    }
    if (statusText) {
      statusText.textContent = waitingForRejoin ? 'WAITING REJOIN' : paused ? 'PAUSED' : 'REC LIVE';
    }
    if (timerCard) timerCard.classList.add('active');

    const effectiveStart = startedAt && startedAt > 0 ? startedAt : Date.now();
    const resolvedRealStart = realStart && realStart > 0 ? realStart : effectiveStart;
    if (startTimeInfo) {
      const timeStr = new Date(resolvedRealStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      startTimeInfo.innerHTML = `Started at: <strong>${timeStr}</strong>`;
    }

    const elapsed = Date.now() - effectiveStart;
    if (timerDigits) timerDigits.textContent = formatDuration(elapsed);

    if (!paused) {
      if (!liveTimerInterval) {
        liveTimerInterval = window.setInterval(() => {
          const curElapsed = Date.now() - effectiveStart;
          if (timerDigits) timerDigits.textContent = formatDuration(curElapsed);
        }, 1000);
      }
    } else if (liveTimerInterval) {
      clearInterval(liveTimerInterval);
      liveTimerInterval = null;
    }
  } else {
    startBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (resumeBtn) resumeBtn.style.display = 'none';

    if (statusPill) {
      statusPill.classList.remove('recording');
      statusPill.style.opacity = '1';
    }
    if (statusText) statusText.textContent = 'Idle';
    if (timerCard) timerCard.classList.remove('active');
    if (timerDigits) timerDigits.textContent = '00:00';
    if (startTimeInfo) startTimeInfo.innerHTML = 'Started at: <strong>--:--</strong>';

    if (liveTimerInterval) {
      clearInterval(liveTimerInterval);
      liveTimerInterval = null;
    }
  }
}

const toastEl = document.getElementById('toast') as HTMLDivElement | null;
let toastTimeout: number | null = null;

function toast(msg: string) {
  console.log('[popup]', msg);
  if (toastEl) {
    toastEl.textContent = msg;
    toastEl.classList.add('visible');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => {
      toastEl.classList.remove('visible');
    }, 2500);
  }
}

// Navigation between Main and Settings Views
function showSettings(show: boolean) {
  if (show) {
    viewMain?.classList.add('hidden');
    viewSettings?.classList.remove('hidden');
  } else {
    viewSettings?.classList.add('hidden');
    viewMain?.classList.remove('hidden');
  }
}

btnSettingsToggle?.addEventListener('click', () => {
  const isSettingsVisible = !viewSettings?.classList.contains('hidden');
  showSettings(!isSettingsVisible);
});

btnSettingsBack?.addEventListener('click', () => {
  showSettings(false);
});

function updateMicDescription(enabled: boolean) {
  if (!micDesc) return;
  if (!enabled) {
    micDesc.textContent = 'Microphone disabled (not recorded)';
    micDesc.style.color = 'var(--text-muted)';
  } else {
    micDesc.textContent = 'Only records when mic is open in Meet';
    micDesc.style.color = '#81c995';
  }
}

// Settings synchronization
async function initSettings() {
  const current = await getSettings();

  if (toggleMic) toggleMic.checked = current.autoMixMic;
  updateMicDescription(current.autoMixMic);

  if (settingSaveVideo) settingSaveVideo.checked = current.saveVideo;
  if (settingSaveTxt) settingSaveTxt.checked = current.saveTxtTranscript;
  if (settingSaveVtt) settingSaveVtt.checked = current.saveVttSubtitles;
  if (settingSaveAttendance) settingSaveAttendance.checked = !!current.saveAttendance;
  if (settingVideoQuality) settingVideoQuality.value = current.videoQuality;
  if (settingAutoMic) settingAutoMic.checked = current.autoMixMic;
  if (settingNoiseSuppression) settingNoiseSuppression.checked = current.noiseSuppression;
  if (settingAutoStop) settingAutoStop.checked = current.autoStopOnExit;

  const saveCurrent = async () => {
    const updated: ExtensionSettings = {
      saveVideo: settingSaveVideo ? settingSaveVideo.checked : true,
      saveTxtTranscript: settingSaveTxt ? settingSaveTxt.checked : true,
      saveVttSubtitles: settingSaveVtt ? settingSaveVtt.checked : true,
      saveAttendance: settingSaveAttendance ? settingSaveAttendance.checked : false,
      videoQuality: (settingVideoQuality?.value as any) || '1080p',
      autoMixMic: settingAutoMic ? settingAutoMic.checked : true,
      noiseSuppression: settingNoiseSuppression ? settingNoiseSuppression.checked : true,
      autoStopOnExit: settingAutoStop ? settingAutoStop.checked : true,
    };
    await saveSettings(updated);
    if (toggleMic && settingAutoMic) {
      toggleMic.checked = settingAutoMic.checked;
      updateMicDescription(settingAutoMic.checked);
      chrome.runtime.sendMessage({ type: 'MIC_SETTING_TOGGLED', enabled: settingAutoMic.checked }).catch(() => {});
    }
    toast('Settings saved');
  };

  [settingSaveVideo, settingSaveTxt, settingSaveVtt, settingSaveAttendance, settingAutoMic, settingNoiseSuppression, settingAutoStop].forEach(
    (el) => el?.addEventListener('change', saveCurrent)
  );
  settingVideoQuality?.addEventListener('change', saveCurrent);

  btnClearCache?.addEventListener('click', async () => {
    if (confirm('Clear all cached session recordings from local storage?')) {
      try {
        let activeSessionId: string | null = null;
        try {
          const st = await chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' });
          if (st?.recording && st?.sessionId) activeSessionId = st.sessionId;
        } catch {}
        const orphaned = await recorderDB.getOrphanedSessions();
        for (const s of orphaned) {
          if (s.sessionId !== activeSessionId) {
            await recorderDB.deleteSession(s.sessionId);
          }
        }
        if (recoveryCard) recoveryCard.style.display = 'none';
        pendingRecoverySession = null;
        if (btnClearCache) btnClearCache.textContent = '✓ Cache Cleared';
        setTimeout(() => {
          if (btnClearCache) btnClearCache.textContent = '🗑️ Clear Cached Sessions';
        }, 2000);
      } catch (e) {
        alert(`Error clearing cache: ${e}`);
      }
    }
  });
}

// Open full tab to grant mic permissions
async function openMicSetupTab() {
  await chrome.tabs.create({ url: chrome.runtime.getURL('micsetup.html') });
}

// Synchronize microphone permission and toggle state
async function syncMicState() {
  const current = await getSettings();
  if (toggleMic) toggleMic.checked = current.autoMixMic;
  updateMicDescription(current.autoMixMic);
}

// FR-EDGE-2: Orphaned Session & Crash Recovery Check
let pendingRecoverySession: SessionRecord | null = null;

async function checkOrphanedRecordings(activeSessionId?: string | null) {
  try {
    const allRecordingSessions = await recorderDB.getOrphanedSessions();
    const orphaned = activeSessionId
      ? allRecordingSessions.filter((s) => s.sessionId !== activeSessionId)
      : allRecordingSessions;
    if (orphaned.length > 0) {
      pendingRecoverySession = orphaned[0];
      const dateStr = new Date(pendingRecoverySession.startedAt).toLocaleTimeString();
      const approxDurationSec = (pendingRecoverySession.chunkCount || 1) * 5;

      if (recoveryCard && recoveryMsg) {
        recoveryMsg.textContent = `Incomplete recording detected from ${dateStr} (~${approxDurationSec}s, ${pendingRecoverySession.chunkCount} chunks).`;
        recoveryCard.style.display = 'block';
      }
    }
  } catch (err) {
    console.error('[popup] Error checking orphaned recordings:', err);
  }
}

recoverBtn?.addEventListener('click', async () => {
  if (!pendingRecoverySession || !recoverBtn) return;
  recoverBtn.disabled = true;
  recoverBtn.textContent = 'Assembling…';

  try {
    const sess = pendingRecoverySession;
    const approxDurationMs = Math.max(1000, (sess.chunkCount || 1) * 5000);

    const mime = sess.mimeType || 'video/webm';
    const rawBlob = await recorderDB.assembleSessionBlob(sess.sessionId, mime);

    let seekableBlob = rawBlob;
    if (mime.includes('webm')) {
      seekableBlob = await fixWebmDuration(rawBlob, approxDurationMs);
    }

    // Subtitle transcript & Plain Text transcript
    const vttContent = await recorderDB.generateWebVTT(sess.sessionId);
    const vttBlob = new Blob([vttContent], { type: 'text/vtt' });

    const txtContent = await recorderDB.generatePlainText(sess.sessionId);
    const txtBlob = new Blob([txtContent], { type: 'text/plain' });

    const videoUrl = URL.createObjectURL(seekableBlob);
    const vttUrl = URL.createObjectURL(vttBlob);
    const txtUrl = URL.createObjectURL(txtBlob);

    const suffix = sess.meetingId || 'recovered';
    const timestamp = Date.now();
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';

    const recoverySettings = await getSettings();

    chrome.downloads.download({
      url: videoUrl,
      filename: `GoogleMeet-Recovered-${suffix}-${timestamp}.${ext}`,
      saveAs: true,
    }, () => {
      if (recoverySettings.saveTxtTranscript) {
        chrome.downloads.download({
          url: txtUrl,
          filename: `GoogleMeet-Recovered-Transcript-${suffix}-${timestamp}.txt`,
          saveAs: false,
        });
      }

      if (recoverySettings.saveVttSubtitles) {
        chrome.downloads.download({
          url: vttUrl,
          filename: `GoogleMeet-Recovered-Transcript-${suffix}-${timestamp}.vtt`,
          saveAs: false,
        });
      }

      if (recoverySettings.saveAttendance && sess.attendance?.length) {
        const attContent = recorderDB.generateAttendanceCSV(
          sess.attendance,
          suffix,
          sess.startedAt,
          sess.endedAt || Date.now()
        );
        const attBlob = new Blob([attContent], { type: 'text/csv;charset=utf-8' });
        const attUrl = URL.createObjectURL(attBlob);
        chrome.downloads.download({
          url: attUrl,
          filename: `GoogleMeet-Recovered-Attendance-${suffix}-${timestamp}.csv`,
          saveAs: false,
        });
      }
    });

    // Cleanup session from IndexedDB after downloads initiate
    setTimeout(async () => {
      await recorderDB.deleteSession(sess.sessionId);
    }, 10000);

    if (recoveryCard) recoveryCard.style.display = 'none';
    pendingRecoverySession = null;
    toast('Orphaned recording and data successfully recovered.');
  } catch (err) {
    console.error('[popup] Recovery failed:', err);
    alert(`Could not recover recording: ${err}`);
  } finally {
    recoverBtn.disabled = false;
    recoverBtn.textContent = 'Recover & Download';
  }
});

discardBtn?.addEventListener('click', async () => {
  if (!pendingRecoverySession) return;
  try {
    await recorderDB.deleteSession(pendingRecoverySession.sessionId);
    if (recoveryCard) recoveryCard.style.display = 'none';
    pendingRecoverySession = null;
    toast('Orphaned recording discarded.');
  } catch (err) {
    console.error('[popup] Discard failed:', err);
  }
});

// Init: sync recording state, check mic, settings, and check for crashes
void (async () => {
  let activeSessionId: string | null = null;
  try {
    const st = await chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' });
    if (st?.recording && st?.sessionId) {
      activeSessionId = st.sessionId;
    }
    setUI(!!st?.recording, st?.startedAt, !!st?.paused, st?.realStartTime, !!st?.waitingForRejoin);
  } catch {
    setUI(false);
  }
  syncMicState().catch(() => {});
  checkOrphanedRecordings(activeSessionId).catch(() => {});
  initSettings().catch(() => {});
})();

// Listen for background state broadcasts
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'RECORDING_STATE') {
    setUI(!!msg.recording, msg.startedAt, !!msg.paused, msg.realStartTime, !!msg.waitingForRejoin);
  }
  if (msg?.type === 'RECORDING_SAVED') {
    toast(`Video saved: ${msg.filename || 'recording.webm'}`);
    setUI(false);
  }
  if (msg?.type === 'TRANSCRIPT_SAVED') {
    toast(`Transcript saved: ${msg.filename || 'transcript.txt'}`);
  }
  if (msg?.type === 'ATTENDANCE_SAVED') {
    toast(`Attendance saved: ${msg.filename || 'attendance.csv'}`);
  }
  if (msg?.type === 'MIC_PERMISSION_GRANTED') {
    if (toggleMic) toggleMic.checked = true;
    if (settingAutoMic) settingAutoMic.checked = true;
    updateMicDescription(true);
    void (async () => {
      const cur = await getSettings();
      cur.autoMixMic = true;
      await saveSettings(cur);
      chrome.runtime.sendMessage({ type: 'MIC_SETTING_TOGGLED', enabled: true }).catch(() => {});
    })();
  }
});

// Microphone toggle switch handler (allows enabling and disabling mic anytime)
toggleMic?.addEventListener('change', async () => {
  const shouldEnable = !!toggleMic.checked;
  if (shouldEnable) {
    let hasPermission = false;
    try {
      if ('permissions' in navigator) {
        // @ts-ignore
        const p = await (navigator as any).permissions.query({ name: 'microphone' });
        hasPermission = p.state === 'granted';
      }
    } catch {}

    if (!hasPermission) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
        hasPermission = true;
        await chrome.storage.local.set({ micPermissionGranted: true });
      } catch {
        // Fallback to dedicated mic setup popup if popup getUserMedia is denied
        await openMicSetupTab();
        toggleMic.checked = false;
        updateMicDescription(false);
        return;
      }
    }
  }

  const currentSettings = await getSettings();
  currentSettings.autoMixMic = shouldEnable;
  await saveSettings(currentSettings);

  if (settingAutoMic) settingAutoMic.checked = shouldEnable;
  updateMicDescription(shouldEnable);

  chrome.runtime.sendMessage({ type: 'MIC_SETTING_TOGGLED', enabled: shouldEnable }).catch(() => {});
  toast(shouldEnable ? 'Microphone enabled' : 'Microphone disabled');
});

let inFlight = false;

// Start recording button
startBtn?.addEventListener('click', async () => {
  if (!startBtn || !stopBtn || inFlight) return;
  inFlight = true;
  startBtn.disabled = true;

  try {
    // Pre-flight: check if a recording is already active before attempting tab capture
    try {
      const preCheck = await chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' });
      if (preCheck?.recording) {
        // Recording is active — just fix the UI to match reality
        setUI(true, preCheck.startedAt, !!preCheck.paused, preCheck.realStartTime, !!preCheck.waitingForRejoin);
        return;
      }
    } catch {}

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');
    const activeTabId = tab.id;

    if (tab.url && !tab.url.includes('meet.google.com')) {
      throw new Error('Please switch to your Google Meet call tab before starting recording.');
    }

    // Reset content script transcript buffer
    await chrome.tabs.sendMessage(activeTabId, { type: 'RESET_TRANSCRIPT' }).catch(() => {});

    // Obtain mediaStreamId directly under user gesture in the popup
    let streamId: string | undefined;
    let source: 'tab' | 'desktop' = 'tab';

    try {
      streamId = await new Promise<string>((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: activeTabId }, (id?: string) => {
          const err = chrome.runtime.lastError;
          if (err || !id) {
            return reject(err ? new Error(err.message) : new Error('No streamId returned by tabCapture'));
          }
          resolve(id);
        });
      });
      source = 'tab';
    } catch (tabErr: any) {
      // "Cannot capture a tab with an active stream" means the tab is already being
      // captured — likely the offscreen document is still alive after a service worker
      // restart that wiped in-memory state. Re-query the background and sync the UI
      // instead of showing the desktop-capture picker.
      const errMsg: string = tabErr?.message || String(tabErr);
      if (errMsg.toLowerCase().includes('active stream')) {
        console.warn('[popup] tabCapture: tab already has active stream — re-syncing state with background');
        try {
          const recheck = await chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' });
          if (recheck?.recording) {
            setUI(true, recheck.startedAt, !!recheck.paused, recheck.realStartTime, !!recheck.waitingForRejoin);
            return;
          }
        } catch {}
        // If background also says "not recording", the old stream is stale/orphaned.
        // Surface a clear error rather than opening a confusing screen-share picker.
        throw new Error(
          'This tab already has an active capture stream. ' +
          'If a recording is in progress, please stop it first. ' +
          'Otherwise, refreshing the Google Meet tab should clear the stale stream.'
        );
      }

      console.warn('[popup] tabCapture.getMediaStreamId failed, trying desktopCapture prompt:', tabErr);
      streamId = await new Promise<string>((resolve, reject) => {
        chrome.desktopCapture.chooseDesktopMedia(['tab', 'audio'], tab, (id?: string) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message));
          if (!id) return reject(new Error('Sharing was cancelled'));
          resolve(id);
        });
      });
      source = 'desktop';
    }

    const resp = await chrome.runtime.sendMessage({
      type: 'START_RECORDING',
      tabId: activeTabId,
      streamId,
      source,
    });

    if (!resp) throw new Error('No response from background service worker');
    // If background says already recording, fix UI silently
    if (resp.alreadyRecording) {
      setUI(true, resp.startedAt, !!resp.paused, resp.realStartTime, !!resp.waitingForRejoin);
      return;
    }
    if (resp.ok === false) throw new Error(resp.error || 'Failed to start recording');

    setUI(true);
    toast('Recording started');
  } catch (e: any) {
    console.error('[popup] START_RECORDING error', e);
    setUI(false);
    alert(`Failed to start recording:\n${e?.message || e}`);
  } finally {
    inFlight = false;
  }
});

// Stop recording button
stopBtn?.addEventListener('click', async () => {
  if (!startBtn || !stopBtn || inFlight) return;
  inFlight = true;
  stopBtn.disabled = true;

  try {
    const resp = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    if (!resp) throw new Error('No response from background service worker');
    if (resp.ok === false) throw new Error(resp.error || 'Failed to stop recording');
    toast('Stopping and compiling recording…');
  } catch (e: any) {
    console.error('[popup] STOP_RECORDING error', e);
    alert(`Failed to stop recording:\n${e?.message || e}`);
    setUI(false);
  } finally {
    inFlight = false;
  }
});

pauseBtn?.addEventListener('click', async () => {
  if (inFlight) return;
  inFlight = true;
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'PAUSE_RECORDING' });
    if (!resp?.ok) throw new Error(resp?.error || 'Failed to pause');
  } catch (e) {
    console.error(e);
  } finally {
    inFlight = false;
  }
});

resumeBtn?.addEventListener('click', async () => {
  if (inFlight) return;
  inFlight = true;
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'RESUME_RECORDING' });
    if (!resp?.ok) throw new Error(resp?.error || 'Failed to resume');
  } catch (e) {
    console.error(e);
  } finally {
    inFlight = false;
  }
});

// Download Attendance (Excel / CSV) button handler
btnDownloadAttendance?.addEventListener('click', async () => {
  if (!btnDownloadAttendance || inFlight) return;
  const origText = btnDownloadAttendance.innerHTML;
  btnDownloadAttendance.disabled = true;
  btnDownloadAttendance.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10"/>
    </svg>
    Exporting…
  `;

  try {
    // 1. Check active tab or query open Google Meet tabs
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let targetTab = activeTab?.url && activeTab.url.includes('meet.google.com') ? activeTab : null;

    if (!targetTab) {
      const meetTabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
      if (meetTabs.length > 0) targetTab = meetTabs[0];
    }

    let attendanceList: any[] = [];
    let meetingTitle = 'google-meet';

    if (typeof targetTab?.id === 'number') {
      const tabId = targetTab.id;
      try {
        const res = await new Promise<any>((resolve) => {
          chrome.tabs.sendMessage(tabId, { type: 'GET_ATTENDANCE' }, (r) => {
            if (chrome.runtime.lastError || !r) resolve(null);
            else resolve(r);
          });
          setTimeout(() => resolve(null), 1500);
        });
        if (res?.attendance && Array.isArray(res.attendance)) {
          attendanceList = res.attendance;
          if (res.meetingId) meetingTitle = res.meetingId;
        }
      } catch (err) {
        console.warn('[popup] Could not query attendance from tab:', err);
      }
    }

    // 2. If no active tab participants found (e.g. while refreshing), check active background/offscreen session or latest DB session
    if (attendanceList.length === 0) {
      try {
        const st = await chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' });
        if (Array.isArray(st?.attendance) && st.attendance.length > 0) {
          attendanceList = st.attendance;
          if (st.meetingId) meetingTitle = st.meetingId;
        }
      } catch {}
    }
    if (attendanceList.length === 0) {
      try {
        const sessions = await recorderDB.getOrphanedSessions();
        if (sessions.length > 0 && sessions[0].attendance?.length) {
          attendanceList = sessions[0].attendance;
          meetingTitle = sessions[0].meetingId || meetingTitle;
        }
      } catch {}
    }

    if (attendanceList.length === 0) {
      alert(
        'No participants detected yet.\n\n' +
        'Please join or switch to an active Google Meet call before downloading attendance.'
      );
      return;
    }

    // Calculate actual session timestamps from observed attendee presences
    let minFirstSeen = Date.now();
    let maxLastSeen = 0;
    for (const a of attendanceList) {
      if (a.firstSeen && a.firstSeen < minFirstSeen) minFirstSeen = a.firstSeen;
      if (a.lastSeen && a.lastSeen > maxLastSeen) maxLastSeen = a.lastSeen;
    }
    const sessionStart = minFirstSeen <= Date.now() ? minFirstSeen : Date.now();
    const sessionEnd = maxLastSeen >= sessionStart ? maxLastSeen : Date.now();

    // 3. Generate Excel-compatible CSV with UTF-8 BOM
    const csvContent = recorderDB.generateAttendanceCSV(
      attendanceList,
      meetingTitle,
      sessionStart,
      sessionEnd
    );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const sanitizedTitle = meetingTitle.replace(/[/\\?%*:|"<>]/g, '-');
    const filename = `GoogleMeet-Attendance-${sanitizedTitle}-${Date.now()}.csv`;

    chrome.downloads.download({
      url: blobUrl,
      filename,
      saveAs: true,
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('[popup] Download failed:', chrome.runtime.lastError.message);
        alert(`Failed to download attendance sheet: ${chrome.runtime.lastError.message}`);
      } else {
        toast(`Attendance exported (${attendanceList.length} attendees, id=${downloadId})`);
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    });
  } catch (e: any) {
    console.error('[popup] Export attendance error:', e);
    alert(`Could not download attendance:\n${e?.message || e}`);
  } finally {
    btnDownloadAttendance.disabled = false;
    btnDownloadAttendance.innerHTML = origText;
  }
});
