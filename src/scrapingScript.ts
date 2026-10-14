// src/scrapingScript.ts
// Production-Ready Google Meet Content Script:
// - Control bar button injection (stable ARIA selectors, native Meet geometry)
// - In-viewport persistent floating badge & live timer (full-screen feedback)
// - Google Meet Mute Sync (monitors mic button -> sends MEET_MUTE_TOGGLED)
// - Multi-tier resilient caption scraper & telemetry (persists to MeetRecorderDB via CAPTION_RECORD)
// - Auto-stop on call exit / disconnect ("You left the meeting" detection & beforeunload)
// - Offline resilience (network dropout immunity)

import type { AttendeeRecord } from './db';

// --- State Variables ---
let isRecording = false;
let recordingStartTime = 0;
let timerInterval: number | null = null;
let lastKnownMuteState: boolean | null = null;

// --- Helper Functions ---
function formatDuration(elapsedMs: number): string {
  const totalSec = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// --- Screen Wake Lock: Keeps display & Meet tab awake while recording ---
let screenWakeLock: any = null;

async function requestScreenWakeLock() {
  try {
    if ('wakeLock' in navigator && (navigator as any).wakeLock) {
      screenWakeLock = await (navigator as any).wakeLock.request('screen');
      screenWakeLock.addEventListener('release', () => {
        screenWakeLock = null;
        if (isRecording) {
          requestScreenWakeLock().catch(() => {});
        }
      });
      console.log('[MeetContentScript] Screen Wake Lock acquired (display will not sleep)');
    }
  } catch (err) {
    console.log('[MeetContentScript] Screen Wake Lock error or denied:', err);
  }
}

function releaseScreenWakeLock() {
  try {
    if (screenWakeLock) {
      screenWakeLock.release().catch(() => {});
      screenWakeLock = null;
      console.log('[MeetContentScript] Screen Wake Lock released');
    }
  } catch {}
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isRecording && !screenWakeLock) {
    requestScreenWakeLock().catch(() => {});
  }
});

// --- 1. In-Viewport Floating Badge ---
let floatingBadge: HTMLDivElement | null = null;
let floatingTimerEl: HTMLSpanElement | null = null;
let floatingLabelEl: HTMLSpanElement | null = null;
let floatingDotEl: HTMLSpanElement | null = null;

function createFloatingBadge() {
  if (document.getElementById('gmeet-rec-floating-badge')) return;

  floatingBadge = document.createElement('div');
  floatingBadge.id = 'gmeet-rec-floating-badge';
  floatingBadge.style.cssText = `
    position: fixed;
    top: 18px;
    left: 20px;
    z-index: 2147483647;
    display: none;
    align-items: center;
    gap: 8px;
    background: rgba(32, 33, 36, 0.85);
    border: 1px solid rgba(234, 67, 53, 0.6);
    color: #ffffff;
    border-radius: 24px;
    font-family: 'Google Sans', Roboto, Arial, sans-serif;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    cursor: pointer;
    user-select: none;
    
    /* Collapsed state */
    height: 32px;
    max-width: 32px;
    padding: 0 10px;
    box-sizing: border-box;
    overflow: hidden;
    white-space: nowrap;
    transition: max-width 0.4s cubic-bezier(0.25, 1, 0.5, 1), padding 0.3s ease, background-color 0.2s ease;
  `;

  // Pulsing red dot
  floatingDotEl = document.createElement('span');
  floatingDotEl.style.cssText = `
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background-color: #ea4335;
    display: inline-block;
    box-shadow: 0 0 8px #ea4335;
    animation: gmeet-rec-pulse 1.4s infinite;
    flex-shrink: 0;
  `;

  // Inject CSS animation
  if (!document.getElementById('gmeet-rec-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'gmeet-rec-styles';
    styleEl.textContent = `
      @keyframes gmeet-rec-pulse {
        0% { transform: scale(0.95); opacity: 0.8; box-shadow: 0 0 0 0 rgba(234, 67, 53, 0.7); }
        70% { transform: scale(1.15); opacity: 1; box-shadow: 0 0 0 8px rgba(234, 67, 53, 0); }
        100% { transform: scale(0.95); opacity: 0.8; box-shadow: 0 0 0 0 rgba(234, 67, 53, 0); }
      }
      @keyframes gmeet-rec-slide-in {
        from { transform: translateY(-12px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      #gmeet-rec-floating-badge:hover {
        max-width: 200px !important;
        padding: 0 14px !important;
        background: rgba(32, 33, 36, 0.98) !important;
      }
      .gmeet-rec-text-wrapper {
        display: flex;
        align-items: center;
        gap: 8px;
        opacity: 0;
        transform: translateX(-5px);
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      #gmeet-rec-floating-badge:hover .gmeet-rec-text-wrapper {
        opacity: 1;
        transform: translateX(0);
        transition-delay: 0.1s;
      }
    `;
    document.head.appendChild(styleEl);
  }

  const textWrapper = document.createElement('div');
  textWrapper.className = 'gmeet-rec-text-wrapper';

  floatingLabelEl = document.createElement('span');
  floatingLabelEl.textContent = 'REC';
  floatingLabelEl.style.cssText = 'color: #ea4335; font-weight: 700; letter-spacing: 0.5px;';

  floatingTimerEl = document.createElement('span');
  floatingTimerEl.textContent = '00:00';

  const stopHint = document.createElement('span');
  stopHint.textContent = '✕';
  stopHint.title = 'Stop recording';
  stopHint.style.cssText = 'margin-left: 6px; font-size: 11px; opacity: 0.7;';

  textWrapper.appendChild(floatingLabelEl);
  textWrapper.appendChild(floatingTimerEl);
  textWrapper.appendChild(stopHint);

  floatingBadge.appendChild(floatingDotEl);
  floatingBadge.appendChild(textWrapper);

  floatingBadge.addEventListener('click', () => {
    if (isRecording) {
      flushPendingCaptions();
      chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }).catch(() => {});
    }
  });

  document.body.appendChild(floatingBadge);
}

// --- 2. Google Meet Recording State & WakeLock Management ---
let isPaused = false;
let isWaitingForRejoin = false;
let hasJoinedCallInThisPageLoad = false;
let rejoinedNotifiedForCurrentCall = false;

function updateRecordingUI(recording: boolean, paused: boolean = false, waitingForRejoin: boolean = false) {
  isRecording = recording;
  isPaused = paused;
  isWaitingForRejoin = waitingForRejoin;
  if (waitingForRejoin || !recording) {
    rejoinedNotifiedForCurrentCall = false;
  }

  if (recording && !paused) {
    requestScreenWakeLock().catch(() => {});
  } else {
    releaseScreenWakeLock();
  }

  if (floatingBadge) {
    floatingBadge.style.display = recording ? 'flex' : 'none';
    if (paused || waitingForRejoin) {
      floatingBadge.style.opacity = '0.85';
      if (floatingLabelEl) {
        floatingLabelEl.textContent = waitingForRejoin ? 'REJOIN' : 'PAUSED';
        floatingLabelEl.style.color = '#f59e0b';
      }
      if (floatingDotEl) {
        floatingDotEl.style.backgroundColor = '#f59e0b';
        floatingDotEl.style.boxShadow = 'none';
        floatingDotEl.style.animation = 'none';
      }
      if (waitingForRejoin) {
        floatingBadge.title = 'Recording paused — Rejoin meeting to continue, or click to stop & save now';
      }
    } else {
      floatingBadge.style.opacity = '1';
      if (floatingLabelEl) {
        floatingLabelEl.textContent = 'REC';
        floatingLabelEl.style.color = '#ea4335';
      }
      if (floatingDotEl) {
        floatingDotEl.style.backgroundColor = '#ea4335';
        floatingDotEl.style.boxShadow = '0 0 8px #ea4335';
        floatingDotEl.style.animation = 'gmeet-rec-pulse 1.4s infinite';
      }
    }
  }

  if (recording) {
    if (!recordingStartTime) recordingStartTime = Date.now();
    const elapsed = Date.now() - recordingStartTime;
    if (floatingTimerEl) floatingTimerEl.textContent = formatDuration(elapsed);

    if (!paused) {
      if (!timerInterval) {
        timerInterval = window.setInterval(() => {
          const curElapsed = Date.now() - recordingStartTime;
          const formatted = formatDuration(curElapsed);
          if (floatingTimerEl) floatingTimerEl.textContent = formatted;
        }, 1000);
      }
    } else if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  } else {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    recordingStartTime = 0;
    isWaitingForRejoin = false;
  }
}

// --- 3. Google Meet Mute Sync Observer ("Hot Mic" Privacy Protection) ---
let cachedMicBtn: HTMLElement | null = null;
let micObserver: MutationObserver | null = null;

function findMeetMicButton(): HTMLElement | null {
  // If we already cached a valid, connected mic button in the DOM, use it
  if (cachedMicBtn && cachedMicBtn.isConnected) {
    return cachedMicBtn;
  }

  // Priority 1: The user's bottom-bar mic button containing the unique shortcut (Ctrl+D / ⌘+D).
  // Google Meet tooltips across ALL languages include (Ctrl+D) or (⌘+D) exclusively on the local mic button.
  // This guarantees we NEVER accidentally select a remote participant's tile or mute badge!
  const allButtons = document.querySelectorAll<HTMLElement>('button, div[role="button"]');
  for (const b of allButtons) {
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    const tooltip = (b.getAttribute('data-tooltip') || '').toLowerCase();
    const label = `${aria} ${tooltip}`;
    if ((label.includes('ctrl + d') || label.includes('ctrl+d') || label.includes('⌘ + d') || label.includes('⌘+d')) &&
        !label.includes('camera') && !label.includes('video')) {
      cachedMicBtn = b;
      return b;
    }
  }

  // Priority 2: Look specifically inside the bottom controls bar / footer container for data-is-muted
  const bottomBar = document.querySelector('footer, div[role="region"][aria-label*="control" i], [data-unhovered-bottom-bar]');
  if (bottomBar) {
    const btnsInBar = bottomBar.querySelectorAll<HTMLElement>('button[data-is-muted], [role="button"][data-is-muted]');
    for (const btn of btnsInBar) {
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (!aria.includes('camera') && !aria.includes('video') && !aria.includes('cam')) {
        cachedMicBtn = btn;
        return btn;
      }
    }
  }

  // Priority 3: Fallback button with microphone in aria-label, excluding settings, options, devices, and participants
  for (const b of allButtons) {
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    if ((aria.includes('microphone') || aria.includes('micrófono') || aria.includes('microfone') || aria.includes('mikrofon') || aria.includes('micro')) &&
        !aria.includes('setting') && !aria.includes('option') && !aria.includes('device') && !aria.includes('more') && !aria.includes('participant')) {
      cachedMicBtn = b;
      return b;
    }
  }

  return null;
}

function getMeetMuteState(): boolean {
  const micBtn = findMeetMicButton();
  if (!micBtn) {
    // CRITICAL ROOT-CAUSE FIX:
    // When Google Meet's control bar auto-hides after ~3s of mouse inactivity, micBtn may be momentarily unqueryable.
    // If we returned true (muted), the user's voice would break every time the UI idles!
    // We retain lastKnownMuteState so voice NEVER drops due to UI auto-hiding.
    if (lastKnownMuteState !== null) {
      return lastKnownMuteState;
    }
    return false; // Default to unmuted so voice is not silenced
  }

  // 1. Direct data-is-muted attribute
  const dataMuted = micBtn.getAttribute('data-is-muted') || micBtn.closest('[data-is-muted]')?.getAttribute('data-is-muted');
  if (dataMuted !== null && dataMuted !== undefined) {
    return dataMuted === 'true';
  }

  // 2. Check aria-label / tooltip
  const aria = (micBtn.getAttribute('aria-label') || '').toLowerCase();
  const tooltip = (micBtn.getAttribute('data-tooltip') || '').toLowerCase();
  const combined = `${aria} ${tooltip}`;

  // In Meet: "Turn on microphone" means it is currently MUTED.
  if (combined.includes('turn on') || combined.includes('unmute') || combined.includes('activar') ||
      combined.includes('ativar') || combined.includes('activer') || combined.includes('einschalten')) {
    return true;
  }
  // "Turn off microphone" means it is currently UNMUTED (open).
  if (combined.includes('turn off') || combined.includes('mute') || combined.includes('desactivar') ||
      combined.includes('désactiver') || combined.includes('ausschalten') || combined.includes('stumm')) {
    return false;
  }

  // If uncertain, retain last known state if available, or default to false (unmuted)
  return lastKnownMuteState !== null ? lastKnownMuteState : false;
}

function attachMicButtonObserver(btn: HTMLElement) {
  if (micObserver) {
    try { micObserver.disconnect(); } catch {}
  }
  micObserver = new MutationObserver(() => {
    checkMeetMuteState();
  });
  micObserver.observe(btn, { attributes: true, attributeFilter: ['data-is-muted', 'aria-label', 'data-tooltip'] });
}

function checkMeetMuteState(force = false) {
  const micBtn = findMeetMicButton();
  if (micBtn && (!micObserver || cachedMicBtn !== micBtn)) {
    attachMicButtonObserver(micBtn);
  }

  const isMuted = getMeetMuteState();
  if (force || lastKnownMuteState !== isMuted) {
    lastKnownMuteState = isMuted;
    chrome.runtime.sendMessage({ type: 'MEET_MUTE_TOGGLED', isMuted }).catch(() => {});
    if (floatingBadge) {
      floatingBadge.title = isMuted ? 'Meet Mic: Muted' : 'Meet Mic: Open / Recording voice';
    }
    console.log(`[MeetContentScript] Detected Google Meet mute state change: isMuted=${isMuted} (forced=${force})`);
  }
}

// --- 4. Attendance & Participant Tracking ---
const attendanceMap = new Map<string, AttendeeRecord>();

function normalizeParticipantKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\((you|presentation|guest|external|présentation|presentación|präsentation|apresentação|tu|vous|du)\)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function registerParticipant(rawName: string, idHint?: string, isHost?: boolean): void {
  if (!rawName) return;
  const cleanName = rawName.trim();
  const lower = cleanName.toLowerCase();

  // Filter out non-participant UI strings, counters, and generic button labels
  if (
    !cleanName ||
    cleanName.length < 2 ||
    lower === 'you' ||
    lower === 'presentation' ||
    lower.startsWith('presentation (') ||
    lower.startsWith('présentation (') ||
    lower.startsWith('presentación (') ||
    lower.startsWith('präsentation (') ||
    lower.startsWith('apresentação (') ||
    lower === 'everyone' ||
    lower.includes('show everyone') ||
    lower.includes('meeting details') ||
    lower.includes('turn on') ||
    lower.includes('turn off') ||
    lower.includes('more options') ||
    lower === 'host' ||
    lower === 'contributor' ||
    /^\d+$/.test(cleanName)
  ) {
    return;
  }

  // Canonical key normalization (ignores (You), (Presentation), localized suffixes, etc.)
  const canonicalKey = idHint || normalizeParticipantKey(cleanName);
  if (!canonicalKey) return;

  // Clean display name by stripping presentation suffixes
  const displayName = cleanName
    .replace(/\s*\((presentation|guest|external|présentation|presentación|präsentation|apresentação)\)\s*/gi, '')
    .trim() || cleanName;

  const now = Date.now();
  const existing = attendanceMap.get(canonicalKey);
  if (existing) {
    existing.lastSeen = now;
    existing.durationMs = Math.max(existing.durationMs, now - existing.firstSeen);
    if (isHost) existing.isHost = true;
    if (displayName.length > existing.name.length && !displayName.toLowerCase().includes('presentation')) {
      existing.name = displayName;
    }
  } else {
    attendanceMap.set(canonicalKey, {
      id: canonicalKey,
      name: displayName,
      firstSeen: now,
      lastSeen: now,
      durationMs: 0,
      spokeCount: 0,
      lastSpokeAt: null,
      isHost: !!isHost,
    });
  }
}

function registerSpeaker(speakerName: string): void {
  if (!speakerName) return;
  const trimmed = speakerName.trim();
  if (!trimmed || trimmed.toLowerCase() === 'speaker') return;

  registerParticipant(trimmed);
  const canonicalKey = normalizeParticipantKey(trimmed);

  const att = attendanceMap.get(canonicalKey);
  if (att) {
    att.spokeCount++;
    att.lastSpokeAt = Date.now();
    att.lastSeen = Date.now();
    att.durationMs = Math.max(att.durationMs, att.lastSeen - att.firstSeen);
  }
}

function scanParticipants(): void {
  try {
    // 1. Current user (self-name)
    const selfEls = document.querySelectorAll<HTMLElement>('[data-self-name]');
    for (const el of selfEls) {
      const selfName = el.getAttribute('data-self-name');
      if (selfName) registerParticipant(`${selfName} (You)`, 'self');
    }

    // 2. Video Grid Tiles
    const participantTiles = document.querySelectorAll<HTMLElement>('[data-participant-id], [data-requested-participant-id]');
    for (const tile of participantTiles) {
      const partId = tile.getAttribute('data-participant-id') || tile.getAttribute('data-requested-participant-id');
      const nameEl = tile.querySelector<HTMLElement>(
        'div.notranslate, span.XEazBc, span.zWGUib, [data-self-name], [aria-label]'
      );
      const nameText =
        nameEl?.getAttribute('data-self-name') ||
        nameEl?.getAttribute('aria-label') ||
        nameEl?.textContent ||
        tile.getAttribute('aria-label');
      if (nameText) {
        registerParticipant(nameText, partId || undefined);
      }
    }

    // 3. People / Participants List Panel (when open in Meet, including international versions)
    const listItems = document.querySelectorAll<HTMLElement>(
      'div[role="list"][aria-label*="participant" i] div[role="listitem"], ' +
      'div[role="list"][aria-label*="people" i] div[role="listitem"], ' +
      'div[role="list"][aria-label*="persona" i] div[role="listitem"], ' +
      'div[role="list"][aria-label*="teilnehmer" i] div[role="listitem"], ' +
      'div[aria-label*="Everyone" i] div[role="listitem"], ' +
      'div[role="tabpanel"] div[role="listitem"], ' +
      'aside div[role="list"] div[role="listitem"]'
    );
    for (const item of listItems) {
      const nameSpan = item.querySelector<HTMLElement>('span.zWGUib, span[aria-label], span[jsname], span');
      const nameText = nameSpan?.getAttribute('aria-label') || nameSpan?.textContent;
      if (nameText) {
        const isHost = item.textContent?.toLowerCase().includes('host') || false;
        registerParticipant(nameText, undefined, isHost);
      }
    }

    // 4. Tile name badges
    const nameBadges = document.querySelectorAll<HTMLElement>('div[data-allocation-id] span, div.poVWob');
    for (const badge of nameBadges) {
      const badgeText = badge.textContent?.trim();
      if (badgeText) registerParticipant(badgeText);
    }
  } catch (err) {
    console.warn('[MeetContentScript] scanParticipants error:', err);
  }
}

// --- 5. Resilient Multi-Tier Caption Scraper ---
interface OpenChunk {
  speaker: string;
  text: string;
  timer: number;
}

const CHUNK_GRACE_MS = 2000;
const prior = new Map<string, OpenChunk>();
const lastSeen = new Map<string, string>();

const normalize = (pre: string) =>
  pre.toLowerCase().replace(/[.,?!'"\u2019]/g, '').replace(/\s+/g, ' ').trim();

function handleCaption(speakerKey: string, speakerName: string, rawText: string) {
  if (isPaused) return; // Do not record captions while paused
  const text = rawText.trim();
  if (!text) return;

  // Track speaker activity in attendance register
  registerSpeaker(speakerName);

  const norm = normalize(text);
  const prev = lastSeen.get(speakerKey);
  if (prev === norm) return;
  lastSeen.set(speakerKey, norm);

  const existing = prior.get(speakerKey);

  if (!existing) {
    const timer = window.setTimeout(() => commit(speakerKey), CHUNK_GRACE_MS);
    prior.set(speakerKey, {
      speaker: speakerName,
      text,
      timer,
    });
    return;
  }

  existing.text = text;
  existing.speaker = speakerName;

  clearTimeout(existing.timer);
  existing.timer = window.setTimeout(() => commit(speakerKey), CHUNK_GRACE_MS);
}

function commit(key: string) {
  const entry = prior.get(key);
  if (!entry) return;

  // Relay to background/offscreen for MeetRecorderDB persistence
  chrome.runtime.sendMessage({
    type: 'CAPTION_RECORD',
    speaker: entry.speaker,
    text: entry.text,
  }).catch(() => {});

  clearTimeout(entry.timer);
  prior.delete(key);
}

function flushPendingCaptions() {
  [...prior.keys()].forEach(commit);
}

// Multi-Tier Selectors
const KNOWN_CAPTION_TEXT_CLASSES = ['.ygicle', '.nMcdL .ygicle'];
const KNOWN_SPEAKER_CLASSES = ['.NWpY1d'];
const KNOWN_CAPTION_CONTAINER_CLASSES = ['.nMcdL'];

// Track per-node MutationObservers to prevent leaks during long meetings
const captionNodeObservers: Set<MutationObserver> = new Set();

function scanCaptionNode(cl: HTMLElement) {
  let txtNode: HTMLElement | null = null;
  let speakerName = 'Speaker';

  // Tier 1: Known classes
  for (const sel of KNOWN_CAPTION_TEXT_CLASSES) {
    const found = cl.querySelector<HTMLElement>(sel);
    if (found) {
      txtNode = found;
      break;
    }
  }

  for (const sel of KNOWN_SPEAKER_CLASSES) {
    const s = cl.querySelector<HTMLElement>(sel);
    if (s?.textContent?.trim()) {
      speakerName = s.textContent.trim();
      break;
    }
  }

  // Tier 2: Semantic / Data-attribute heuristics
  if (!txtNode) {
    txtNode = cl.querySelector<HTMLElement>('[data-participant-id] + div') ||
              cl.querySelector<HTMLElement>('div[jsname]') ||
              (cl.childElementCount > 0 ? (cl.lastElementChild as HTMLElement) : null);
  }

  if (speakerName === 'Speaker') {
    const partId = cl.getAttribute('data-participant-id');
    const avatarImg = cl.querySelector<HTMLImageElement>('img[alt]');
    speakerName = avatarImg?.alt?.trim() || partId || 'Speaker';
  }

  if (!txtNode) {
    console.warn('[MeetCaptionScraper] Warning: Caption container found but text node could not be resolved.');
    return;
  }

  const key = cl.getAttribute('data-participant-id') || speakerName;

  const push = () => {
    const trimmed = txtNode?.textContent?.trim() ?? '';
    if (trimmed) handleCaption(key, speakerName, trimmed);
  };

  push();
  const obs = new MutationObserver(push);
  obs.observe(txtNode, { childList: true, subtree: true, characterData: true });
  captionNodeObservers.add(obs);
}

let captionRegionObserver: MutationObserver | null = null;

function launchCaptionRegionObserver(region: HTMLElement) {
  captionRegionObserver?.disconnect();

  // Disconnect all existing per-node observers to prevent accumulation
  captionNodeObservers.forEach((obs) => { try { obs.disconnect(); } catch {} });
  captionNodeObservers.clear();

  captionRegionObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          // Check known container or any block element inside the region
          let matched = false;
          for (const sel of KNOWN_CAPTION_CONTAINER_CLASSES) {
            if (node.matches(sel) || node.querySelector(sel)) {
              scanCaptionNode(node.matches(sel) ? node : (node.querySelector(sel) as HTMLElement));
              matched = true;
              break;
            }
          }
          if (!matched && node.childElementCount > 0) {
            scanCaptionNode(node);
          }
        }
      });
    });
  });

  captionRegionObserver.observe(region, { childList: true, subtree: true });
  console.log('[MeetCaptionScraper] Caption region observer attached successfully.');

  // Initial scan
  region.querySelectorAll<HTMLElement>('.nMcdL').forEach(scanCaptionNode);
}

// --- 5. Smart Rejoin Detection & Auto-Stop on Permanent Exit ---
function getMeetingIdFromUrl(): string {
  try {
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (!path || path === 'landing' || path === 'new' || path.startsWith('_meet')) {
      return 'google-meet';
    }
    const parts = path.split('/');
    return parts[parts.length - 1] || 'google-meet';
  } catch {
    return 'google-meet';
  }
}

function restoreAttendanceRecords(records?: AttendeeRecord[]) {
  if (!Array.isArray(records)) return;
  for (const r of records) {
    if (!r || !r.id) continue;
    const existing = attendanceMap.get(r.id);
    if (existing) {
      existing.firstSeen = Math.min(existing.firstSeen || r.firstSeen, r.firstSeen || existing.firstSeen);
      existing.lastSeen = Math.max(existing.lastSeen || r.lastSeen, r.lastSeen || existing.lastSeen);
      existing.durationMs = Math.max(existing.durationMs || 0, r.durationMs || 0, existing.lastSeen - existing.firstSeen);
      existing.spokeCount = Math.max(existing.spokeCount || 0, r.spokeCount || 0);
      existing.lastSpokeAt = Math.max(existing.lastSpokeAt || 0, r.lastSpokeAt || 0) || null;
      if (r.isHost) existing.isHost = true;
    } else {
      attendanceMap.set(r.id, { ...r });
    }
  }
}

function hasLeaveCallButton(): boolean {
  const buttons = document.querySelectorAll<HTMLElement>('button, [role="button"]');
  for (const btn of buttons) {
    const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
    const tooltip = (btn.getAttribute('data-tooltip') || '').toLowerCase();
    const label = `${aria} ${tooltip}`;
    if (
      label.includes('leave call') ||
      label.includes('salir de la llamada') ||
      label.includes("quitter l'appel") ||
      label.includes('quitter la réunion') ||
      label.includes('anruf verlassen') ||
      label.includes('sair da chamada') ||
      label.includes('abbandona la chiamata')
    ) {
      return true;
    }
    const icons = btn.querySelectorAll('i, span');
    for (const icon of icons) {
      if (icon.childElementCount === 0 && icon.textContent?.trim() === 'call_end') {
        return true;
      }
    }
  }
  return false;
}

function attachReturnHomeButtonListener(): void {
  const buttons = document.querySelectorAll<HTMLElement>('button, a, [role="button"]');
  for (const btn of buttons) {
    if (btn.dataset.gmeetRecHomeBound === 'true') continue;
    const text = (btn.textContent || '').trim().toLowerCase();
    const aria = (btn.getAttribute('aria-label') || '').trim().toLowerCase();
    if (
      text.includes('return to home screen') ||
      aria.includes('return to home screen') ||
      text.includes('volver a la pantalla de inicio') ||
      text.includes("revenir à l'écran d'accueil") ||
      text.includes('zurück zum startbildschirm') ||
      text.includes('voltar à tela inicial')
    ) {
      btn.dataset.gmeetRecHomeBound = 'true';
      btn.addEventListener('click', () => {
        if (isRecording) {
          console.log('[MeetContentScript] User clicked "Return to home screen". Finalizing recording...');
          flushPendingCaptions();
          chrome.runtime.sendMessage({ type: 'FINALIZE_RECORDING' }).catch(() => {});
          updateRecordingUI(false);
        }
      });
    }
  }
}

function checkForMeetingExit() {
  const inActiveCall = hasLeaveCallButton();

  if (inActiveCall) {
    hasJoinedCallInThisPageLoad = true;

    // If we were waiting to rejoin (after page refresh or temporary leave) and are now back inside the call:
    if (isRecording && (isWaitingForRejoin || !rejoinedNotifiedForCurrentCall)) {
      isWaitingForRejoin = false;
      rejoinedNotifiedForCurrentCall = true;
      console.log('[MeetContentScript] Active call detected after refresh/rejoin! Continuing recording...');
      chrome.runtime.sendMessage({
        type: 'MEETING_REJOINED',
        meetingId: getMeetingIdFromUrl(),
      }).catch(() => {});
      setTimeout(() => checkMeetMuteState(true), 150);
      setTimeout(() => scanParticipants(), 250);
    }
    return;
  }

  if (!isRecording) return;

  const textContent = document.body.innerText || '';

  // 1. Permanent / non-rejoinable exit phrases -> immediately finalize and save recording
  const permanentExitPhrases = [
    // English
    'You have been removed from the meeting',
    'You’ve been removed from the meeting',
    'The meeting has ended for everyone',
    'Your host ended the meeting',
    'No one responded to your request to join',
    'Your request to join was denied',
    // Spanish
    'Se ha terminado la reunión para todos',
    'El organizador ha finalizado la reunión',
    'Te han quitado de la reunión',
    'Se te ha expulsado de la reunión',
    'Nadie ha respondido a tu solicitud para unirte',
    // French
    'La réunion est terminée pour tout le monde',
    'L\'organisateur a mis fin à la réunion',
    'Vous avez été exclu de la réunion',
    'Personne n\'a répondu à votre demande de participation',
    // German
    'Die Besprechung wurde für alle beendet',
    'Der Organisator hat die Besprechung beendet',
    'Sie wurden aus der Besprechung entfernt',
    'Niemand hat auf Ihre Teilnahmebitte geantwortet',
    // Portuguese
    'A reunião terminou para todos',
    'O organizador encerrou a reunião',
    'Você foi removido da reunião',
    'Ninguém respondeu ao seu pedido de participação',
    // Italian
    'La riunione è terminata per tutti',
    'L\'organizzatore ha terminato la riunione',
    'Sei stato rimosso dalla riunione',
  ];

  for (const phrase of permanentExitPhrases) {
    if (textContent.includes(phrase)) {
      console.log(`[MeetContentScript] Detected permanent exit phrase: "${phrase}". Auto-finalizing recording...`);
      flushPendingCaptions();
      chrome.runtime.sendMessage({ type: 'FINALIZE_RECORDING' }).catch(() => {});
      updateRecordingUI(false);
      return;
    }
  }

  // 2. Recoverable leave screen ("You left the meeting" with "Rejoin" option) -> pause and wait for rejoin
  const leftPhrases = [
    'You left the meeting',
    'Has salido de la reunión',
    'Vous avez quitté la réunion',
    'Sie haben die Besprechung verlassen',
    'Você saiu da reunião',
    'Hai abbandonato la riunione',
    'Sei uscito dalla riunione',
    'Je hebt de vergadering verlaten',
  ];

  const returnHomePhrases = [
    'Return to home screen',
    'volver a la pantalla de inicio',
    'revenir à l\'écran d\'accueil',
    'zurück zum startbildschirm',
    'voltar à tela inicial',
    'torna alla schermata iniziale',
    'terug naar startscherm',
  ];

  const lowerText = textContent.toLowerCase();
  const isOnLeftScreen =
    leftPhrases.some((p) => textContent.includes(p)) ||
    (hasJoinedCallInThisPageLoad && !inActiveCall && returnHomePhrases.some((p) => lowerText.includes(p.toLowerCase())));

  if (isOnLeftScreen) {
    attachReturnHomeButtonListener();
    rejoinedNotifiedForCurrentCall = false;
    if (!isWaitingForRejoin) {
      isWaitingForRejoin = true;
      console.log('[MeetContentScript] User left the meeting (Rejoin available). Pausing and waiting for rejoin...');
      flushPendingCaptions();
      chrome.runtime.sendMessage({
        type: 'MEETING_LEFT_WAITING_REJOIN',
        meetingId: getMeetingIdFromUrl(),
        attendance: Array.from(attendanceMap.values()),
      }).catch(() => {});
    }
  }
}

// Tab refresh / unload listener:
// Do NOT immediately finalize on beforeunload so page refreshes can seamlessly continue recording when rejoined!
window.addEventListener('beforeunload', () => {
  if (isRecording) {
    flushPendingCaptions();
    chrome.runtime.sendMessage({
      type: 'PAGE_UNLOADING',
      meetingId: getMeetingIdFromUrl(),
      attendance: Array.from(attendanceMap.values()),
    }).catch(() => {});
  }
});

// Offline / Network disconnect resilience
window.addEventListener('offline', () => {
  console.warn('[MeetContentScript] Internet connection dropped. Recording will continue locally.');
  if (floatingBadge) {
    floatingBadge.style.borderColor = '#F59E0B'; // Orange for warning
    floatingBadge.title = 'Offline - Recording locally';
  }
});
window.addEventListener('online', () => {
  console.log('[MeetContentScript] Internet connection restored.');
  if (floatingBadge) {
    floatingBadge.style.borderColor = 'rgba(234, 67, 53, 0.6)'; // Restore red
    floatingBadge.title = '';
  }
});

// --- Master DOM Observer ---
let _throttleMute: number | null = null;
let _throttleExit: number | null = null;

const rootObserver = new MutationObserver((mutations) => {
  // Skip mutations caused by our own injected elements
  const allOurs = mutations.every((m) => {
    const target = m.target as Node;
    return (
      target === floatingBadge ||
      floatingBadge?.contains(target) ||
      Array.from(m.addedNodes).every((n) => n === floatingBadge)
    );
  });
  if (allOurs) return;

  // 1. Monitor mute state (throttled 300ms)
  if (!_throttleMute) {
    _throttleMute = window.setTimeout(() => {
      _throttleMute = null;
      checkMeetMuteState();
    }, 300);
  }

  // 2. Monitor caption region (Multi-Tier ARIA region supporting all languages)
  const captionRegion =
    document.querySelector<HTMLElement>('div[role="region"][aria-label*="caption" i]') ||
    document.querySelector<HTMLElement>('div[role="region"][aria-label*="subtítulo" i]') ||
    document.querySelector<HTMLElement>('div[role="region"][aria-label*="legenda" i]') ||
    document.querySelector<HTMLElement>('div[role="region"][aria-label*="untertitel" i]') ||
    document.querySelector<HTMLElement>('div[role="region"][aria-label*="sous-titre" i]') ||
    document.querySelector<HTMLElement>('div[role="region"][aria-label*="sottotitoli" i]') ||
    document.querySelector<HTMLElement>('div[role="region"][aria-label*="transcription" i]') ||
    document.querySelector<HTMLElement>('div[role="region"][aria-label*="字幕" i]');

  if (captionRegion && !captionRegion.dataset.observerAttached) {
    captionRegion.dataset.observerAttached = 'true';
    launchCaptionRegionObserver(captionRegion);
  }

  // 3. Monitor call rejoin & exit state (throttled 300ms)
  if (!_throttleExit) {
    _throttleExit = window.setTimeout(() => {
      _throttleExit = null;
      checkForMeetingExit();
    }, 300);
  }
});

// --- Mic Permission Guidance on Meet link open ---
let micBannerDismissed = false;

function showMicPermissionBanner() {
  if (micBannerDismissed || document.getElementById('gmeet-rec-mic-prompt')) return;

  const banner = document.createElement('div');
  banner.id = 'gmeet-rec-mic-prompt';
  banner.style.cssText = `
    position: fixed;
    top: 18px;
    right: 20px;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 12px;
    background: #202124;
    border: 1px solid rgba(234, 67, 53, 0.7);
    color: #ffffff;
    padding: 10px 16px;
    border-radius: 10px;
    font-family: 'Google Sans', Roboto, Arial, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    animation: gmeet-rec-slide-in 0.25s ease-out;
  `;

  banner.innerHTML = `
    <span style="font-size: 18px;">🎙️</span>
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <span style="font-weight: 600; color: #ffffff;">Record your voice</span>
      <span style="font-size: 11px; color: #9aa0a6;">Allow microphone access for Meet Recorder</span>
    </div>
    <button id="gmeet-rec-btn-allow-mic" style="
      background: #ea4335;
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
      margin-left: 4px;
    ">Allow Mic</button>
    <button id="gmeet-rec-btn-dismiss-mic" style="
      background: transparent;
      color: #9aa0a6;
      border: none;
      font-size: 16px;
      cursor: pointer;
      padding: 2px 6px;
      line-height: 1;
    " title="Dismiss">✕</button>
  `;

  document.body.appendChild(banner);

  document.getElementById('gmeet-rec-btn-allow-mic')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'REQUEST_MIC_PERMISSION' }).catch(() => {});
  });

  document.getElementById('gmeet-rec-btn-dismiss-mic')?.addEventListener('click', () => {
    micBannerDismissed = true;
    banner.remove();
  });
}

function removeMicPermissionBanner() {
  const b = document.getElementById('gmeet-rec-mic-prompt');
  if (b) {
    b.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    b.style.opacity = '0';
    b.style.transform = 'translateY(-10px)';
    setTimeout(() => b.remove(), 300);
  }
}

function checkAndPromptMicPermission() {
  const path = window.location.pathname;
  const isMeetCall = path.length > 5 && path !== '/' && !path.startsWith('/landing');
  if (!isMeetCall) return;

  chrome.runtime.sendMessage({ type: 'CHECK_MIC_PERMISSION' }, (res) => {
    if (chrome.runtime.lastError) return;
    if (!res?.granted) {
      showMicPermissionBanner();
    }
  });
}

// Init on DOM ready
function init() {
  createFloatingBadge();

  if (hasLeaveCallButton()) {
    hasJoinedCallInThisPageLoad = true;
  }

  rootObserver.observe(document.body, { childList: true, subtree: true });

  // Immediately detect mute state so we don't assume unmuted if user joins already muted
  checkMeetMuteState();

  // Prompt for microphone permission if user opened a Meet call and hasn't granted yet
  checkAndPromptMicPermission();

  // Query background for active recording state (including across page refreshes)
  try {
    chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (res) => {
      if (chrome.runtime.lastError) {
        // Prevent "Unchecked runtime.lastError" in console
        return;
      }
      if (res?.attendance) {
        restoreAttendanceRecords(res.attendance);
      }
      if (res?.recording) {
        if (res.startedAt) recordingStartTime = res.startedAt;
        updateRecordingUI(true, !!res.paused, !!res.waitingForRejoin);
        // Check if we already rejoined the active call on this page load
        checkForMeetingExit();
      }
    });
  } catch {}

  // User action listeners to immediately detect mute toggles and call join/rejoin clicks
  document.addEventListener('click', () => {
    setTimeout(() => checkMeetMuteState(), 80);
    setTimeout(() => scanParticipants(), 150);
    setTimeout(() => checkForMeetingExit(), 250);
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      setTimeout(() => checkMeetMuteState(), 80);
    }
  });

  // Initial and periodic scan for participant attendance and rejoin state
  scanParticipants();
  let syncTick = 0;
  setInterval(() => {
    scanParticipants();
    checkForMeetingExit();
    syncTick++;
    // Periodically sync attendance to offscreen/IndexedDB every ~10 seconds during recording
    if (isRecording && attendanceMap.size > 0 && syncTick % 4 === 0) {
      chrome.runtime.sendMessage({
        type: 'SYNC_ATTENDANCE',
        attendance: Array.from(attendanceMap.values()),
      }).catch(() => {});
    }
  }, 2500);

  console.log('[MeetContentScript] Content script initialized.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Runtime messaging listener
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'RECORDING_STATE') {
    if (msg.startedAt) recordingStartTime = msg.startedAt;
    updateRecordingUI(!!msg.recording, !!msg.paused, !!msg.waitingForRejoin);
    if (msg.recording) {
      if (hasLeaveCallButton()) {
        hasJoinedCallInThisPageLoad = true;
      }
      // Force sync mute state to background and offscreen on recording start
      setTimeout(() => checkMeetMuteState(true), 100);
      scanParticipants();
      checkForMeetingExit();
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'QUERY_MUTE_STATE') {
    const isMuted = getMeetMuteState();
    sendResponse({ ok: true, isMuted });
    return false;
  }

  if (msg?.type === 'MIC_PERMISSION_GRANTED') {
    removeMicPermissionBanner();
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'FLUSH_CAPTIONS') {
    flushPendingCaptions();
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'RESET_TRANSCRIPT') {
    prior.clear();
    lastSeen.clear();
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'GET_ATTENDANCE') {
    scanParticipants();
    const meetingId = getMeetingIdFromUrl();
    sendResponse({
      ok: true,
      attendance: Array.from(attendanceMap.values()),
      meetingId,
      timestamp: Date.now(),
    });
    return false;
  }

  return false;
});

