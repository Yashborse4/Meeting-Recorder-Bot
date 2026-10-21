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
  // INDIAN STANDARD TIME (IST) & 12-HOUR AM/PM CONTROLS
  // -------------------------------------------------------------
  const timeHour = document.getElementById('time-hour');
  const timeMinute = document.getElementById('time-minute');
  const timeAmpm = document.getElementById('time-ampm');
  const btnAmpmList = document.querySelectorAll('.btn-ampm');
  const classTimeHidden = document.getElementById('class-time');
  const timePreviewText = document.getElementById('time-preview-text');
  const time24hHint = document.getElementById('time-24h-hint');
  const liveIstClock = document.getElementById('live-ist-clock');

  // Populate all 60 minutes (00 - 59)
  if (timeMinute) {
    timeMinute.innerHTML = Array.from({ length: 60 }, (_, i) => {
      const v = String(i).padStart(2, '0');
      return `<option value="${v}">${v}</option>`;
    }).join('');
  }

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

  function syncTimeToHidden() {
    if (!timeHour || !timeMinute || !timeAmpm || !classTimeHidden) return;
    let h = parseInt(timeHour.value, 10) || 12;
    const m = (timeMinute.value || '00').padStart(2, '0');
    const ampm = timeAmpm.value || 'AM';

    let h24 = h;
    if (ampm === 'PM' && h < 12) h24 = h + 12;
    if (ampm === 'AM' && h === 12) h24 = 0;

    const hh24Str = String(h24).padStart(2, '0');
    classTimeHidden.value = `${hh24Str}:${m}`;

    if (timePreviewText) {
      timePreviewText.textContent = `${timeHour.value}:${m} ${ampm} IST`;
    }
    if (time24hHint) {
      time24hHint.textContent = `(24-hour: ${hh24Str}:${m})`;
    }
  }

  function setTimeFrom24(timeStr) {
    if (!timeHour || !timeMinute || !timeAmpm) return;
    let h = 9;
    let m = 0;
    let ampm = 'AM';

    if (timeStr) {
      // Strip trailing timezone like "IST", "GMT", "UTC"
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

    timeHour.value = String(h).padStart(2, '0');
    timeMinute.value = String(m).padStart(2, '0');
    timeAmpm.value = ampm;

    btnAmpmList.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.ampm === ampm);
    });

    syncTimeToHidden();
  }

  btnAmpmList.forEach((btn) => {
    btn.addEventListener('click', () => {
      btnAmpmList.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (timeAmpm) timeAmpm.value = btn.dataset.ampm;
      syncTimeToHidden();
    });
  });

  timeHour?.addEventListener('change', syncTimeToHidden);
  timeMinute?.addEventListener('change', syncTimeToHidden);

  // Modal open/close
  btnOpenAddModal.addEventListener('click', () => {
    isEditingId = null;
    modalTitle.textContent = 'Add Scheduled Class';
    const subtitleEl = document.getElementById('modal-subtitle');
    if (subtitleEl) subtitleEl.textContent = 'Configure class timing, Meet link, and weekly schedule';
    const btnSaveText = document.getElementById('btn-save-class-text');
    if (btnSaveText) btnSaveText.textContent = 'Schedule Class';
    classForm.reset();
    document.getElementById('class-id').value = '';
    document.getElementById('class-duration').value = '60';
    document.getElementById('class-enabled').checked = true;
    document.querySelectorAll('input[name="days"]').forEach((cb) => {
      cb.checked = ['mon', 'tue', 'wed', 'thu', 'fri'].includes(cb.value);
    });
    setTimeFrom24('09:00 AM');
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

  // Day preset buttons inside modal
  document.querySelectorAll('.btn-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.preset;
      const checkboxes = document.querySelectorAll('input[name="days"]');
      checkboxes.forEach((cb) => {
        if (preset === 'all') cb.checked = true;
        else if (preset === 'weekdays') cb.checked = ['mon', 'tue', 'wed', 'thu', 'fri'].includes(cb.value);
        else if (preset === 'weekends') cb.checked = ['sat', 'sun'].includes(cb.value);
      });
    });
  });

  // Save / Update Class Form
  classForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectedDays = Array.from(document.querySelectorAll('input[name="days"]:checked')).map((c) => c.value);
    if (selectedDays.length === 0) {
      showToast('Please select at least one day (Mon - Sun).', 'error');
      return;
    }

    const payload = {
      id: document.getElementById('class-id').value || undefined,
      name: document.getElementById('class-name').value.trim(),
      link: document.getElementById('class-link').value.trim(),
      days: selectedDays,
      time: document.getElementById('class-time').value,
      duration: parseInt(document.getElementById('class-duration').value, 10),
      enabled: document.getElementById('class-enabled').checked,
    };

    try {
      const res = await fetch('/api/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      showToast(isEditingId ? 'Class updated successfully!' : 'Class scheduled successfully!');
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

  window.editClass = function (id) {
    const item = timetableData.find((c) => c.id === id);
    if (!item) return;

    isEditingId = id;
    modalTitle.textContent = 'Edit Scheduled Class';
    const subtitleEl = document.getElementById('modal-subtitle');
    if (subtitleEl) subtitleEl.textContent = `Modify scheduled time, Meet link, or active days for "${item.name}"`;
    const btnSaveText = document.getElementById('btn-save-class-text');
    if (btnSaveText) btnSaveText.textContent = 'Save Changes';

    document.getElementById('class-id').value = item.id;
    document.getElementById('class-name').value = item.name || '';
    document.getElementById('class-link').value = item.link || '';
    setTimeFrom24(item.time12 || item.time);
    document.getElementById('class-duration').value = item.duration || 60;
    document.getElementById('class-enabled').checked = item.enabled !== false;

    // Accurately map days (handling full names e.g. "monday", "wednesday", and abbreviations "mon", "wed")
    const itemDays = (Array.isArray(item.days) ? item.days : [item.days]).map((d) =>
      String(d).toLowerCase().trim().slice(0, 3)
    );
    const isAll = itemDays.includes('all') || itemDays.includes('*');
    document.querySelectorAll('input[name="days"]').forEach((cb) => {
      const cbVal = cb.value.toLowerCase().slice(0, 3);
      cb.checked = isAll || itemDays.includes(cbVal);
    });

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
