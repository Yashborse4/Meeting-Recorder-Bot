/**
 * MeetRecord Pro - Dashboard Web App Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // State
  let timetableData = [];
  let currentDayFilter = 'all';
  let isEditingId = null;

  // DOM Elements
  const timetableGrid = document.getElementById('timetable-grid');
  const classModal = document.getElementById('class-modal');
  const classForm = document.getElementById('class-form');
  const btnOpenAddModal = document.getElementById('btn-open-add-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const modalTitle = document.getElementById('modal-title');
  const toastContainer = document.getElementById('toast-container');

  // Metrics Elements
  const nextClassTitle = document.getElementById('next-class-title');
  const nextClassCountdown = document.getElementById('next-class-countdown');
  const nextClassMeta = document.getElementById('next-class-meta');
  const nextClassLinkWrapper = document.getElementById('next-class-link-wrapper');
  const nextClassLink = document.getElementById('next-class-link');
  const statTotalClasses = document.getElementById('stat-total-classes');
  const statActiveClasses = document.getElementById('stat-active-classes');
  const statTotalRecordings = document.getElementById('stat-total-recordings');

  // Scheduler Status Pill
  const schedulerPill = document.getElementById('scheduler-pill');
  const schedulerStatusText = document.getElementById('scheduler-status-text');
  const btnToggleScheduler = document.getElementById('btn-toggle-scheduler');
  const toggleSchedulerLabel = document.getElementById('toggle-scheduler-label');

  // Live Recording Banner
  const liveRecordingBanner = document.getElementById('live-recording-banner');
  const liveSessionName = document.getElementById('live-session-name');
  const liveSessionTimer = document.getElementById('live-session-timer');
  const btnStopLiveRec = document.getElementById('btn-stop-live-rec');

  // Instant Record
  const instantForm = document.getElementById('instant-record-form');
  const btnStartInstant = document.getElementById('btn-start-instant');

  // Recordings Library
  const recordingsList = document.getElementById('recordings-list');
  const btnRefreshRecordings = document.getElementById('btn-refresh-recordings');

  // -------------------------------------------------------------
  // TOAST NOTIFICATIONS
  // -------------------------------------------------------------
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        ${type === 'success' ? '<polyline points="20 6 9 17 4 12"/>' : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'}
      </svg>
      <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  // -------------------------------------------------------------
  // TABS NAVIGATION
  // -------------------------------------------------------------
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = `tab-${btn.dataset.tab}`;
      document.getElementById(targetId)?.classList.add('active');

      if (btn.dataset.tab === 'recordings') fetchRecordings();
    });
  });

  // -------------------------------------------------------------
  // STATUS & METRICS POLLING
  // -------------------------------------------------------------
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      // Scheduler daemon state
      if (data.daemonRunning) {
        schedulerPill.className = 'status-pill active';
        schedulerStatusText.textContent = 'Scheduler Running';
        toggleSchedulerLabel.textContent = 'Pause Daemon';
      } else {
        schedulerPill.className = 'status-pill paused';
        schedulerStatusText.textContent = 'Daemon Paused';
        toggleSchedulerLabel.textContent = 'Resume Daemon';
      }

      // Next Upcoming Class
      if (data.nextClass) {
        nextClassTitle.textContent = data.nextClass.name;
        const hrs = Math.floor(data.nextClass.diffMinutes / 60);
        const mins = data.nextClass.diffMinutes % 60;
        nextClassCountdown.textContent = hrs > 0 ? `In ${hrs}h ${mins}m` : `In ${mins}m`;
        nextClassMeta.textContent = `${data.nextClass.day} at ${formatTime12Plain(data.nextClass.time12 || data.nextClass.time)} (${data.nextClass.duration} mins)`;

        if (data.nextClass.link) {
          nextClassLink.href = data.nextClass.link;
          nextClassLinkWrapper.style.display = 'block';
        }
      } else {
        nextClassTitle.textContent = 'No upcoming classes';
        nextClassCountdown.textContent = 'Idle';
        nextClassMeta.textContent = 'Add a class to the weekly timetable';
        nextClassLinkWrapper.style.display = 'none';
      }

      // Live Recording Banner
      if (data.activeRecording) {
        liveRecordingBanner.style.display = 'block';
        liveSessionName.textContent = data.activeRecording.name || 'Live Meeting';
        liveSessionTimer.textContent = data.activeRecording.elapsedStr || 'Recording...';

        const liveBadgeStatus = document.getElementById('live-badge-status');
        const liveSessionStatus = document.getElementById('live-session-status');

        if (data.activeRecording.status) {
          const isWaitingHost = /waiting for host|asking to join/i.test(data.activeRecording.status);
          const isRetry = /rejoin|retry|fail|attempt/i.test(data.activeRecording.status);

          if (liveBadgeStatus) {
            if (isWaitingHost) {
              liveBadgeStatus.textContent = 'WAITING FOR HOST TO LET YOU IN';
            } else if (isRetry) {
              liveBadgeStatus.textContent = data.activeRecording.status.toUpperCase();
            } else {
              liveBadgeStatus.textContent = 'RECORDING LIVE';
            }
          }
          if (liveSessionStatus) {
            liveSessionStatus.textContent = data.activeRecording.status;
            liveSessionStatus.style.display = 'inline-block';
            if (isWaitingHost) {
              liveSessionStatus.className = 'live-status-tag waiting-host';
            } else if (isRetry) {
              liveSessionStatus.className = 'live-status-tag retry';
            } else {
              liveSessionStatus.className = 'live-status-tag';
            }
          }
        } else {
          if (liveBadgeStatus) liveBadgeStatus.textContent = 'RECORDING LIVE';
          if (liveSessionStatus) liveSessionStatus.style.display = 'none';
        }
      } else {
        liveRecordingBanner.style.display = 'none';
      }
    } catch {}
  }

  // Toggle scheduler button
  btnToggleScheduler.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/scheduler/toggle', { method: 'POST' });
      const data = await res.json();
      showToast(data.daemonRunning ? 'Scheduler daemon started' : 'Scheduler daemon paused');
      fetchStatus();
    } catch (e) {
      showToast('Failed to toggle daemon', 'error');
    }
  });

  // Stop live recording button
  btnStopLiveRec.addEventListener('click', async () => {
    btnStopLiveRec.disabled = true;
    btnStopLiveRec.textContent = 'Finalizing...';
    try {
      const res = await fetch('/api/record/stop', { method: 'POST' });
      const data = await res.json();
      showToast('Recording finalized and saved!');
      fetchStatus();
      fetchRecordings();
    } catch (e) {
      showToast('Error stopping recording', 'error');
    } finally {
      btnStopLiveRec.disabled = false;
      btnStopLiveRec.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
        Stop & Save
      `;
    }
  });

  // -------------------------------------------------------------
  // TIMETABLE RENDERING & MANAGEMENT
  // -------------------------------------------------------------
  async function fetchTimetable() {
    try {
      const res = await fetch('/api/timetable');
      timetableData = await res.json();

      statTotalClasses.textContent = timetableData.length;
      statActiveClasses.textContent = `${timetableData.filter((c) => c.enabled).length} active classes`;

      renderTimetable();
      updateSubjectDatalist();
    } catch (e) {
      console.error('Error fetching timetable:', e);
    }
  }

  function formatTime12(timeStr) {
    if (!timeStr) return '--:--';
    if (typeof timeStr === 'string' && /am|pm/i.test(timeStr)) {
      return timeStr.includes('IST') ? timeStr : `${timeStr} <span class="tz-badge">IST</span>`;
    }
    const [hStr, mStr] = String(timeStr).split(':');
    let h = parseInt(hStr, 10);
    const m = mStr ? mStr.padStart(2, '0') : '00';
    if (isNaN(h)) return timeStr;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${m} ${ampm} <span class="tz-badge">IST</span>`;
  }

  function formatTime12Plain(timeStr) {
    if (!timeStr) return '--:--';
    if (typeof timeStr === 'string' && /am|pm/i.test(timeStr)) {
      return timeStr.includes('IST') ? timeStr : `${timeStr} IST`;
    }
    const [hStr, mStr] = String(timeStr).split(':');
    let h = parseInt(hStr, 10);
    const m = mStr ? mStr.padStart(2, '0') : '00';
    if (isNaN(h)) return timeStr;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${m} ${ampm} IST`;
  }

  function renderTimetable() {
    const daysOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    const filtered = timetableData.filter((item) => {
      if (currentDayFilter === 'all') return true;
      const days = (Array.isArray(item.days) ? item.days : [item.days]).map((d) => d.toLowerCase());
      return days.includes(currentDayFilter) || days.includes('all') || days.includes('*');
    });

    if (filtered.length === 0) {
      timetableGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📅</div>
          <h3>No classes found for this filter</h3>
          <p>Click "Add New Class" above to schedule a Google Meet recording.</p>
        </div>
      `;
      return;
    }

    timetableGrid.innerHTML = filtered.map((item) => {
      const itemDays = (Array.isArray(item.days) ? item.days : [item.days]).map((d) => d.toLowerCase());
      const isAll = itemDays.includes('all') || itemDays.includes('*');

      const dayTags = daysOrder.map((day) => {
        const isActive = isAll || itemDays.includes(day);
        return `<span class="day-tag ${isActive ? 'active' : ''}">${day}</span>`;
      }).join('');

      return `
        <div class="class-card ${!item.enabled ? 'disabled' : ''}">
          <div>
            <div class="class-card-header">
              <div class="class-title-group">
                <h4 class="class-card-title">${escapeHtml(item.name)}</h4>
                <button class="btn-card-duplicate" onclick="duplicateClass('${item.id}')" title="Schedule another day or time for this subject">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  + Add Day/Time
                </button>
                <button class="btn-card-edit-quick" onclick="editClass('${item.id}')" title="Edit this class configuration">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit
                </button>
              </div>
              <label class="switch-control" title="Toggle active status">
                <input type="checkbox" ${item.enabled ? 'checked' : ''} onchange="toggleActiveClass('${item.id}')">
                <span class="switch-slider"></span>
              </label>
            </div>

            <div class="class-card-time">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>${formatTime12(item.time12 || item.time)}</span>
              <span class="class-duration-badge">(${item.duration || 60} mins)</span>
            </div>

            <div class="class-days-list">
              ${dayTags}
            </div>

            <div class="class-card-link">
              <span class="link-text" title="${escapeHtml(item.link)}">${escapeHtml(item.link)}</span>
              <div class="link-actions">
                <button class="btn-icon" onclick="copyLink('${escapeHtml(item.link)}')" title="Copy link">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <a href="${escapeHtml(item.link)}" target="_blank" class="btn-icon" title="Open Meet in new tab">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                </a>
              </div>
            </div>
          </div>

          <div class="class-card-actions">
            <button class="btn-card-edit-prominent" onclick="editClass('${item.id}')" title="Edit class settings, link and time">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Class
            </button>
            <div style="display: flex; gap: 8px;">
              <button class="btn-card-record" onclick="triggerImmediate('${escapeHtml(item.link)}', ${item.duration || 60}, '${escapeHtml(item.name)}')" title="Launch and record this class now">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Record Now
              </button>
              <button class="btn-danger btn-sm" onclick="deleteClass('${item.id}')" title="Delete class">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Day filter buttons
  document.querySelectorAll('.day-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.day-filter').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentDayFilter = btn.dataset.day;
      renderTimetable();
    });
  });

  // -------------------------------------------------------------
  // LIVE IST CLOCK (TICKER)
  // -------------------------------------------------------------
  const liveIstClock = document.getElementById('live-ist-clock');
  function updateLiveISTClock() {
    if (!liveIstClock) return;
    try {
      const now = new Date();
      const str = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(now);
      liveIstClock.textContent = `${str.toUpperCase()} IST`;
    } catch {}
  }
  setInterval(updateLiveISTClock, 1000);
  updateLiveISTClock();

  // -------------------------------------------------------------
  // MULTI-SLOT SCHEDULE & SUBJECT AUTO-COMPLETE BUILDER
  // -------------------------------------------------------------
  let currentModalSlots = [];
  let deletedSlotIds = [];

  const slotsContainer = document.getElementById('schedule-slots-container');
  const btnAddScheduleSlot = document.getElementById('btn-add-schedule-slot');
  const btnAddScheduleSlotBottom = document.getElementById('btn-add-schedule-slot-bottom');
  const classNameInput = document.getElementById('class-name');
  const classLinkInput = document.getElementById('class-link');
  const existingSubjectsDatalist = document.getElementById('existing-subjects-list');

  function parseTimeToParts(timeStr) {
    let h = 9;
    let m = 0;
    let ampm = 'AM';

    if (timeStr) {
      const cleaned = String(timeStr).trim().replace(/\s+(IST|GMT|UTC[+-]?\d*)$/i, '');
      const match = cleaned.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
      if (match) {
        let [_, hStr, mStr, rawAmpm] = match;
        let rawH = parseInt(hStr, 10);
        m = parseInt(mStr, 10) || 0;
        if (rawAmpm) {
          ampm = rawAmpm.toUpperCase();
          h = rawH % 12 || 12;
        } else {
          ampm = rawH >= 12 ? 'PM' : 'AM';
          h = rawH % 12 || 12;
        }
      }
    }
    return {
      hour: String(h).padStart(2, '0'),
      minute: String(m).padStart(2, '0'),
      ampm: ampm,
    };
  }

  function createDefaultSlot(days = ['mon', 'wed', 'fri'], timeStr = '09:00 AM', duration = 60, id = '') {
    const parts = parseTimeToParts(timeStr);
    return {
      id: id || '',
      days: Array.isArray(days) ? [...days] : [String(days)],
      hour: parts.hour,
      minute: parts.minute,
      ampm: parts.ampm,
      duration: parseInt(duration, 10) || 60,
    };
  }

  function getSlotTime12(slot) {
    return `${slot.hour}:${slot.minute} ${slot.ampm} IST`;
  }

  function getSlotDaysSummary(days) {
    if (!days || days.length === 0) return 'No days selected';
    if (days.length === 7) return 'Everyday (Mon - Sun)';
    const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const sorted = [...days].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
    return sorted.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
  }

  function updateSubjectDatalist() {
    if (!existingSubjectsDatalist) return;
    const subjectMap = new Map();
    timetableData.forEach((item) => {
      if (item.name && item.name.trim()) {
        const key = item.name.trim().toLowerCase();
        if (!subjectMap.has(key)) {
          subjectMap.set(key, { name: item.name.trim(), link: item.link || '' });
        }
      }
    });

    existingSubjectsDatalist.innerHTML = Array.from(subjectMap.values())
      .map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.link ? s.link : '')}</option>`)
      .join('');
  }

  // Auto-fill Google Meet URL when user selects or types an existing subject
  classNameInput?.addEventListener('input', () => {
    const val = (classNameInput.value || '').trim().toLowerCase();
    if (!val) return;
    const match = timetableData.find((c) => (c.name || '').trim().toLowerCase() === val);
    if (match && match.link && (!classLinkInput.value || classLinkInput.value === '')) {
      classLinkInput.value = match.link;
    }
  });

  function renderModalSlots() {
    if (!slotsContainer) return;
    if (currentModalSlots.length === 0) {
      currentModalSlots = [createDefaultSlot()];
    }

    const daysList = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const hoursList = ['12', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'];
    const minutesList = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

    slotsContainer.innerHTML = currentModalSlots.map((slot, idx) => {
      const time12Str = getSlotTime12(slot);
      const daysSummary = getSlotDaysSummary(slot.days);

      const dayPillsHtml = daysList.map((d) => {
        const isChecked = slot.days.includes(d);
        const label = d.charAt(0).toUpperCase() + d.slice(1);
        return `
          <label class="day-pill">
            <input type="checkbox" name="slot_${idx}_day" value="${d}" ${isChecked ? 'checked' : ''} onchange="toggleSlotDay(${idx}, '${d}')">
            <span>${label}</span>
          </label>
        `;
      }).join('');

      return `
        <div class="slot-card" data-slot-index="${idx}">
          <div class="slot-header">
            <div class="slot-badge">
              <span class="slot-number">Schedule Slot #${idx + 1}</span>
              <span class="slot-summary-pill">${time12Str} (${daysSummary})</span>
            </div>
            ${currentModalSlots.length > 1 ? `
              <button type="button" class="btn-slot-remove" onclick="removeSlot(${idx})" title="Remove this schedule slot">
                ✕ Remove Slot
              </button>
            ` : ''}
          </div>

          <div class="slot-body">
            <div class="slot-days-row">
              <div class="label-with-presets">
                <label class="slot-label">Select Days (Mon - Sun)</label>
                <div class="day-presets">
                  <button type="button" class="btn-preset" onclick="applySlotPreset(${idx}, 'weekdays')">Weekdays</button>
                  <button type="button" class="btn-preset" onclick="applySlotPreset(${idx}, 'mwf')">Mon, Wed, Fri</button>
                  <button type="button" class="btn-preset" onclick="applySlotPreset(${idx}, 'tts')">Tue, Thu, Sat</button>
                  <button type="button" class="btn-preset" onclick="applySlotPreset(${idx}, 'all')">Everyday</button>
                </div>
              </div>
              <div class="day-checkbox-pills">
                ${dayPillsHtml}
              </div>
            </div>

            <div class="time-picker-section" style="margin-top: 14px;">
              <div class="time-header-row">
                <label class="slot-label">Class Timing & Duration</label>
                <span class="tz-badge-pill">🇮🇳 IST (UTC+5:30)</span>
              </div>

              <div class="time-picker-grid">
                <!-- Hour -->
                <div class="time-col">
                  <label class="time-sublabel">Hour (1-12)</label>
                  <select class="select-styled" onchange="updateSlotTime(${idx}, 'hour', this.value)">
                    ${hoursList.map((h) => `<option value="${h}" ${slot.hour === h ? 'selected' : ''}>${h}</option>`).join('')}
                  </select>
                </div>

                <div class="time-separator">:</div>

                <!-- Minute -->
                <div class="time-col">
                  <label class="time-sublabel">Minute</label>
                  <select class="select-styled" onchange="updateSlotTime(${idx}, 'minute', this.value)">
                    ${minutesList.map((m) => `<option value="${m}" ${slot.minute === m ? 'selected' : ''}>${m}</option>`).join('')}
                  </select>
                </div>

                <!-- AM / PM -->
                <div class="time-col ampm-col">
                  <label class="time-sublabel">AM / PM</label>
                  <div class="ampm-toggle-group">
                    <button type="button" class="btn-ampm ${slot.ampm === 'AM' ? 'active' : ''}" onclick="setSlotAmpm(${idx}, 'AM')">AM</button>
                    <button type="button" class="btn-ampm ${slot.ampm === 'PM' ? 'active' : ''}" onclick="setSlotAmpm(${idx}, 'PM')">PM</button>
                  </div>
                </div>

                <!-- Duration -->
                <div class="time-col duration-col">
                  <label class="time-sublabel">Duration</label>
                  <div class="input-with-unit">
                    <input type="number" class="select-styled" value="${slot.duration || 60}" min="5" max="360" onchange="updateSlotTime(${idx}, 'duration', this.value)" required>
                    <span class="unit-text">mins</span>
                  </div>
                </div>
              </div>

              <div class="time-preview-banner">
                <span class="preview-label">Timing:</span>
                <strong class="preview-value">${time12Str}</strong>
                <span class="preview-hint">(${daysSummary} • ${slot.duration || 60} mins)</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  window.toggleSlotDay = function (slotIdx, day) {
    if (!currentModalSlots[slotIdx]) return;
    const days = currentModalSlots[slotIdx].days;
    const pos = days.indexOf(day);
    if (pos >= 0) {
      if (days.length > 1) days.splice(pos, 1);
      else showToast('At least one day must be selected for this slot', 'error');
    } else {
      days.push(day);
    }
    renderModalSlots();
  };

  window.applySlotPreset = function (slotIdx, preset) {
    if (!currentModalSlots[slotIdx]) return;
    if (preset === 'weekdays') currentModalSlots[slotIdx].days = ['mon', 'tue', 'wed', 'thu', 'fri'];
    else if (preset === 'mwf') currentModalSlots[slotIdx].days = ['mon', 'wed', 'fri'];
    else if (preset === 'tts') currentModalSlots[slotIdx].days = ['tue', 'thu', 'sat'];
    else if (preset === 'all') currentModalSlots[slotIdx].days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    else if (preset === 'weekends') currentModalSlots[slotIdx].days = ['sat', 'sun'];
    renderModalSlots();
  };

  window.updateSlotTime = function (slotIdx, field, val) {
    if (!currentModalSlots[slotIdx]) return;
    if (field === 'duration') {
      currentModalSlots[slotIdx].duration = parseInt(val, 10) || 60;
    } else {
      currentModalSlots[slotIdx][field] = val;
    }
    renderModalSlots();
  };

  window.setSlotAmpm = function (slotIdx, ampm) {
    if (!currentModalSlots[slotIdx]) return;
    currentModalSlots[slotIdx].ampm = ampm;
    renderModalSlots();
  };

  window.removeSlot = function (slotIdx) {
    if (currentModalSlots.length <= 1) {
      showToast('You must have at least one schedule slot.', 'error');
      return;
    }
    const removed = currentModalSlots[slotIdx];
    if (removed && removed.id) {
      deletedSlotIds.push(removed.id);
    }
    currentModalSlots.splice(slotIdx, 1);
    renderModalSlots();
  };

  function addScheduleSlot() {
    let nextDays = ['mon', 'wed', 'fri'];
    let nextTimeStr = '02:00 PM';
    if (currentModalSlots.length > 0) {
      const last = currentModalSlots[currentModalSlots.length - 1];
      if (last.days.includes('mon') && !last.days.includes('tue')) {
        nextDays = ['tue', 'thu'];
      } else if (last.days.includes('sat')) {
        nextDays = ['sun'];
      }
      nextTimeStr = last.ampm === 'AM' ? '02:00 PM' : '10:00 AM';
    }
    currentModalSlots.push(createDefaultSlot(nextDays, nextTimeStr, 60));
    renderModalSlots();

    setTimeout(() => {
      const allSlots = document.querySelectorAll('.slot-card');
      const lastEl = allSlots[allSlots.length - 1];
      if (lastEl) lastEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  btnAddScheduleSlot?.addEventListener('click', addScheduleSlot);
  btnAddScheduleSlotBottom?.addEventListener('click', addScheduleSlot);

  // Modal open/close
  btnOpenAddModal.addEventListener('click', () => {
    isEditingId = null;
    deletedSlotIds = [];
    modalTitle.textContent = 'Add Scheduled Class';
    const subtitleEl = document.getElementById('modal-subtitle');
    if (subtitleEl) subtitleEl.textContent = 'Configure subject timing, Meet link, and weekly schedule slots';
    const btnSaveText = document.getElementById('btn-save-class-text');
    if (btnSaveText) btnSaveText.textContent = 'Save Schedule';

    classForm.reset();
    document.getElementById('class-id').value = '';
    document.getElementById('class-enabled').checked = true;

    currentModalSlots = [createDefaultSlot(['mon', 'tue', 'wed', 'thu', 'fri'], '09:00 AM', 60)];
    renderModalSlots();

    classModal.style.display = 'flex';
    const modalWin = document.querySelector('.modal-window');
    if (modalWin) modalWin.scrollTop = 0;
  });

  const closeModal = () => (classModal.style.display = 'none');
  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);
  classModal.addEventListener('click', (e) => {
    if (e.target === classModal) closeModal();
  });

  // Save / Update Class Form (with Multi-Slot Support)
  classForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const subjectName = document.getElementById('class-name').value.trim();
    const meetLink = document.getElementById('class-link').value.trim();
    const enabled = document.getElementById('class-enabled').checked;

    if (!subjectName) {
      showToast('Please enter a subject / class name.', 'error');
      return;
    }
    if (!meetLink || !meetLink.includes('meet.google.com')) {
      showToast('Please enter a valid Google Meet link.', 'error');
      return;
    }

    if (currentModalSlots.length === 0) {
      showToast('Please add at least one schedule slot.', 'error');
      return;
    }

    for (let i = 0; i < currentModalSlots.length; i++) {
      const slot = currentModalSlots[i];
      if (!slot.days || slot.days.length === 0) {
        showToast(`Please select at least one day for Slot #${i + 1}`, 'error');
        return;
      }
    }

    const payloadSlots = currentModalSlots.map((slot) => {
      let h = parseInt(slot.hour, 10);
      if (slot.ampm === 'PM' && h < 12) h += 12;
      if (slot.ampm === 'AM' && h === 12) h = 0;
      const time24 = `${String(h).padStart(2, '0')}:${slot.minute}`;
      return {
        id: slot.id || undefined,
        days: slot.days,
        time: time24,
        duration: parseInt(slot.duration || 60, 10),
      };
    });

    const payload = {
      name: subjectName,
      link: meetLink,
      enabled,
      slots: payloadSlots,
      deletedSlotIds,
    };

    try {
      const res = await fetch('/api/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      showToast(`Schedule for "${subjectName}" saved (${payloadSlots.length} slot${payloadSlots.length > 1 ? 's' : ''})!`);
      closeModal();
      fetchTimetable();
      fetchStatus();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Global window functions for card actions
  window.toggleActiveClass = async function (id) {
    try {
      const res = await fetch(`/api/timetable/${id}/toggle`, { method: 'PATCH' });
      const data = await res.json();
      if (data.ok) {
        showToast(`"${data.class.name}" ${data.class.enabled ? 'enabled' : 'disabled'}`);
        fetchTimetable();
        fetchStatus();
      }
    } catch {}
  };

  window.deleteClass = async function (id) {
    if (!confirm('Are you sure you want to delete this scheduled class?')) return;
    try {
      const res = await fetch(`/api/timetable/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        showToast('Class deleted');
        fetchTimetable();
        fetchStatus();
      }
    } catch {}
  };

  window.duplicateClass = function (id) {
    const item = timetableData.find((c) => c.id === id);
    if (!item) return;

    isEditingId = null;
    deletedSlotIds = [];
    modalTitle.textContent = `Add Schedule for "${item.name}"`;
    const subtitleEl = document.getElementById('modal-subtitle');
    if (subtitleEl) subtitleEl.textContent = `Quickly add another day or time for this subject`;
    const btnSaveText = document.getElementById('btn-save-class-text');
    if (btnSaveText) btnSaveText.textContent = 'Add to Timetable';

    document.getElementById('class-id').value = '';
    document.getElementById('class-name').value = item.name || '';
    document.getElementById('class-link').value = item.link || '';
    document.getElementById('class-enabled').checked = item.enabled !== false;

    let nextDays = ['mon', 'wed', 'fri'];
    const itemDays = (Array.isArray(item.days) ? item.days : [item.days]).map((d) => String(d).toLowerCase().slice(0, 3));
    if (itemDays.includes('mon') && !itemDays.includes('tue')) {
      nextDays = ['tue', 'thu'];
    } else if (itemDays.includes('sat')) {
      nextDays = ['sun'];
    }

    currentModalSlots = [createDefaultSlot(nextDays, item.time12 || item.time || '11:00 AM', item.duration || 60, '')];
    renderModalSlots();

    classModal.style.display = 'flex';
    const modalWin = document.querySelector('.modal-window');
    if (modalWin) modalWin.scrollTop = 0;
  };

  window.editClass = function (id) {
    const item = timetableData.find((c) => c.id === id);
    if (!item) return;

    isEditingId = id;
    deletedSlotIds = [];
    modalTitle.textContent = 'Edit Scheduled Class';
    const subtitleEl = document.getElementById('modal-subtitle');
    if (subtitleEl) subtitleEl.textContent = `Modify scheduled times, days, or add new slots for "${item.name}"`;
    const btnSaveText = document.getElementById('btn-save-class-text');
    if (btnSaveText) btnSaveText.textContent = 'Save Changes';

    document.getElementById('class-id').value = item.id;
    document.getElementById('class-name').value = item.name || '';
    document.getElementById('class-link').value = item.link || '';
    document.getElementById('class-enabled').checked = item.enabled !== false;

    // Load related slots for the same subject if multiple exist
    const subjectNameLower = (item.name || '').trim().toLowerCase();
    const relatedSlots = timetableData.filter(
      (c) => (c.name || '').trim().toLowerCase() === subjectNameLower
    );

    if (relatedSlots.length > 0) {
      currentModalSlots = relatedSlots.map((c) => {
        const itemDays = (Array.isArray(c.days) ? c.days : [c.days]).map((d) => String(d).toLowerCase().slice(0, 3));
        return createDefaultSlot(itemDays, c.time12 || c.time, c.duration || 60, c.id);
      });
    } else {
      const itemDays = (Array.isArray(item.days) ? item.days : [item.days]).map((d) => String(d).toLowerCase().slice(0, 3));
      currentModalSlots = [createDefaultSlot(itemDays, item.time12 || item.time, item.duration || 60, item.id)];
    }

    renderModalSlots();
    classModal.style.display = 'flex';
    const modalWin = document.querySelector('.modal-window');
    if (modalWin) modalWin.scrollTop = 0;
  };

  window.copyLink = function (link) {
    navigator.clipboard.writeText(link);
    showToast('Meeting link copied to clipboard!');
  };

  window.triggerImmediate = function (link, duration, name) {
    if (confirm(`Start automated recording for "${name}" now?`)) {
      startRecordingRequest(link, duration, name);
    }
  };

  // -------------------------------------------------------------
  // INSTANT RECORDING
  // -------------------------------------------------------------
  async function startRecordingRequest(link, duration, name) {
    try {
      showToast('Launching browser and joining meeting...', 'success');
      const res = await fetch('/api/record/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link, duration, name }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      showToast(`Recording started for "${name || 'Meeting'}"!`);
      fetchStatus();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  instantForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const link = document.getElementById('instant-link').value.trim();
    const name = document.getElementById('instant-name').value.trim() || 'Instant Session';
    const duration = parseInt(document.getElementById('instant-duration').value, 10) || 60;

    startRecordingRequest(link, duration, name);
  });

  // -------------------------------------------------------------
  // RECORDINGS LIBRARY
  // -------------------------------------------------------------
  async function fetchRecordings() {
    try {
      const res = await fetch('/api/recordings');
      const data = await res.json();

      statTotalRecordings.textContent = data.count || 0;

      if (!data.files || data.files.length === 0) {
        recordingsList.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 40px; color: var(--text-dim);">
              No recordings found yet. Completed sessions will appear here.
            </td>
          </tr>
        `;
        return;
      }

      recordingsList.innerHTML = data.files.map((file) => {
        const dateStr = new Date(file.createdAt).toLocaleString();
        return `
          <tr>
            <td>${escapeHtml(file.filename)}</td>
            <td><span class="file-badge ${file.type}">${file.type}</span></td>
            <td>${file.formattedSize}</td>
            <td>${dateStr}</td>
            <td style="text-align: right;">
              <a href="${file.url}" download="${escapeHtml(file.filename)}" class="btn-primary btn-sm" style="text-decoration: none; display: inline-flex;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                Download
              </a>
              <button class="btn-icon" onclick="deleteRecordingFile('${escapeHtml(file.filename)}')" title="Delete file" style="display: inline-flex; vertical-align: middle; margin-left: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch {}
  }

  btnRefreshRecordings.addEventListener('click', () => {
    fetchRecordings();
    showToast('Recordings list refreshed');
  });

  window.deleteRecordingFile = async function (filename) {
    if (!confirm(`Delete "${filename}"?`)) return;
    try {
      const res = await fetch(`/api/recordings/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        showToast('File deleted');
        fetchRecordings();
      }
    } catch {}
  };

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // Initial load & periodic polling
  fetchStatus();
  fetchTimetable();
  fetchRecordings();
  fetchAccount();
  fetchSettings();

  // Status ticker poll every 3 seconds
  setInterval(() => {
    fetchStatus();
  }, 3000);

  // Poll account status every 10 seconds (detects login completions)
  setInterval(() => {
    fetchAccount();
  }, 10000);

  // -------------------------------------------------------------
  // GOOGLE ACCOUNT & SETTINGS MANAGEMENT
  // -------------------------------------------------------------
  const accountPill = document.getElementById('account-pill');
  const accountPillName = document.getElementById('account-pill-name');
  const accountPillEmail = document.getElementById('account-pill-email');
  const accountAvatarImg = document.getElementById('account-avatar-img');
  const accountAvatarInitials = document.getElementById('account-avatar-initials');

  const accountCardName = document.getElementById('account-card-name');
  const accountCardEmail = document.getElementById('account-card-email');
  const accountCardAvatar = document.getElementById('account-card-avatar');
  const accountCardBadge = document.getElementById('account-card-badge');
  const btnLoginGoogle = document.getElementById('btn-login-google');
  const btnImportGoogle = document.getElementById('btn-import-google');
  const btnLogoutGoogle = document.getElementById('btn-logout-google');

  const formAutoleave = document.getElementById('form-autoleave');
  const formStoragePath = document.getElementById('form-storage-path');
  const formBotPrefs = document.getElementById('form-bot-prefs');
  const storageDirDisplay = document.getElementById('storage-dir-display');

  // Jump to settings when clicking navbar account pill
  accountPill?.addEventListener('click', () => {
    document.querySelector('.tab-btn[data-tab="settings"]')?.click();
  });

  async function fetchAccount() {
    try {
      const res = await fetch('/api/account');
      const data = await res.json();

      if (data.connected && data.account) {
        const acc = data.account;
        accountPillName.textContent = acc.name || 'Google User';
        accountPillEmail.textContent = acc.email;

        accountCardName.textContent = acc.name || 'Google User';
        accountCardEmail.textContent = acc.email;
        accountCardBadge.className = 'badge-success';
        accountCardBadge.textContent = 'Account Connected';

        if (acc.avatar) {
          accountAvatarImg.src = acc.avatar;
          accountAvatarImg.style.display = 'block';
          accountAvatarInitials.style.display = 'none';
          accountCardAvatar.innerHTML = `<img src="${acc.avatar}" alt="Avatar">`;
        } else {
          const initial = (acc.name || acc.email || 'G')[0].toUpperCase();
          accountAvatarInitials.textContent = initial;
          accountCardAvatar.textContent = initial;
        }

        if (btnImportGoogle) btnImportGoogle.style.display = 'none';
        if (btnLoginGoogle) btnLoginGoogle.textContent = 'Switch Account';
        if (btnLogoutGoogle) btnLogoutGoogle.style.display = 'inline-flex';
      } else {
        accountPillName.textContent = 'Guest Mode';
        accountPillEmail.textContent = 'Not Logged In';
        accountAvatarImg.style.display = 'none';
        accountAvatarInitials.style.display = 'inline';
        accountAvatarInitials.textContent = 'G';

        accountCardName.textContent = 'Guest Mode';
        accountCardEmail.textContent = data.hasSystemAccount
          ? `Detected on Chrome: ${data.systemAccount.email}`
          : 'No Google account logged in';
        accountCardBadge.className = 'badge-neutral';
        accountCardBadge.textContent = 'Guest Mode Active';
        accountCardAvatar.textContent = 'G';

        if (btnImportGoogle) {
          btnImportGoogle.style.display = data.hasSystemAccount ? 'inline-flex' : 'none';
          if (data.hasSystemAccount) {
            btnImportGoogle.title = `Import login for ${data.systemAccount.email}`;
          }
        }
        if (btnLoginGoogle) btnLoginGoogle.textContent = 'Log In via Chrome';
        if (btnLogoutGoogle) btnLogoutGoogle.style.display = 'none';
      }
    } catch {}
  }

  // Log Out / Disconnect Google account
  btnLogoutGoogle?.addEventListener('click', async () => {
    if (!confirm('Disconnect this Google account and return to guest mode?')) return;
    try {
      const res = await fetch('/api/account/logout', { method: 'POST' });
      const data = await res.json();
      showToast('Account disconnected. Now in Guest Mode.');
      fetchAccount();
    } catch {
      showToast('Could not disconnect account', 'error');
    }
  });

  // Launch Chrome to log in
  btnLoginGoogle?.addEventListener('click', async () => {
    showToast('Launching Google Sign-In window in Chrome...', 'success');
    try {
      const res = await fetch('/api/account/login', { method: 'POST' });
      const data = await res.json();
      showToast(data.message || 'Login window opened. Please complete sign in.');
    } catch (e) {
      showToast('Could not open login window', 'error');
    }
  });

  // Quick 1-click import from desktop Chrome
  btnImportGoogle?.addEventListener('click', async () => {
    btnImportGoogle.disabled = true;
    btnImportGoogle.textContent = 'Importing...';
    try {
      const res = await fetch('/api/account/import', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast('Google account imported successfully!');
        fetchAccount();
      } else {
        showToast(data.error || 'Import failed', 'error');
      }
    } catch (e) {
      showToast('Failed to import account: ' + e.message, 'error');
    } finally {
      btnImportGoogle.disabled = false;
      btnImportGoogle.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>
        Quick Import from Chrome
      `;
    }
  });

  // Fetch and populate Settings
  async function fetchSettings() {
    try {
      const res = await fetch('/api/settings');
      const settings = await res.json();

      // Auto-leave rules
      const al = settings.autoLeave || {};
      document.getElementById('setting-autoleave-enabled').checked = al.enabled !== false;
      document.getElementById('setting-min-participants').value = al.minParticipants || 2;
      document.getElementById('setting-grace-period').value = al.gracePeriodSec || 60;
      document.getElementById('setting-leave-on-host-exit').checked = al.onHostExit !== false;
      document.getElementById('setting-leave-on-max-duration').checked = al.maxDurationEnforced !== false;

      // Storage location
      if (settings.storagePath) {
        document.getElementById('setting-storage-path').value = settings.storagePath;
        if (storageDirDisplay) {
          storageDirDisplay.textContent = `Storage path: ${settings.storagePath}`;
        }
      }

      // Bot preferences
      document.getElementById('setting-bot-name').value = settings.botName || 'Meeting Recorder Bot';
      document.getElementById('setting-mute-mic').checked = settings.muteMicOnJoin !== false;
      document.getElementById('setting-turn-off-cam').checked = settings.turnOffCameraOnJoin !== false;

      // Browser settings
      const autoOpenEl = document.getElementById('setting-auto-open-browser');
      if (autoOpenEl) autoOpenEl.checked = settings.autoOpenBrowser !== false;
      const browserEngineEl = document.getElementById('setting-browser-engine');
      if (browserEngineEl) browserEngineEl.value = settings.browserEngine || 'testing_chrome';

      // Rejoin & Retry settings
      const rejoinRetriesEl = document.getElementById('setting-rejoin-retries');
      if (rejoinRetriesEl) rejoinRetriesEl.value = settings.rejoinRetries !== undefined ? settings.rejoinRetries : 3;
      const rejoinDelayEl = document.getElementById('setting-rejoin-delay');
      if (rejoinDelayEl) rejoinDelayEl.value = settings.rejoinDelaySec !== undefined ? settings.rejoinDelaySec : 10;
      const autoRejoinEl = document.getElementById('setting-auto-rejoin-disconnect');
      if (autoRejoinEl) autoRejoinEl.checked = settings.autoRejoinOnDisconnect !== false;
      const maxLobbyWaitEl = document.getElementById('setting-max-lobby-wait');
      if (maxLobbyWaitEl) maxLobbyWaitEl.value = settings.maxLobbyWaitMin !== undefined ? settings.maxLobbyWaitMin : 15;
    } catch {}
  }

  // Save Auto-Leave Settings
  formAutoleave?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      autoLeave: {
        enabled: document.getElementById('setting-autoleave-enabled').checked,
        minParticipants: parseInt(document.getElementById('setting-min-participants').value, 10),
        gracePeriodSec: parseInt(document.getElementById('setting-grace-period').value, 10),
        onHostExit: document.getElementById('setting-leave-on-host-exit').checked,
        maxDurationEnforced: document.getElementById('setting-leave-on-max-duration').checked,
      },
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) showToast('Auto-leave rules updated successfully!');
    } catch {
      showToast('Failed to save auto-leave rules', 'error');
    }
  });

  // Save Storage Path
  formStoragePath?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const storagePath = document.getElementById('setting-storage-path').value.trim();
    if (!storagePath) return;

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Storage folder updated successfully!');
        if (storageDirDisplay) storageDirDisplay.textContent = `Storage path: ${storagePath}`;
        fetchRecordings();
      }
    } catch {
      showToast('Failed to update storage directory', 'error');
    }
  });

  // Save Bot Preferences
  formBotPrefs?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      botName: document.getElementById('setting-bot-name').value.trim(),
      muteMicOnJoin: document.getElementById('setting-mute-mic').checked,
      turnOffCameraOnJoin: document.getElementById('setting-turn-off-cam').checked,
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) showToast('Bot preferences saved!');
    } catch {
      showToast('Failed to save bot preferences', 'error');
    }
  });

  // Save Browser Settings
  const formBrowserSettings = document.getElementById('form-browser-settings');
  const btnTestOpenBrowser = document.getElementById('btn-test-open-browser');

  formBrowserSettings?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      autoOpenBrowser: document.getElementById('setting-auto-open-browser').checked,
      browserEngine: document.getElementById('setting-browser-engine').value,
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) showToast('Browser launch settings saved!');
    } catch {
      showToast('Failed to save browser settings', 'error');
    }
  });

  // Save Rejoin & Retry Settings
  const formRejoinSettings = document.getElementById('form-rejoin-settings');
  formRejoinSettings?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      rejoinRetries: parseInt(document.getElementById('setting-rejoin-retries').value, 10),
      rejoinDelaySec: parseInt(document.getElementById('setting-rejoin-delay').value, 10),
      autoRejoinOnDisconnect: document.getElementById('setting-auto-rejoin-disconnect').checked,
      maxLobbyWaitMin: parseInt(document.getElementById('setting-max-lobby-wait').value, 10),
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) showToast('Rejoin & retry preferences saved!');
    } catch {
      showToast('Failed to save rejoin preferences', 'error');
    }
  });

  // Test Open in Default Browser
  btnTestOpenBrowser?.addEventListener('click', async () => {
    try {
      showToast('Launching in default browser...');
      await fetch('/api/browser/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: window.location.href }),
      });
    } catch {
      showToast('Could not open default browser', 'error');
    }
  });
});
