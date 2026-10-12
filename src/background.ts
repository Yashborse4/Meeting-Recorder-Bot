// src/background.ts
// Manifest V3 Service Worker:
// - Keep-Alive connection port with offscreen document
// - Tab capture streamId coordination
// - Dual file downloads (WebM video + WebVTT subtitles)
// - Google Meet state forwarding (Mute Sync, Captions, Disconnect)
// - Auto-finalization when recorded tab closes

import { getSettings } from './settings';

let offscreenPort: chrome.runtime.Port | null = null;
let offscreenReady = false;
let lastKnownRecording = false;
let lastKnownPaused = false;
let activeRecordingTabId: number | null = null;
let activeRecordingSessionId: string | null = null;
let activeRecordingMeetingId: string | null = null;
let activeRecordingStartTime = 0;
let activeRecordingRealStartTime = 0;
let isWaitingForRejoin = false;
let autoPausedForRejoin = false;
let rejoinGraceTimer: ReturnType<typeof setTimeout> | null = null;
const closingTabIds = new Set<number>();
const savedSessionIds = new Set<string>();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function bglog(...a: any[]) {
  console.log('[background]', ...a);
}

function extractMeetingId(urlStr?: string): string | null {
  if (!urlStr) return null;
  try {
    const u = new URL(urlStr);
    if (!u.hostname.includes('meet.google.com')) return null;
    const path = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!path || path === 'landing' || path === 'new' || path.startsWith('_meet')) {
      return null;
    }
    const parts = path.split('/');
    const code = parts[parts.length - 1];
    if (code && code.length >= 3 && code !== 'landing') {
      return code;
    }
    return null;
  } catch {
    return null;
  }
}

function setBadge(recording: boolean, paused: boolean = false) {
  try {
    let badgeText = '';
    if (recording) {
      badgeText = paused ? 'PAUSE' : 'REC';
    }
    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: paused ? '#F59E0B' : '#EA4335' });
  } catch {}
}

let heartbeatTimer: any = null;

function broadcastState(recording: boolean, extra?: Record<string, any>) {
  lastKnownRecording = recording;
  if (typeof extra?.paused === 'boolean') {
    lastKnownPaused = extra.paused;
  }
  setBadge(recording, lastKnownPaused);

  // Persist authoritative recording state to chrome.storage.session from the service worker
  // (Offscreen documents do not have access to chrome.storage in MV3)
  try {
    const sessionUpdate: Record<string, any> = {
      recording,
      paused: lastKnownPaused,
      waitingForRejoin: isWaitingForRejoin,
      autoPausedForRejoin,
      sessionId: activeRecordingSessionId,
      startedAt: activeRecordingStartTime,
      realStartTime: activeRecordingRealStartTime,
    };
    if (!recording) {
      sessionUpdate.tabId = null;
      sessionUpdate.meetingId = null;
    } else {
      if (typeof activeRecordingTabId === 'number') sessionUpdate.tabId = activeRecordingTabId;
      if (activeRecordingMeetingId) sessionUpdate.meetingId = activeRecordingMeetingId;
    }
    (chrome.storage as any)?.session?.set?.(sessionUpdate);
  } catch {}

  // Power & Sleep prevention: Keep display & system awake, prevent tab discarding
  try {
    if (recording) {
      chrome.power?.requestKeepAwake('display');
      if (typeof activeRecordingTabId === 'number') {
        chrome.tabs.update(activeRecordingTabId, { autoDiscardable: false }).catch(() => {});
      }
      if (!heartbeatTimer) {
        heartbeatTimer = setInterval(() => {
          if (lastKnownRecording && offscreenPort) {
            try { offscreenPort.postMessage({ type: 'HEARTBEAT' }); } catch {}
          }
        }, 15000);
      }
    } else {
      chrome.power?.releaseKeepAwake();
      if (typeof activeRecordingTabId === 'number') {
        chrome.tabs.update(activeRecordingTabId, { autoDiscardable: true }).catch(() => {});
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }
  } catch (e) {
    bglog('Power / sleep-prevention error:', e);
  }

  const payload = {
    type: 'RECORDING_STATE',
    recording,
    paused: lastKnownPaused,
    waitingForRejoin: isWaitingForRejoin,
    tabId: activeRecordingTabId,
    sessionId: activeRecordingSessionId,
    meetingId: activeRecordingMeetingId,
    startedAt: activeRecordingStartTime,
    realStartTime: activeRecordingRealStartTime,
    ...extra,
  };

  // Broadcast to popup / extension contexts
  chrome.runtime.sendMessage(payload).catch(() => {});

  // Broadcast to all Google Meet tabs for native UI feedback
  chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
    tabs.forEach((t) => {
      if (typeof t.id === 'number') {
        const tabId = t.id;
        chrome.tabs.sendMessage(tabId, payload).catch(() => {});
      }
    });
  });
}

async function hasOffscreenContext(): Promise<boolean> {
  try {
    const getContexts = (chrome.runtime as any).getContexts as
      | ((q: { contextTypes: ('OFFSCREEN_DOCUMENT' | string)[] }) => Promise<any[]>)
      | undefined;
    if (getContexts) {
      const ctx = await getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }).catch(() => []);
      return Array.isArray(ctx) && ctx.length > 0;
    }
  } catch {}
  try {
    return !!(await (chrome.offscreen as any).hasDocument?.());
  } catch {
    return false;
  }
}

async function ensureOffscreen(): Promise<void> {
  const have = await hasOffscreenContext();
  if (!have) {
    bglog('Creating offscreen document…');
    await chrome.offscreen.createDocument({
      url: chrome.runtime.getURL('offscreen.html'),
      reasons: ['BLOBS', 'AUDIO_PLAYBACK', 'USER_MEDIA'] as any[],
      justification: 'Record tab audio+video in offscreen using MediaRecorder and Web Audio API',
    });
  }

  for (let i = 0; i < 30 && !(offscreenPort && offscreenReady); i++) {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'OFFSCREEN_PING' });
      if (res?.ok) {
        bglog('Offscreen responded to PING');
        break;
      }
    } catch {}
    await wait(100);
  }

  if (!(offscreenPort && offscreenReady)) {
    try {
      await chrome.runtime.sendMessage({ type: 'OFFSCREEN_CONNECT' });
    } catch {}
  }

  for (let i = 0; i < 100; i++) {
    if (offscreenPort && offscreenReady) return;
    await wait(100);
  }
  throw new Error('Offscreen document did not become ready in time');
}

function handleOffscreenSave(msg: any) {
  const saveKey = msg.sessionId || msg.videoFilename;
  if (saveKey && savedSessionIds.has(saveKey)) {
    return;
  }
  if (saveKey) {
    savedSessionIds.add(saveKey);
  }

  const sanitize = (name: string) => name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
  const videoFilename = sanitize(msg.videoFilename || `GoogleMeet-Recording-${Date.now()}.webm`);
  const txtFilename = sanitize(msg.txtFilename || `GoogleMeet-Transcript-${Date.now()}.txt`);
  const vttFilename = sanitize(msg.vttFilename || `GoogleMeet-Transcript-${Date.now()}.vtt`);
  const attendanceFilename = sanitize(msg.attendanceFilename || `GoogleMeet-Attendance-${Date.now()}.csv`);

  bglog('OFFSCREEN_SAVE received: video =', videoFilename, ', transcript =', txtFilename, ', attendance =', attendanceFilename);

  void (async () => {
    const settings = await getSettings();

    const downloadTranscripts = () => {
      // 1. Download readable plain-text transcript (.txt)
      // Prefer blob URL: data URLs can exceed Chromium's ~2MB limit on long meetings
      const txtUrl = msg.txtBlobUrl || msg.txtDataUrl;
      if (txtUrl && settings.saveTxtTranscript) {
        chrome.downloads.download(
          {
            url: txtUrl,
            filename: txtFilename,
            saveAs: false,
          },
          (txtId) => {
            if (chrome.runtime.lastError) {
              bglog('TXT transcript download error:', chrome.runtime.lastError.message);
              // Retry with data URL fallback if blob URL failed
              if (msg.txtDataUrl && txtUrl !== msg.txtDataUrl) {
                bglog('Retrying TXT download with data URL fallback...');
                chrome.downloads.download(
                  { url: msg.txtDataUrl, filename: txtFilename, saveAs: false },
                  (retryId) => {
                    if (chrome.runtime.lastError) {
                      bglog('TXT data URL fallback also failed:', chrome.runtime.lastError.message);
                    } else {
                      bglog(`TXT transcript download (fallback) initiated, id=${retryId}`);
                      chrome.runtime.sendMessage({ type: 'TRANSCRIPT_SAVED', filename: txtFilename }).catch(() => {});
                    }
                  }
                );
              }
            } else {
              bglog(`TXT transcript download initiated, id=${txtId}`);
              chrome.runtime.sendMessage({ type: 'TRANSCRIPT_SAVED', filename: txtFilename }).catch(() => {});
            }
          }
        );
      }

      // 2. Download WebVTT subtitle track (.vtt)
      // Prefer blob URL: data URLs can exceed Chromium's ~2MB limit on long meetings
      const vttUrl = msg.vttBlobUrl || msg.vttDataUrl;
      if (vttUrl && settings.saveVttSubtitles) {
        chrome.downloads.download(
          {
            url: vttUrl,
            filename: vttFilename,
            saveAs: false,
          },
          (vttId) => {
            if (chrome.runtime.lastError) {
              bglog('VTT subtitle download error:', chrome.runtime.lastError.message);
              // Retry with data URL fallback if blob URL failed
              if (msg.vttDataUrl && vttUrl !== msg.vttDataUrl) {
                bglog('Retrying VTT download with data URL fallback...');
                chrome.downloads.download(
                  { url: msg.vttDataUrl, filename: vttFilename, saveAs: false },
                  (retryId) => {
                    if (chrome.runtime.lastError) {
                      bglog('VTT data URL fallback also failed:', chrome.runtime.lastError.message);
                    } else {
                      bglog(`VTT subtitle download (fallback) initiated, id=${retryId}`);
                    }
                  }
                );
              }
            } else {
              bglog(`VTT subtitle download initiated, id=${vttId}`);
            }
          }
        );
      }

      // 3. Download Attendance Excel Sheet (.csv) if enabled in settings (default: off)
      const attendanceUrl = msg.attendanceBlobUrl || msg.attendanceDataUrl;
      if (attendanceUrl && settings.saveAttendance) {
        chrome.downloads.download(
          {
            url: attendanceUrl,
            filename: attendanceFilename,
            saveAs: false,
          },
          (attId) => {
            if (chrome.runtime.lastError) {
              bglog('Attendance sheet download error:', chrome.runtime.lastError.message);
              if (msg.attendanceDataUrl && attendanceUrl !== msg.attendanceDataUrl) {
                chrome.downloads.download(
                  { url: msg.attendanceDataUrl, filename: attendanceFilename, saveAs: false },
                  (retryId) => {
                    if (!chrome.runtime.lastError) {
                      bglog(`Attendance sheet (fallback) initiated, id=${retryId}`);
                      chrome.runtime.sendMessage({ type: 'ATTENDANCE_SAVED', filename: attendanceFilename }).catch(() => {});
                    }
                  }
                );
              }
            } else {
              bglog(`Attendance sheet download initiated, id=${attId}`);
              chrome.runtime.sendMessage({ type: 'ATTENDANCE_SAVED', filename: attendanceFilename }).catch(() => {});
            }
          }
        );
      }
    };

    let activeDownloadId: number | null = null;
    const cleanupSession = () => {
      const revokePayload = {
        type: 'REVOKE_BLOB_URL',
        sessionId: msg.sessionId,
        videoBlobUrl: msg.videoBlobUrl,
        txtBlobUrl: msg.txtBlobUrl,
        vttBlobUrl: msg.vttBlobUrl,
        attendanceBlobUrl: msg.attendanceBlobUrl,
      };
      try {
        offscreenPort?.postMessage(revokePayload);
      } catch {}
      try {
        chrome.runtime.sendMessage(revokePayload).catch(() => {});
      } catch {}
    };

    if (msg.videoBlobUrl && settings.saveVideo) {
      chrome.downloads.download(
        {
          url: msg.videoBlobUrl,
          filename: videoFilename,
          saveAs: true,
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || '';
            bglog('Video download error or cancelled:', errMsg);
            const isUserCanceled =
              errMsg.includes('USER_CANCELED') ||
              errMsg.toLowerCase().includes('canceled') ||
              errMsg.toLowerCase().includes('cancelled');
            // If SaveAs dialog failed because the tab/window was just closed, automatically fallback to saveAs: false
            if (!isUserCanceled) {
              bglog('Retrying video download with saveAs: false fallback after tab/window close...');
              chrome.downloads.download(
                {
                  url: msg.videoBlobUrl,
                  filename: videoFilename,
                  saveAs: false,
                },
                (retryDownloadId) => {
                  if (!chrome.runtime.lastError) {
                    activeDownloadId = retryDownloadId ?? null;
                    bglog(`Video download (saveAs: false fallback) initiated, id=${retryDownloadId}`);
                    chrome.runtime.sendMessage({ type: 'RECORDING_SAVED', filename: videoFilename }).catch(() => {});
                  } else {
                    bglog('Video download fallback also failed:', chrome.runtime.lastError.message);
                  }
                }
              );
            }
          } else {
            activeDownloadId = downloadId ?? null;
            bglog(`Video download initiated, id=${downloadId}`);
            chrome.runtime.sendMessage({ type: 'RECORDING_SAVED', filename: videoFilename }).catch(() => {});
          }
          // Automatically download transcript when saving video
          downloadTranscripts();
        }
      );
    } else {
      downloadTranscripts();
    }

    // Track completion for safe memory cleanup
    if (chrome.downloads?.onChanged) {
      const downloadListener = (delta: chrome.downloads.DownloadDelta) => {
        if (activeDownloadId && delta.id === activeDownloadId) {
          if (delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
            setTimeout(cleanupSession, 10000);
            chrome.downloads.onChanged.removeListener(downloadListener);
          }
        }
      };
      chrome.downloads.onChanged.addListener(downloadListener);
    }

    // Fallback cleanup timer (5 minutes)
    setTimeout(cleanupSession, 300000);
  })();
}

// Service Worker Port Keep-Alive
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'offscreen') return;
  bglog('Offscreen connected via port');
  offscreenPort = port;
  offscreenReady = false;

  port.onMessage.addListener((msg: any) => {
    if (msg?.type === 'OFFSCREEN_READY') {
      offscreenReady = true;
      bglog('Offscreen is READY (Port)');
    }

    if (msg?.type === 'RECORDING_STATE') {
      lastKnownRecording = !!msg.recording;
      if (typeof msg.paused === 'boolean') lastKnownPaused = msg.paused;
      if (msg.sessionId) activeRecordingSessionId = msg.sessionId;
      if (msg.startedAt) activeRecordingStartTime = msg.startedAt;
      if (msg.realStartTime) activeRecordingRealStartTime = msg.realStartTime;
      
      if (!lastKnownRecording) {
        activeRecordingTabId = null;
        activeRecordingSessionId = null;
        activeRecordingMeetingId = null;
        activeRecordingStartTime = 0;
        activeRecordingRealStartTime = 0;
        isWaitingForRejoin = false;
        autoPausedForRejoin = false;
        if (rejoinGraceTimer) {
          clearTimeout(rejoinGraceTimer);
          rejoinGraceTimer = null;
        }
      } else if (activeRecordingTabId === null) {
        // Service worker might have been suspended and lost activeRecordingTabId in memory.
        // Recover it from session storage asynchronously.
        try {
          (chrome.storage as any)?.session?.get?.(
            ['tabId', 'meetingId', 'waitingForRejoin', 'autoPausedForRejoin'],
            (res: any) => {
              if (res) {
                if (res.tabId) activeRecordingTabId = res.tabId;
                if (res.meetingId) activeRecordingMeetingId = res.meetingId;
                if (typeof res.waitingForRejoin === 'boolean') isWaitingForRejoin = res.waitingForRejoin;
                if (typeof res.autoPausedForRejoin === 'boolean') autoPausedForRejoin = res.autoPausedForRejoin;
                bglog('Recovered activeRecordingTabId from session storage:', activeRecordingTabId);
                broadcastState(lastKnownRecording, {
                  ...msg,
                  tabId: activeRecordingTabId,
                  meetingId: activeRecordingMeetingId,
                  waitingForRejoin: isWaitingForRejoin,
                });
              }
            }
          );
        } catch {}
      }
      
      broadcastState(lastKnownRecording, { ...msg, waitingForRejoin: isWaitingForRejoin });
    }

    if (msg?.type === 'OFFSCREEN_KEEPALIVE') {
      lastKnownRecording = !!msg.recording;
      if (typeof msg.paused === 'boolean') lastKnownPaused = msg.paused;
      if (msg.sessionId) activeRecordingSessionId = msg.sessionId;
      if (msg.startedAt) activeRecordingStartTime = msg.startedAt;
      if (msg.realStartTime) activeRecordingRealStartTime = msg.realStartTime;
      return;
    }

    // Multi-file downloads (Video WebM/MP4 + Plain Text .txt transcript + WebVTT subtitles + Excel Attendance .csv)
    if (msg?.type === 'OFFSCREEN_SAVE') {
      handleOffscreenSave(msg);
    }
  });

  port.onDisconnect.addListener(() => {
    bglog('Offscreen disconnected');
    if (offscreenPort === port) {
      offscreenPort = null;
      offscreenReady = false;
    }
  });
});

function postToOffscreen(msg: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!offscreenPort) return reject(new Error('Offscreen port not connected'));
    const id = Math.random().toString(36).slice(2);
    msg.__id = id;

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      try {
        offscreenPort?.onMessage.removeListener(listener);
      } catch {}
    };

    const listener = (m: any) => {
      if (m && m.__respFor === id) {
        cleanup();
        resolve(m.payload);
      }
    };

    offscreenPort.onMessage.addListener(listener);

    try {
      offscreenPort.postMessage(msg);
    } catch (e) {
      cleanup();
      reject(new Error(`Failed to post to offscreen: ${e}`));
      return;
    }

    // 30s timeout: getUserMedia + AudioContext + MediaRecorder.start() can take
    // a while on first use or slower machines (permission dialogs, cold start)
    setTimeout(() => {
      cleanup();
      reject(new Error('Offscreen response timeout'));
    }, 30000);
  });
}

async function hydrateStateIfNeeded(): Promise<void> {
  if (lastKnownRecording && activeRecordingTabId !== null && offscreenPort) {
    return;
  }
  try {
    const stored: any = await new Promise((resolve) => {
      (chrome.storage as any)?.session?.get?.(
        ['recording', 'paused', 'sessionId', 'startedAt', 'realStartTime', 'tabId', 'meetingId', 'waitingForRejoin', 'autoPausedForRejoin'],
        (r: any) => resolve(r || {})
      );
    });
    if (stored?.recording) {
      lastKnownRecording = true;
      if (typeof stored.paused === 'boolean') lastKnownPaused = stored.paused;
      if (stored.sessionId) activeRecordingSessionId = stored.sessionId;
      if (stored.startedAt) activeRecordingStartTime = stored.startedAt;
      if (stored.realStartTime) activeRecordingRealStartTime = stored.realStartTime;
      if (typeof stored.tabId === 'number') activeRecordingTabId = stored.tabId;
      if (stored.meetingId) activeRecordingMeetingId = stored.meetingId;
      if (typeof stored.waitingForRejoin === 'boolean') isWaitingForRejoin = stored.waitingForRejoin;
      if (typeof stored.autoPausedForRejoin === 'boolean') autoPausedForRejoin = stored.autoPausedForRejoin;
    }
  } catch {}

  if (!offscreenPort) {
    try {
      const hasOff = await hasOffscreenContext();
      if (hasOff) {
        await Promise.race([
          ensureOffscreen(),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('ensureOffscreen timeout')), 3000)),
        ]);
        if (offscreenPort && !lastKnownRecording) {
          const st = await Promise.race([
            postToOffscreen({ type: 'OFFSCREEN_STATUS' }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
          ]);
          if (st?.recording) {
            lastKnownRecording = true;
            lastKnownPaused = !!st.paused;
            if (st.sessionId) activeRecordingSessionId = st.sessionId;
            if (st.startedAt) activeRecordingStartTime = st.startedAt;
            if (st.realStartTime) activeRecordingRealStartTime = st.realStartTime;
          }
        }
      }
    } catch {}
  }
}

async function getStreamIdForTab(tabId: number, preferDesktop: boolean = false): Promise<{ streamId: string, source: 'tab' | 'desktop' }> {
  // 1. Try direct tabCapture.getMediaStreamId (ONLY valid when initiated via extension gesture like popup or command)
  if (!preferDesktop) {
    try {
      const directId = await new Promise<string>((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id?: string) => {
          const err = chrome.runtime.lastError;
          if (err || !id) {
            return reject(err ? new Error(err.message) : new Error('Empty streamId'));
          }
          resolve(id);
        });
      });
      return { streamId: directId, source: 'tab' };
    } catch (err: any) {
      bglog('tabCapture.getMediaStreamId not invoked via extension gesture; falling back to desktopCapture:', err?.message || err);
    }
  }

  // 2. Fallback / in-page button initiator: desktopCapture.chooseDesktopMedia(['tab', 'audio'])
  // Works cleanly when initiated from in-page buttons without activeTab restrictions!
  const tab = await chrome.tabs.get(tabId);
  return new Promise<{ streamId: string, source: 'tab' | 'desktop' }>((resolve, reject) => {
    try {
      chrome.desktopCapture.chooseDesktopMedia(['tab', 'audio'], tab, (streamId?: string) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        if (!streamId) return reject(new Error('Tab sharing was cancelled'));
        resolve({ streamId, source: 'desktop' });
      });
    } catch (e) {
      reject(e as any);
    }
  });
}

// Keyboard shortcut (Alt+R) invokes activeTab directly
chrome.commands?.onCommand.addListener(async (command) => {
  if (command === 'toggle-recording') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.includes('meet.google.com')) return;
    const tabId = tab.id;

    await hydrateStateIfNeeded();

    if (lastKnownRecording) {
      await handleStopRecording({ type: 'STOP_RECORDING' }, () => {});
    } else {
      await handleStartRecording({ type: 'START_RECORDING', tabId }, {}, () => {});
    }
  }
});

async function clearRejoinWaitState(resumeIfAutoPaused = false) {
  await hydrateStateIfNeeded();

  if (rejoinGraceTimer) {
    clearTimeout(rejoinGraceTimer);
    rejoinGraceTimer = null;
  }
  const wasWaiting = isWaitingForRejoin;
  const shouldResume = resumeIfAutoPaused && (autoPausedForRejoin || isWaitingForRejoin);
  isWaitingForRejoin = false;
  autoPausedForRejoin = false;

  try {
    (chrome.storage as any)?.session?.set?.({
      waitingForRejoin: false,
      autoPausedForRejoin: false,
    });
  } catch {}

  if (shouldResume && lastKnownRecording && offscreenPort) {
    bglog('Meeting rejoined! Auto-resuming recording...');
    try {
      await postToOffscreen({ type: 'OFFSCREEN_RESUME' });
      lastKnownPaused = false;
    } catch (e) {
      bglog('Auto-resume on rejoin failed:', e);
    }
  }

  if (wasWaiting || shouldResume) {
    broadcastState(lastKnownRecording, { paused: lastKnownPaused, waitingForRejoin: false });
  }
}

async function enterRejoinWaitState(reason: string, graceMs = 120000) {
  await hydrateStateIfNeeded();
  if (!lastKnownRecording) return;
  if (typeof activeRecordingTabId === 'number') {
    if (closingTabIds.has(activeRecordingTabId)) {
      bglog(`Skipping rejoin wait state because tab ${activeRecordingTabId} is closing`);
      return;
    }
    try {
      await chrome.tabs.get(activeRecordingTabId);
    } catch {
      bglog(`Skipping rejoin wait state because tab ${activeRecordingTabId} no longer exists`);
      return;
    }
  }

  bglog(`Entering rejoin wait state (reason=${reason}, graceMs=${graceMs}ms)`);
  isWaitingForRejoin = true;

  // Auto-pause recording while refreshing / waiting to rejoin so dead lobby time isn't recorded
  if (!lastKnownPaused && offscreenPort) {
    autoPausedForRejoin = true;
    try {
      await postToOffscreen({ type: 'OFFSCREEN_PAUSE' });
      lastKnownPaused = true;
    } catch (e) {
      bglog('Auto-pause for rejoin failed:', e);
    }
  }

  try {
    (chrome.storage as any)?.session?.set?.({
      waitingForRejoin: true,
      autoPausedForRejoin,
    });
  } catch {}

  if (rejoinGraceTimer) {
    clearTimeout(rejoinGraceTimer);
  }
  rejoinGraceTimer = setTimeout(async () => {
    rejoinGraceTimer = null;
    await hydrateStateIfNeeded();
    if (isWaitingForRejoin && lastKnownRecording) {
      const settings = await getSettings();
      if (!settings.autoStopOnExit) {
        bglog('Rejoin grace period expired, but autoStopOnExit is disabled. Staying paused.');
        return;
      }
      bglog('Rejoin grace period expired without rejoin. Auto-finalizing recording...');
      isWaitingForRejoin = false;
      autoPausedForRejoin = false;
      try {
        if (!offscreenPort) await ensureOffscreen();
        await postToOffscreen({ type: 'OFFSCREEN_STOP' });
      } catch (e) {
        bglog('Failed to auto-stop after rejoin grace timeout:', e);
      }
    }
  }, graceMs);

  broadcastState(lastKnownRecording, { paused: lastKnownPaused, waitingForRejoin: true });
}

// Runtime message router
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 0. Offscreen save fallback via runtime.sendMessage (reliably wakes suspended MV3 service worker on tab close)
  if (msg?.type === 'OFFSCREEN_SAVE') {
    handleOffscreenSave(msg);
    sendResponse({ ok: true });
    return false;
  }

  // 1. Synchronous / Fast handlers
  if (msg?.type === 'GET_RECORDING_STATUS') {
    (async () => {
      let currentAttendance: any[] = [];
      await hydrateStateIfNeeded();

      try {
        if (offscreenPort) {
          const st = await Promise.race([
            postToOffscreen({ type: 'OFFSCREEN_STATUS' }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
          ]);
          if (st) {
            lastKnownRecording = !!st.recording;
            lastKnownPaused = !!st.paused;
            if (st.sessionId) activeRecordingSessionId = st.sessionId;
            if (st.startedAt) activeRecordingStartTime = st.startedAt;
            if (st.realStartTime) activeRecordingRealStartTime = st.realStartTime;
            if (Array.isArray(st.attendance)) currentAttendance = st.attendance;
          }
        }
      } catch (e) {
        bglog('Error in GET_RECORDING_STATUS offscreen query:', e);
      }

      sendResponse({
        recording: lastKnownRecording,
        paused: lastKnownPaused,
        waitingForRejoin: isWaitingForRejoin,
        tabId: activeRecordingTabId,
        sessionId: activeRecordingSessionId,
        meetingId: activeRecordingMeetingId,
        startedAt: activeRecordingStartTime,
        realStartTime: activeRecordingRealStartTime,
        attendance: currentAttendance,
      });
    })();
    return true;
  }

  if (msg?.type === 'MEET_MUTE_TOGGLED') {
    if (offscreenPort) {
      offscreenPort.postMessage(msg);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'MIC_SETTING_TOGGLED') {
    if (offscreenPort) {
      offscreenPort.postMessage(msg);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'CAPTION_RECORD') {
    if (offscreenPort) {
      offscreenPort.postMessage(msg);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'SYNC_ATTENDANCE') {
    if (offscreenPort && Array.isArray(msg.attendance) && msg.attendance.length > 0) {
      try {
        offscreenPort.postMessage({ type: 'OFFSCREEN_SYNC_ATTENDANCE', attendance: msg.attendance });
      } catch {}
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'PAGE_UNLOADING') {
    void (async () => {
      await hydrateStateIfNeeded();
      if (offscreenPort && Array.isArray(msg.attendance) && msg.attendance.length > 0) {
        try {
          offscreenPort.postMessage({ type: 'OFFSCREEN_SYNC_ATTENDANCE', attendance: msg.attendance });
        } catch {}
      }
      const unloadingTabId = sender.tab?.id ?? activeRecordingTabId;
      // Wait briefly to distinguish a page refresh from a tab close (beforeunload fires on both)
      await wait(120);
      if (typeof unloadingTabId === 'number') {
        if (closingTabIds.has(unloadingTabId)) return;
        try {
          await chrome.tabs.get(unloadingTabId);
        } catch {
          // Tab no longer exists (user closed the tab). Ensure recording is finalized and saved.
          const match = await checkRecordingTabMatch(unloadingTabId);
          if (match.isMatch && match.isRecording) {
            await clearRejoinWaitState(false);
            const settings = await getSettings();
            if (settings.autoStopOnExit) {
              try {
                if (!offscreenPort) await ensureOffscreen();
                await postToOffscreen({ type: 'OFFSCREEN_STOP', attendance: msg.attendance });
              } catch {}
            }
          }
          return;
        }
      }
      if (lastKnownRecording && (!unloadingTabId || unloadingTabId === activeRecordingTabId)) {
        if (msg.meetingId && typeof msg.meetingId === 'string') {
          activeRecordingMeetingId = msg.meetingId;
        }
        await enterRejoinWaitState('page_refresh', 120000);
      }
    })();
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'MEETING_LEFT_WAITING_REJOIN') {
    void (async () => {
      await hydrateStateIfNeeded();
      if (offscreenPort && Array.isArray(msg.attendance) && msg.attendance.length > 0) {
        try {
          offscreenPort.postMessage({ type: 'OFFSCREEN_SYNC_ATTENDANCE', attendance: msg.attendance });
        } catch {}
      }
      if (lastKnownRecording && (!sender.tab?.id || sender.tab.id === activeRecordingTabId)) {
        if (msg.meetingId && typeof msg.meetingId === 'string') {
          activeRecordingMeetingId = msg.meetingId;
        }
        await enterRejoinWaitState('left_meeting_screen', 90000);
      }
    })();
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'MEETING_REJOINED') {
    void (async () => {
      await hydrateStateIfNeeded();
      if (lastKnownRecording && (!sender.tab?.id || sender.tab.id === activeRecordingTabId)) {
        if (msg.meetingId && typeof msg.meetingId === 'string') {
          activeRecordingMeetingId = msg.meetingId;
        }
        await clearRejoinWaitState(true);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg?.type === 'CHECK_MIC_PERMISSION') {
    chrome.storage.local.get('micPermissionGranted', (res) => {
      sendResponse({ granted: !!res?.micPermissionGranted });
    });
    return true;
  }

  if (msg?.type === 'REQUEST_MIC_PERMISSION') {
    const setupUrl = chrome.runtime.getURL('micsetup.html');
    try {
      chrome.windows.create({
        url: setupUrl,
        type: 'popup',
        width: 440,
        height: 380,
        focused: true,
      });
    } catch {
      chrome.tabs.create({ url: setupUrl });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'MIC_PERMISSION_GRANTED') {
    chrome.storage.local.set({ micPermissionGranted: true }).catch(() => {});
    chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
      tabs.forEach((t) => {
        if (typeof t.id === 'number') {
          const tabId = t.id;
          chrome.tabs.sendMessage(tabId, { type: 'MIC_PERMISSION_GRANTED' }).catch(() => {});
        }
      });
    });
    sendResponse({ ok: true });
    return false;
  }

  // 2. Asynchronous handlers (return true to keep message port open)
  if (msg?.type === 'START_RECORDING') {
    handleStartRecording(msg, sender, sendResponse);
    return true;
  }

  if (msg?.type === 'STOP_RECORDING' || msg?.type === 'FINALIZE_RECORDING') {
    handleStopRecording(msg, sendResponse);
    return true;
  }

  if (msg?.type === 'PAUSE_RECORDING') {
    void (async () => {
      await hydrateStateIfNeeded();
      autoPausedForRejoin = false;
      if (offscreenPort && lastKnownRecording) {
        try {
          await postToOffscreen({ type: 'OFFSCREEN_PAUSE' });
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ ok: false, error: String(err) });
        }
      } else {
        sendResponse({ ok: false, error: 'Not recording' });
      }
    })();
    return true;
  }

  if (msg?.type === 'RESUME_RECORDING') {
    void (async () => {
      await hydrateStateIfNeeded();
      await clearRejoinWaitState(false);
      if (offscreenPort && lastKnownRecording) {
        try {
          await postToOffscreen({ type: 'OFFSCREEN_RESUME' });
          sendResponse({ ok: true });
        } catch (err) {
          sendResponse({ ok: false, error: String(err) });
        }
      } else {
        sendResponse({ ok: false, error: 'Not recording' });
      }
    })();
    return true;
  }

  // 3. Fallthrough: not handled by background, return false immediately so port is not held open
  return false;
});

async function handleStartRecording(msg: any, sender: chrome.runtime.MessageSender, sendResponse: (res: any) => void) {
  try {
    const targetTabId = typeof msg.tabId === 'number' ? msg.tabId : sender.tab?.id;
    if (typeof targetTabId !== 'number') {
      sendResponse({ ok: false, error: 'Target tabId not provided' });
      return;
    }

    await hydrateStateIfNeeded();

    // Guard: If we already have an active recording, reject immediately and report actual state
    if (lastKnownRecording || activeRecordingTabId !== null) {
      bglog('START_RECORDING rejected: already recording tabId', activeRecordingTabId);
      sendResponse({
        ok: false,
        error: 'Already recording',
        alreadyRecording: true,
        recording: lastKnownRecording,
        paused: lastKnownPaused,
        waitingForRejoin: isWaitingForRejoin,
        tabId: activeRecordingTabId,
        startedAt: activeRecordingStartTime,
        realStartTime: activeRecordingRealStartTime,
      });
      return;
    }

    bglog('START_RECORDING requested for tabId', targetTabId);
    try {
      await ensureOffscreen();
    } catch (e: any) {
      sendResponse({ ok: false, error: `Offscreen document setup failed: ${e?.message || e}` });
      return;
    }

    try {
      let streamId = msg.streamId as string | undefined;
      let source = (msg.source as 'tab' | 'desktop') || 'tab';

      if (!streamId) {
        const isFromInPage = typeof sender.tab?.id === 'number';
        const captureInfo = await getStreamIdForTab(targetTabId, isFromInPage);
        streamId = captureInfo.streamId;
        source = captureInfo.source;
      }

      let meetingId = 'google-meet';
      try {
        const tab = await chrome.tabs.get(targetTabId);
        if (tab.url) {
          meetingId = extractMeetingId(tab.url) || 'google-meet';
        }
      } catch {}

      // Query current Meet mute state beforehand so offscreen starts with zero audio clipping
      let initialMuted = false;
      try {
        const muteCheck = await new Promise<{ isMuted?: boolean }>((resolve) => {
          chrome.tabs.sendMessage(targetTabId, { type: 'QUERY_MUTE_STATE' }, (res) => {
            if (chrome.runtime.lastError || !res) resolve({});
            else resolve(res);
          });
          setTimeout(() => resolve({}), 250);
        });
        if (typeof muteCheck.isMuted === 'boolean') initialMuted = muteCheck.isMuted;
      } catch {}

      const settings = await getSettings();
      const r = await postToOffscreen({ type: 'OFFSCREEN_START', streamId, source, meetingId, initialMuted, settings });
      if (r?.ok) {
        activeRecordingTabId = targetTabId;
        activeRecordingSessionId = r.sessionId;
        activeRecordingMeetingId = meetingId;
        activeRecordingStartTime = Date.now();
        activeRecordingRealStartTime = activeRecordingStartTime;
        isWaitingForRejoin = false;
        autoPausedForRejoin = false;
        
        try {
          (chrome.storage as any)?.session?.set?.({
            tabId: targetTabId,
            meetingId,
            waitingForRejoin: false,
            autoPausedForRejoin: false,
          });
        } catch {}

        broadcastState(true);

        // Follow-up query in case of late UI load
        chrome.tabs.sendMessage(targetTabId, { type: 'QUERY_MUTE_STATE' }, (res) => {
          if (chrome.runtime.lastError) return;
          if (res && typeof res.isMuted === 'boolean') {
            try {
              offscreenPort?.postMessage({ type: 'MEET_MUTE_TOGGLED', isMuted: res.isMuted });
              bglog(`Queried Meet mute state on start: isMuted=${res.isMuted}`);
            } catch {}
          }
        });

        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: r?.error || 'Failed to start in offscreen' });
      }
    } catch (e: any) {
      bglog('START_RECORDING failed:', e);
      sendResponse({ ok: false, error: `START_RECORDING failed: ${e?.message || e}` });
    }
  } catch (err: any) {
    console.error('[background] Error handling START_RECORDING', err);
    sendResponse({ ok: false, error: String(err) });
  }
}

async function handleStopRecording(msg: any, sendResponse: (res: any) => void) {
  try {
    bglog('STOP_RECORDING / FINALIZE requested:', msg.type);
    await hydrateStateIfNeeded();

    if (msg.type === 'FINALIZE_RECORDING') {
      const settings = await getSettings();
      if (!settings.autoStopOnExit) {
        bglog('FINALIZE_RECORDING ignored as autoStopOnExit is false in settings');
        sendResponse({ ok: true });
        return;
      }
    }

    await clearRejoinWaitState(false);

    let attendanceData: any[] = [];
    if (typeof activeRecordingTabId === 'number') {
      const recTabId = activeRecordingTabId;
      try {
        await chrome.tabs.sendMessage(recTabId, { type: 'FLUSH_CAPTIONS' });
      } catch {}
      try {
        const attResp = await new Promise<any>((resolve) => {
          chrome.tabs.sendMessage(recTabId, { type: 'GET_ATTENDANCE' }, (res) => {
            if (chrome.runtime.lastError || !res) resolve(null);
            else resolve(res);
          });
          setTimeout(() => resolve(null), 300);
        });
        if (attResp?.attendance && Array.isArray(attResp.attendance)) {
          attendanceData = attResp.attendance;
        }
      } catch {}
      await wait(100);
    }
    if (lastKnownRecording) {
      if (!offscreenPort) {
        try { await ensureOffscreen(); } catch {}
      }
      if (offscreenPort) {
        const r = await postToOffscreen({ type: 'OFFSCREEN_STOP', attendance: attendanceData });
        bglog('OFFSCREEN_STOP response', r);
      }
    }
    sendResponse({ ok: true });
  } catch (e: any) {
    console.error('[background] Error handling STOP_RECORDING', e);
    sendResponse({ ok: false, error: `Stop failed: ${e?.message || e}` });
  }
}

// Helper to check memory state or fallback to session storage for critical tab events
async function checkRecordingTabMatch(tabId: number): Promise<{ isMatch: boolean, isRecording: boolean }> {
  let targetTabId = activeRecordingTabId;
  let isRecording = lastKnownRecording;
  if (!isRecording || targetTabId === null) {
    try {
      const stored: any = await new Promise((resolve) => {
        (chrome.storage as any)?.session?.get?.(['recording', 'tabId', 'meetingId'], (res: any) => resolve(res || {}));
      });
      if (stored?.recording) {
        isRecording = true;
        lastKnownRecording = true;
      }
      if (typeof stored?.tabId === 'number') {
        targetTabId = stored.tabId;
        activeRecordingTabId = stored.tabId;
      }
      if (stored?.meetingId && !activeRecordingMeetingId) {
        activeRecordingMeetingId = stored.meetingId;
      }
    } catch {}
  }
  return { isMatch: tabId === targetTabId, isRecording };
}

// Auto-finalize recording if user closes the active recorded Meet tab
chrome.tabs.onRemoved.addListener(async (tabId) => {
  closingTabIds.add(tabId);
  setTimeout(() => closingTabIds.delete(tabId), 10000);

  const match = await checkRecordingTabMatch(tabId);
  if (match.isMatch && match.isRecording) {
    await clearRejoinWaitState(false);
    const settings = await getSettings();
    if (!settings.autoStopOnExit) {
      bglog(`Recorded tab ${tabId} was closed, but autoStopOnExit is disabled in settings.`);
      return;
    }
    bglog(`Recorded tab ${tabId} was closed. Auto-stopping recording...`);
    try {
      if (!offscreenPort) await ensureOffscreen();
      await postToOffscreen({ type: 'OFFSCREEN_STOP' });
    } catch (e) {
      bglog('Failed to auto-stop on tab close:', e);
    }
  }
});

// Auto-finalize recording if recorded tab navigates away from the meeting, or pause & wait if refreshing same meeting
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const match = await checkRecordingTabMatch(tabId);
  if (!match.isMatch || !match.isRecording) return;

  if (changeInfo.url) {
    const isMeetDomain = changeInfo.url.includes('meet.google.com');
    const newMeetingId = extractMeetingId(changeInfo.url);

    // User left meet.google.com, OR returned to the Google Meet home/landing page,
    // OR switched to a completely different meeting code
    const leftToHomePage = isMeetDomain && !newMeetingId;
    const switchedDifferentMeeting =
      isMeetDomain &&
      !!newMeetingId &&
      !!activeRecordingMeetingId &&
      activeRecordingMeetingId !== 'google-meet' &&
      newMeetingId !== activeRecordingMeetingId;

    if (!isMeetDomain || leftToHomePage || switchedDifferentMeeting) {
      const settings = await getSettings();
      if (!settings.autoStopOnExit && isMeetDomain) {
        bglog(`Recorded tab ${tabId} navigated to ${changeInfo.url}, but autoStopOnExit is disabled.`);
        return;
      }
      bglog(`Recorded tab ${tabId} navigated away from meeting (${changeInfo.url}). Auto-stopping...`);
      await clearRejoinWaitState(false);
      try {
        if (!offscreenPort) await ensureOffscreen();
        await postToOffscreen({ type: 'OFFSCREEN_STOP' });
      } catch (e) {
        bglog('Failed to auto-stop on tab navigation:', e);
      }
      return;
    }
  }

  // If the same meeting tab is reloading, enter rejoin wait state instead of stopping
  if (changeInfo.status === 'loading') {
    const currentUrl = changeInfo.url || tab?.url;
    const currentMeetingId = extractMeetingId(currentUrl);
    if (
      currentMeetingId &&
      (!activeRecordingMeetingId || activeRecordingMeetingId === 'google-meet' || currentMeetingId === activeRecordingMeetingId)
    ) {
      if (!isWaitingForRejoin) {
        await enterRejoinWaitState('tab_loading', 120000);
      }
    }
  }
});

// Extension suspension cleanup
chrome.runtime.onSuspend?.addListener(async () => {
  try {
    if (offscreenPort) await postToOffscreen({ type: 'OFFSCREEN_STOP' });
  } catch {}
  setBadge(false);
});
