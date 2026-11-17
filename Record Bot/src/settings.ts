// src/settings.ts
// Configuration schema and storage manager for Meet Recorder extension.

export interface ExtensionSettings {
  saveVideo: boolean;
  saveTxtTranscript: boolean;
  saveVttSubtitles: boolean;
  saveAttendance: boolean;
  videoQuality: '1080p' | '720p' | 'max';
  autoMixMic: boolean;
  noiseSuppression: boolean;
  autoStopOnExit: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  saveVideo: true,
  saveTxtTranscript: true,
  saveVttSubtitles: true,
  saveAttendance: false, // Off by default to avoid unexpected extra file downloads
  videoQuality: '1080p',
  autoMixMic: true,
  noiseSuppression: true,
  autoStopOnExit: true,
};

const STORAGE_KEY = 'meet_recorder_settings';

function readLocalStorageFallback(): Partial<ExtensionSettings> | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return null;
}

function writeLocalStorageCache(settings: ExtensionSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {}
}

export async function getSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    const fallbackTimer = setTimeout(() => {
      resolve({ ...DEFAULT_SETTINGS, ...(readLocalStorageFallback() || {}) });
    }, 3000);

    const resolveWith = (data: any) => {
      clearTimeout(fallbackTimer);
      const merged: ExtensionSettings = {
        ...DEFAULT_SETTINGS,
        ...(readLocalStorageFallback() || {}),
        ...(data || {}),
      };
      if (data) writeLocalStorageCache(merged);
      resolve(merged);
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.sync?.get) {
        chrome.storage.sync.get(STORAGE_KEY, (res) => {
          if (chrome.runtime.lastError || !res?.[STORAGE_KEY]) {
            if (chrome.storage?.local?.get) {
              chrome.storage.local.get(STORAGE_KEY, (localRes) => {
                resolveWith(chrome.runtime.lastError ? null : localRes?.[STORAGE_KEY]);
              });
            } else {
              resolveWith(null);
            }
          } else {
            resolveWith(res[STORAGE_KEY]);
          }
        });
      } else if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
        chrome.storage.local.get(STORAGE_KEY, (localRes) => {
          resolveWith(chrome.runtime.lastError ? null : localRes?.[STORAGE_KEY]);
        });
      } else {
        resolveWith(null);
      }
    } catch {
      resolveWith(null);
    }
  });
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  writeLocalStorageCache(settings);
  return new Promise((resolve) => {
    try {
      chrome.storage?.sync?.set({ [STORAGE_KEY]: settings }, () => {
        chrome.storage?.local?.set({ [STORAGE_KEY]: settings }, () => {
          resolve();
        });
      });
    } catch {
      resolve();
    }
  });
}

