/**
 * MeetRecord Pro - Dashboard Web App Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // State
  let timetableData = [];
  let subjectsData = [];
  let currentDayFilter = 'all';
  let isEditingId = null;
  let editingSubjectId = null;

  // DOM Elements
  const timetableGrid = document.getElementById('timetable-grid');
  const classModal = document.getElementById('class-modal');
  const classForm = document.getElementById('class-form');
  const btnOpenAddModal = document.getElementById('btn-open-add-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const modalTitle = document.getElementById('modal-title');
  const btnSaveClassText = document.getElementById('btn-save-class-text');
  const toastContainer = document.getElementById('toast-container');
  const btnQuickManageSubjects = document.getElementById('btn-quick-manage-subjects');
  const btnModalManageClasses = document.getElementById('btn-modal-manage-classes');

  // Metrics Elements
  const nextClassTitle = document.getElementById('next-class-title');
  const nextClassCountdown = document.getElementById('next-class-countdown');
  const nextClassMeta = document.getElementById('next-class-meta');
  const nextClassLinkWrapper = document.getElementById('next-class-link-wrapper');
  const nextClassLink = document.getElementById('next-class-link');
  const statTotalClasses = document.getElementById('stat-total-classes');
  const statActiveClasses = document.getElementById('stat-active-classes');
  const statTotalSubjects = document.getElementById('stat-total-subjects');
  const statSubjectsSummary = document.getElementById('stat-subjects-summary');
  const statTotalRecordings = document.getElementById('stat-total-recordings');

  // Streamlined Modal Elements
  const scheduleClassSelect = document.getElementById('schedule-class-select');
  const scheduleLinkTestBtn = document.getElementById('schedule-link-test-btn');
  const scheduleTimeNative = document.getElementById('schedule-time-native');
  const scheduleDurationInput = document.getElementById('schedule-duration-input');
  const schedPreviewTitle = document.getElementById('sched-preview-title');
  const schedPreviewTiming = document.getElementById('sched-preview-timing');
  const classEnabledInput = document.getElementById('class-enabled');
  const classNameInput = document.getElementById('class-name');
  const classLinkInput = document.getElementById('class-link');
  const classIdInput = document.getElementById('class-id');
  const classSyncCatalog = document.getElementById('class-sync-catalog');
  const btnPasteLink = document.getElementById('btn-paste-link');

  // Subjects / Catalog Screen Elements
  const subjectsGrid = document.getElementById('subjects-grid');
  const subjectEditorCard = document.getElementById('subject-editor-card');
  const btnToggleSubjectEditor = document.getElementById('btn-toggle-subject-editor');
  const btnCloseSubjectEditor = document.getElementById('btn-close-subject-editor');
  const btnCancelSubjectEditor = document.getElementById('btn-cancel-subject-editor');
  const subjectEditorForm = document.getElementById('subject-editor-form');
  const subjectInputName = document.getElementById('subject-input-name');
  const subjectInputLink = document.getElementById('subject-input-link');
  const subjectInputDuration = document.getElementById('subject-input-duration');
  const subjectInputColor = document.getElementById('subject-input-color');
  const subjectEditId = document.getElementById('subject-edit-id');
  const subjectEditorTitle = document.getElementById('subject-editor-title');
  const btnSubmitSubjectText = document.getElementById('btn-submit-subject-text');

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
      if (btn.dataset.tab === 'subjects') fetchSubjects();
      if (btn.dataset.tab === 'timetable') fetchTimetable();
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
  // HELPER UTILITIES
  // -------------------------------------------------------------
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  // -------------------------------------------------------------
  // SUBJECTS & CLASS DIRECTORY (VARIETY OF CLASSES)
  // -------------------------------------------------------------
  async function fetchSubjects() {
    try {
      const res = await fetch('/api/subjects');
      const data = await res.json();
      subjectsData = data.subjects || [];

      if (statTotalSubjects) statTotalSubjects.textContent = subjectsData.length;
      if (statSubjectsSummary) {
        if (subjectsData.length === 0) {
          statSubjectsSummary.textContent = 'No classes registered yet';
        } else {
          statSubjectsSummary.textContent = subjectsData.slice(0, 3).map((s) => s.name).join(', ') +
            (subjectsData.length > 3 ? ` +${subjectsData.length - 3} more` : '');
        }
      }

      renderSubjects();
      populateScheduleClassDropdown();
    } catch (err) {
      console.error('[App] Failed fetching subjects catalog:', err);
    }
  }

  function renderSubjects() {
    if (!subjectsGrid) return;
    if (!subjectsData || subjectsData.length === 0) {
      subjectsGrid.innerHTML = `
        <div class="empty-catalog-state">
          <div style="font-size: 2.2rem; margin-bottom: 12px;">📚</div>
          <h3>No Class Varieties Registered</h3>
          <p>Register all the classes you attend (Advance Engineering Math, Robotics, etc.) and their Google Meet links once. Then add them to your timetable with 1 click.</p>
          <button type="button" class="btn-primary" onclick="openSubjectEditor()">
            + Register First Class
          </button>
        </div>
      `;
      return;
    }

    subjectsGrid.innerHTML = subjectsData.map((subj) => {
      const subjNameLower = (subj.name || '').trim().toLowerCase();
      const matchingSlots = timetableData.filter(
        (t) => (t.name || '').trim().toLowerCase() === subjNameLower
      );

      let scheduleSummary = 'Not scheduled on timetable';
      if (matchingSlots.length > 0) {
        const allDays = new Set();
        matchingSlots.forEach((slot) => {
          const days = Array.isArray(slot.days) ? slot.days : [slot.days];
          days.forEach((d) => allDays.add(String(d).toLowerCase().slice(0, 3)));
        });
        const daysStr = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
          .filter((d) => allDays.has(d))
          .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
          .join(', ');
        scheduleSummary = `Scheduled ${matchingSlots.length} slot${matchingSlots.length > 1 ? 's' : ''} (${daysStr || 'Active'})`;
      }

      const color = subj.color || '#6366f1';

      return `
        <div class="subject-card">
          <div class="subject-color-strip" style="background: ${color};"></div>
          <div class="subject-card-body">
            <div class="subject-card-header">
              <div>
                <h3 class="subject-card-title">${escapeHtml(subj.name)}</h3>
                <span class="subject-badge-pill" style="border-color: ${color}; color: ${color};">
                  ${subj.defaultDuration || 60} mins default
                </span>
              </div>
              <div style="display: flex; gap: 4px;">
                <button class="btn-icon" onclick="editSubject('${subj.id}')" title="Edit this class variety">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="btn-icon" onclick="deleteSubject('${subj.id}')" title="Delete class variety">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>

            <div class="subject-link-box">
              <span class="subject-link-url" title="${escapeHtml(subj.link)}">${escapeHtml(subj.link)}</span>
              <div style="display: flex; gap: 4px; flex-shrink: 0;">
                <button type="button" class="btn-icon-xs" onclick="copyLink('${escapeHtml(subj.link)}')" title="Copy Meet link">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copy
                </button>
                <a href="${escapeHtml(subj.link)}" target="_blank" class="btn-icon-xs" title="Test Google Meet link in new tab">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                  Test
                </a>
              </div>
            </div>

            <div class="subject-schedule-meta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>${scheduleSummary}</span>
            </div>
          </div>

          <div class="subject-card-footer">
            <button type="button" class="btn-subject-schedule" onclick="scheduleThisSubject('${subj.id}')" title="Schedule this class into your weekly timetable">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add to Timetable
            </button>
            <button type="button" class="btn-card-record" onclick="triggerImmediate('${escapeHtml(subj.link)}', ${subj.defaultDuration || 60}, '${escapeHtml(subj.name)}')" title="Launch and record this class now">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Record Now
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  window.openSubjectEditor = function (subj = null) {
    if (!subjectEditorCard) return;
    editingSubjectId = subj ? subj.id : null;

    if (subj) {
      if (subjectEditorTitle) subjectEditorTitle.textContent = 'Edit Class Variety';
      if (btnSubmitSubjectText) btnSubmitSubjectText.textContent = 'Save Changes';
      if (subjectEditId) subjectEditId.value = subj.id;
      if (subjectInputName) subjectInputName.value = subj.name;
      if (subjectInputLink) subjectInputLink.value = subj.link;
      if (subjectInputDuration) subjectInputDuration.value = subj.defaultDuration || 60;
      if (subjectInputColor) subjectInputColor.value = subj.color || '#6366f1';
    } else {
      if (subjectEditorTitle) subjectEditorTitle.textContent = 'Register Class / Meeting';
      if (btnSubmitSubjectText) btnSubmitSubjectText.textContent = 'Save Class to Directory';
      if (subjectEditId) subjectEditId.value = '';
      if (subjectInputName) subjectInputName.value = '';
      if (subjectInputLink) subjectInputLink.value = '';
      if (subjectInputDuration) subjectInputDuration.value = 60;
      if (subjectInputColor) subjectInputColor.value = '#6366f1';
    }

    // Update active color circle
    const activeColor = subjectInputColor?.value || '#6366f1';
    document.querySelectorAll('.color-circle').forEach((c) => {
      c.classList.toggle('active', c.dataset.color === activeColor);
    });

    subjectEditorCard.style.display = 'block';
    subjectEditorCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  window.closeSubjectEditor = function () {
    if (subjectEditorCard) subjectEditorCard.style.display = 'none';
  };

  window.editSubject = function (id) {
    const subj = subjectsData.find((s) => s.id === id);
    if (subj) openSubjectEditor(subj);
  };

  window.deleteSubject = async function (id) {
    const subj = subjectsData.find((s) => s.id === id);
    if (!confirm(`Delete "${subj ? subj.name : 'this class'}" from the catalog?`)) return;

    try {
      const res = await fetch(`/api/subjects/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        showToast('Class variety deleted');
        await fetchSubjects();
        await fetchTimetable();
      }
    } catch {
      showToast('Failed to delete class', 'error');
    }
  };

  window.scheduleThisSubject = function (subjectId) {
    // Switch to timetable tab
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

    const timetableTabBtn = document.querySelector('.tab-btn[data-tab="timetable"]');
    const timetableSection = document.getElementById('tab-timetable');
    if (timetableTabBtn) timetableTabBtn.classList.add('active');
    if (timetableSection) timetableSection.classList.add('active');

    openScheduleModal(currentDayFilter, subjectId);
  };

  window.setSubjectFormDuration = function (mins) {
    if (subjectInputDuration) subjectInputDuration.value = mins;
    document.querySelectorAll('.duration-quick-selector .chip-duration-sm').forEach((c) => {
      c.classList.toggle('active', parseInt(c.textContent, 10) === mins);
    });
  };

  // Color picker circle clicks
  document.querySelectorAll('.color-circle').forEach((circle) => {
    circle.addEventListener('click', () => {
      document.querySelectorAll('.color-circle').forEach((c) => c.classList.remove('active'));
      circle.classList.add('active');
      if (subjectInputColor) subjectInputColor.value = circle.dataset.color;
    });
  });

  btnToggleSubjectEditor?.addEventListener('click', () => {
    if (subjectEditorCard.style.display === 'none' || !subjectEditorCard.style.display) {
      openSubjectEditor();
    } else {
      closeSubjectEditor();
    }
  });
  btnCloseSubjectEditor?.addEventListener('click', closeSubjectEditor);
  btnCancelSubjectEditor?.addEventListener('click', closeSubjectEditor);

  // Save Subject in Directory
  subjectEditorForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = (subjectInputName?.value || '').trim();
    let link = (subjectInputLink?.value || '').trim();
    const defaultDuration = parseInt(subjectInputDuration?.value || '60', 10);
    const color = subjectInputColor?.value || '#6366f1';
    const id = subjectEditId?.value || undefined;

    if (!name) {
      showToast('Please enter a class name.', 'error');
      subjectInputName?.focus();
      return;
    }

    if (!link) {
      showToast('Please provide a Google Meet link.', 'error');
      subjectInputLink?.focus();
      return;
    }

    if (!link.startsWith('http://') && !link.startsWith('https://')) {
      link = 'https://' + link;
    }

    if (!link.toLowerCase().includes('meet.google.com')) {
      showToast('Please provide a valid Google Meet link (e.g. https://meet.google.com/abc-defg-hij).', 'error');
      subjectInputLink?.focus();
      return;
    }

    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, link, defaultDuration, color }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      showToast(`Class "${name}" saved to catalog!`);
      closeSubjectEditor();
      await fetchSubjects();
      await fetchTimetable();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // -------------------------------------------------------------
  // TIMETABLE RENDERING & MANAGEMENT
  // -------------------------------------------------------------
  async function fetchTimetable() {
    try {
      const res = await fetch('/api/timetable');
      timetableData = await res.json();

      if (statTotalClasses) statTotalClasses.textContent = timetableData.length;
      if (statActiveClasses) {
        statActiveClasses.textContent = `${timetableData.filter((c) => c.enabled).length} active classes`;
      }

      renderTimetable();
    } catch (e) {
      console.error('[App] Error fetching timetable:', e);
    }
  }

  function renderTimetable() {
    const daysOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    // Update count badges on day filter buttons
    document.querySelectorAll('.day-filter').forEach((btn) => {
      const d = btn.dataset.day;
      let count = 0;
      if (d === 'all') {
        count = timetableData.length;
      } else {
        count = timetableData.filter((item) => {
          const days = (Array.isArray(item.days) ? item.days : [item.days]).map((x) => String(x).toLowerCase().slice(0, 3));
          return days.includes(d) || days.includes('all') || days.includes('*');
        }).length;
      }
      const label = d === 'all' ? 'All Days' : d.charAt(0).toUpperCase() + d.slice(1);
      btn.innerHTML = `${label} <span class="day-count-badge">${count}</span>`;
    });

    const filtered = timetableData.filter((item) => {
      if (currentDayFilter === 'all') return true;
      const days = (Array.isArray(item.days) ? item.days : [item.days]).map((d) => String(d).toLowerCase().slice(0, 3));
      return days.includes(currentDayFilter) || days.includes('all') || days.includes('*');
    });

    // Chronological sort
    filtered.sort((a, b) => {
      const tA = String(a.time || '00:00');
      const tB = String(b.time || '00:00');
      return tA.localeCompare(tB);
    });

    if (filtered.length === 0) {
      const dayLabel = currentDayFilter === 'all'
        ? 'your timetable'
        : currentDayFilter.charAt(0).toUpperCase() + currentDayFilter.slice(1);

      timetableGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📅</div>
          <h3>No classes scheduled for ${dayLabel}</h3>
          <p>Pick a class from your catalog and set its timing in seconds with zero clutter.</p>
          <button class="btn-primary" onclick="openScheduleModal('${currentDayFilter !== 'all' ? currentDayFilter : ''}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            + Schedule Class ${currentDayFilter !== 'all' ? 'for ' + dayLabel : ''}
          </button>
        </div>
      `;
      return;
    }

    timetableGrid.innerHTML = filtered.map((item) => {
      const itemDays = (Array.isArray(item.days) ? item.days : [item.days]).map((d) => String(d).toLowerCase().slice(0, 3));
      const isAll = itemDays.includes('all') || itemDays.includes('*');

      const matchedSubj = subjectsData.find(
        (s) => (s.name || '').trim().toLowerCase() === (item.name || '').trim().toLowerCase()
      );
      const color = matchedSubj ? matchedSubj.color : '#6366f1';

      const dayTags = daysOrder.map((day) => {
        const isActive = isAll || itemDays.includes(day);
        return `<span class="day-tag ${isActive ? 'active' : ''}">${day}</span>`;
      }).join('');

      let timeRange = formatTime12(item.time12 || item.time);
      if (item.time && item.duration) {
        const [hStr, mStr] = item.time.split(':');
        let totalMins = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + parseInt(item.duration, 10);
        let endH = Math.floor(totalMins / 60) % 24;
        let endM = totalMins % 60;
        let endAmpm = endH >= 12 ? 'PM' : 'AM';
        let endH12 = endH % 12 || 12;
        let endStr = `${String(endH12).padStart(2, '0')}:${String(endM).padStart(2, '0')} ${endAmpm}`;
        timeRange = `${formatTime12Plain(item.time12 || item.time)} - ${endStr} <span class="tz-badge">IST</span>`;
      }

      return `
        <div class="class-card ${!item.enabled ? 'disabled' : ''}">
          <div class="subject-color-strip" style="background: ${color}; width: 4px; position: absolute; left: 0; top: 0; height: 100%;"></div>
          <div>
            <div class="class-card-header">
              <div class="class-title-group">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${color}; margin-right: 6px;"></span>
                <h4 class="class-card-title">${escapeHtml(item.name)}</h4>
              </div>
              <label class="switch-control" title="Toggle active automated recording">
                <input type="checkbox" ${item.enabled ? 'checked' : ''} onchange="toggleActiveClass('${item.id}')">
                <span class="switch-slider"></span>
              </label>
            </div>

            <div class="class-card-time">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>${timeRange}</span>
              <span class="class-duration-badge">(${item.duration || 60} mins)</span>
            </div>

            <div class="class-days-list">
              ${dayTags}
            </div>

            <div class="class-card-link">
              <span class="link-text" title="${escapeHtml(item.link)}">${escapeHtml(item.link)}</span>
              <div class="link-actions">
                <button type="button" class="btn-icon" onclick="copyLink('${escapeHtml(item.link)}')" title="Copy Meet link">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <a href="${escapeHtml(item.link)}" target="_blank" class="btn-icon" title="Open Meet in new tab">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                </a>
              </div>
            </div>
          </div>

          <div class="class-card-actions">
            <button type="button" class="btn-card-edit-prominent" onclick="editClass('${item.id}')" title="Edit class name, link, days, or timing">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <button type="button" class="btn-card-duplicate" onclick="duplicateClass('${item.id}')" title="Duplicate this class for another slot">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Clone
            </button>
            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn-card-record" onclick="triggerImmediate('${escapeHtml(item.link)}', ${item.duration || 60}, '${escapeHtml(item.name)}')" title="Launch and record this class now">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Record Now
              </button>
              <button type="button" class="btn-danger btn-sm" onclick="deleteClass('${item.id}')" title="Delete class">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Day filter button listeners
  document.querySelectorAll('.day-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.day-filter').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentDayFilter = btn.dataset.day;
      renderTimetable();
    });
  });

  // -------------------------------------------------------------
  // STREAMLINED CLUTTER-FREE SCHEDULING (MODAL)
  // -------------------------------------------------------------
  function populateScheduleClassDropdown(selectedIdOrName = null) {
    if (!scheduleClassSelect) return;

    let html = `<option value="">-- Pick from Saved Class Varieties (or type below) --</option>`;

    subjectsData.forEach((s) => {
      const isSelected =
        selectedIdOrName &&
        (selectedIdOrName === s.id ||
          String(selectedIdOrName).trim().toLowerCase() === (s.name || '').trim().toLowerCase());
      html += `<option value="${s.id}" ${isSelected ? 'selected' : ''}>${escapeHtml(s.name)}</option>`;
    });

    html += `<option value="__custom__">✏️ Custom / Type Manual Class...</option>`;
    scheduleClassSelect.innerHTML = html;

    if (selectedIdOrName) {
      const match = subjectsData.find(
        (s) =>
          s.id === selectedIdOrName ||
          (s.name && s.name.trim().toLowerCase() === String(selectedIdOrName).trim().toLowerCase())
      );
      if (match) {
        scheduleClassSelect.value = match.id;
      } else {
        scheduleClassSelect.value = '__custom__';
      }
    } else {
      scheduleClassSelect.value = '';
    }
  }

  // Handle picking a variety from dropdown
  scheduleClassSelect?.addEventListener('change', () => {
    const val = scheduleClassSelect.value;
    if (!val || val === '__custom__') {
      classNameInput?.focus();
      return;
    }

    const subj = subjectsData.find((s) => s.id === val);
    if (subj) {
      if (classNameInput) classNameInput.value = subj.name;
      if (classLinkInput) {
        classLinkInput.value = subj.link;
        if (scheduleLinkTestBtn) scheduleLinkTestBtn.href = subj.link || '#';
      }
      if (scheduleDurationInput && subj.defaultDuration) {
        setScheduleDuration(subj.defaultDuration);
      }
      updateSchedulePreviewSummary();
    }
  });

  // Keep test link and preview in sync when typing link
  classLinkInput?.addEventListener('input', () => {
    let link = (classLinkInput.value || '').trim();
    if (link && !link.startsWith('http://') && !link.startsWith('https://')) {
      link = 'https://' + link;
    }
    if (scheduleLinkTestBtn) {
      scheduleLinkTestBtn.href = link || '#';
    }
  });

  // Paste from clipboard helper
  btnPasteLink?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        classLinkInput.value = text.trim();
        classLinkInput.dispatchEvent(new Event('input'));
        showToast('Link pasted from clipboard!');
      }
    } catch {
      classLinkInput?.focus();
      showToast('Clipboard access denied. Please paste manually.', 'error');
    }
  });

  window.setScheduleTime = function (hhmm) {
    if (!scheduleTimeNative) return;
    scheduleTimeNative.value = hhmm;
    document.querySelectorAll('.chip-time').forEach((c) => {
      const [h, m] = hhmm.split(':');
      const h12 = (parseInt(h, 10) % 12 || 12).toString().padStart(2, '0');
      c.classList.toggle('active', c.textContent.trim().startsWith(`${h12}:${m}`));
    });
    updateSchedulePreviewSummary();
  };

  window.setScheduleDuration = function (mins) {
    if (!scheduleDurationInput) return;
    scheduleDurationInput.value = mins;
    document.querySelectorAll('.duration-quick-chips .chip-duration').forEach((c) => {
      c.classList.toggle('active', parseInt(c.textContent, 10) === mins || (mins === 120 && c.textContent.includes('2 hr')));
    });
    updateSchedulePreviewSummary();
  };

  window.setScheduleDaysPreset = function (preset) {
    const checkboxes = document.querySelectorAll('input[name="sched_day"]');
    const now = new Date();
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const todayName = dayNames[now.getDay()];

    checkboxes.forEach((cb) => {
      const val = cb.value;
      if (preset === 'today') {
        cb.checked = val === todayName;
      } else if (preset === 'weekdays') {
        cb.checked = ['mon', 'tue', 'wed', 'thu', 'fri'].includes(val);
      } else if (preset === 'mwf') {
        cb.checked = ['mon', 'wed', 'fri'].includes(val);
      } else if (preset === 'tts') {
        cb.checked = ['tue', 'thu', 'sat'].includes(val);
      } else if (preset === 'all') {
        cb.checked = true;
      }
    });
    updateSchedulePreviewSummary();
  };

  function updateSchedulePreviewSummary() {
    if (!schedPreviewTitle || !schedPreviewTiming) return;

    const subjectName = (classNameInput?.value || '').trim() || 'Selected Class';
    const checkedDays = Array.from(document.querySelectorAll('input[name="sched_day"]:checked')).map((cb) => cb.value);

    let daysText = 'No days selected';
    if (checkedDays.length === 7) daysText = 'Every day (Mon-Sun)';
    else if (checkedDays.length === 5 && !checkedDays.includes('sat') && !checkedDays.includes('sun')) daysText = 'Every Mon - Fri (Weekdays)';
    else if (checkedDays.length > 0) {
      const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      daysText = [...checkedDays]
        .sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b))
        .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
        .join(', ');
    }

    const timeVal = scheduleTimeNative?.value || '10:00';
    const durationVal = parseInt(scheduleDurationInput?.value || '60', 10);
    const time12Str = formatTime12Plain(timeVal);

    schedPreviewTitle.textContent = subjectName;
    schedPreviewTiming.textContent = `${daysText} at ${time12Str} (${durationVal} mins)`;
  }

  // Update summary on typing
  classNameInput?.addEventListener('input', () => {
    updateSchedulePreviewSummary();
    const typed = (classNameInput.value || '').trim().toLowerCase();
    const match = subjectsData.find((s) => (s.name || '').trim().toLowerCase() === typed);
    if (match) {
      scheduleClassSelect.value = match.id;
    } else if (typed) {
      scheduleClassSelect.value = '__custom__';
    } else {
      scheduleClassSelect.value = '';
    }
  });
  scheduleTimeNative?.addEventListener('input', updateSchedulePreviewSummary);
  scheduleDurationInput?.addEventListener('input', updateSchedulePreviewSummary);
  document.querySelectorAll('input[name="sched_day"]').forEach((cb) => {
    cb.addEventListener('change', updateSchedulePreviewSummary);
  });

  window.openScheduleModal = function (day = null, subjectId = null, editingItem = null, isDuplicate = false) {
    if (editingItem && !isDuplicate) {
      // EDITING AN EXISTING TIMETABLE SLOT
      isEditingId = editingItem.id;
      if (modalTitle) modalTitle.textContent = 'Edit Scheduled Class';
      const sub = document.getElementById('modal-subtitle');
      if (sub) sub.textContent = `Update class name, Meet link, days, or timing for "${editingItem.name}"`;
      if (btnSaveClassText) btnSaveClassText.textContent = 'Save Changes';

      if (classIdInput) classIdInput.value = editingItem.id;
      if (classNameInput) classNameInput.value = editingItem.name;
      if (classLinkInput) classLinkInput.value = editingItem.link;
      if (classEnabledInput) classEnabledInput.checked = editingItem.enabled !== false;
      if (classSyncCatalog) classSyncCatalog.checked = true;

      populateScheduleClassDropdown(editingItem.name);

      const itemDays = (Array.isArray(editingItem.days) ? editingItem.days : [editingItem.days]).map((d) =>
        String(d).toLowerCase().slice(0, 3)
      );
      document.querySelectorAll('input[name="sched_day"]').forEach((cb) => {
        cb.checked = itemDays.includes(cb.value) || itemDays.includes('all') || itemDays.includes('*');
      });

      setScheduleTime(editingItem.time || '10:00');
      setScheduleDuration(editingItem.duration || 60);
    } else if (editingItem && isDuplicate) {
      // DUPLICATING AN EXISTING SLOT
      isEditingId = null;
      if (modalTitle) modalTitle.textContent = 'Duplicate Class Schedule';
      const sub = document.getElementById('modal-subtitle');
      if (sub) sub.textContent = `Clone "${editingItem.name}" with a new day or time`;
      if (btnSaveClassText) btnSaveClassText.textContent = 'Add to Timetable';

      if (classIdInput) classIdInput.value = '';
      if (classNameInput) classNameInput.value = editingItem.name;
      if (classLinkInput) classLinkInput.value = editingItem.link;
      if (classEnabledInput) classEnabledInput.checked = true;
      if (classSyncCatalog) classSyncCatalog.checked = false;

      populateScheduleClassDropdown(editingItem.name);

      const targetDay = day && day !== 'all' ? day.toLowerCase().slice(0, 3) : null;
      const itemDays = (Array.isArray(editingItem.days) ? editingItem.days : [editingItem.days]).map((d) =>
        String(d).toLowerCase().slice(0, 3)
      );
      document.querySelectorAll('input[name="sched_day"]').forEach((cb) => {
        cb.checked = targetDay ? cb.value === targetDay : itemDays.includes(cb.value);
      });

      setScheduleTime(editingItem.time || '10:00');
      setScheduleDuration(editingItem.duration || 60);
    } else {
      // ADDING A BRAND NEW CLASS
      isEditingId = null;
      if (modalTitle) modalTitle.textContent = 'Schedule a Class';
      const sub = document.getElementById('modal-subtitle');
      if (sub) sub.textContent = 'Pick class variety or type details, choose days and timing';
      if (btnSaveClassText) btnSaveClassText.textContent = 'Schedule Class';

      if (classIdInput) classIdInput.value = '';
      if (classEnabledInput) classEnabledInput.checked = true;
      if (classSyncCatalog) classSyncCatalog.checked = true;

      populateScheduleClassDropdown(subjectId);

      const targetSubj = subjectId
        ? subjectsData.find((s) => s.id === subjectId)
        : (subjectsData.length > 0 ? subjectsData[0] : null);

      if (targetSubj) {
        if (classNameInput) classNameInput.value = targetSubj.name;
        if (classLinkInput) classLinkInput.value = targetSubj.link;
        if (scheduleClassSelect) scheduleClassSelect.value = targetSubj.id;
        setScheduleDuration(targetSubj.defaultDuration || 60);
      } else {
        if (classNameInput) classNameInput.value = '';
        if (classLinkInput) classLinkInput.value = '';
        setScheduleDuration(60);
      }

      const targetDay = day && day !== 'all' ? day.toLowerCase().slice(0, 3) : null;
      document.querySelectorAll('input[name="sched_day"]').forEach((cb) => {
        if (targetDay) {
          cb.checked = cb.value === targetDay;
        } else {
          cb.checked = ['mon', 'tue', 'wed', 'thu', 'fri'].includes(cb.value);
        }
      });

      setScheduleTime('10:00');
    }

    let currentLink = (classLinkInput?.value || '').trim();
    if (currentLink && !currentLink.startsWith('http://') && !currentLink.startsWith('https://')) {
      currentLink = 'https://' + currentLink;
    }
    if (scheduleLinkTestBtn) scheduleLinkTestBtn.href = currentLink || '#';

    updateSchedulePreviewSummary();
    if (classModal) {
      classModal.style.display = 'flex';
      const modalWin = classModal.querySelector('.modal-window');
      if (modalWin) modalWin.scrollTop = 0;
    }
  };

  const closeModal = () => {
    if (classModal) classModal.style.display = 'none';
  };
  window.closeModal = closeModal;

  btnOpenAddModal?.addEventListener('click', () => openScheduleModal(currentDayFilter));
  btnCloseModal?.addEventListener('click', closeModal);
  btnCancelModal?.addEventListener('click', closeModal);
  classModal?.addEventListener('click', (e) => {
    if (e.target === classModal) closeModal();
  });

  btnQuickManageSubjects?.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

    const subjTab = document.querySelector('.tab-btn[data-tab="subjects"]');
    const subjSection = document.getElementById('tab-subjects');
    if (subjTab) subjTab.classList.add('active');
    if (subjSection) subjSection.classList.add('active');
    fetchSubjects();
  });

  btnModalManageClasses?.addEventListener('click', () => {
    closeModal();
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

    const subjTab = document.querySelector('.tab-btn[data-tab="subjects"]');
    const subjSection = document.getElementById('tab-subjects');
    if (subjTab) subjTab.classList.add('active');
    if (subjSection) subjSection.classList.add('active');
    openSubjectEditor();
  });

  // Save / Submit Class Form
  classForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const subjectName = (classNameInput?.value || '').trim();
    let meetLink = (classLinkInput?.value || '').trim();
    const timeVal = scheduleTimeNative?.value || '10:00';
    const durationVal = parseInt(scheduleDurationInput?.value || '60', 10);
    const enabledVal = classEnabledInput?.checked !== false;

    if (!subjectName) {
      showToast('Please enter a class / meeting name.', 'error');
      classNameInput?.focus();
      return;
    }

    if (!meetLink) {
      showToast('Please enter a Google Meet link.', 'error');
      classLinkInput?.focus();
      return;
    }

    // Auto-prepend https:// if missing
    if (!meetLink.startsWith('http://') && !meetLink.startsWith('https://')) {
      meetLink = 'https://' + meetLink;
    }

    if (!meetLink.toLowerCase().includes('meet.google.com')) {
      showToast('Please enter a valid Google Meet link (e.g. https://meet.google.com/abc-defg-hij)', 'error');
      classLinkInput?.focus();
      return;
    }

    const checkedDays = Array.from(document.querySelectorAll('input[name="sched_day"]:checked')).map((cb) => cb.value);
    if (checkedDays.length === 0) {
      showToast('Please select at least one day of the week.', 'error');
      return;
    }

    const payload = {
      id: isEditingId || undefined,
      name: subjectName,
      link: meetLink,
      days: checkedDays,
      time: timeVal,
      duration: durationVal,
      enabled: enabledVal,
    };

    try {
      const res = await fetch('/api/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      // If sync to catalog is checked, register/update in subjects directory too
      if (classSyncCatalog?.checked) {
        try {
          await fetch('/api/subjects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: subjectName,
              link: meetLink,
              defaultDuration: durationVal,
            }),
          });
        } catch (syncErr) {
          console.warn('[App] Could not sync to catalog:', syncErr);
        }
      }

      showToast(isEditingId ? `Changes to "${subjectName}" saved!` : `Class "${subjectName}" scheduled!`);
      closeModal();
      await fetchTimetable();
      await fetchSubjects();
      await fetchStatus();
    } catch (err) {
      showToast(err.message || 'Failed to save class schedule', 'error');
    }
  });

  // Global window functions for cards
  window.toggleActiveClass = async function (id) {
    try {
      const res = await fetch(`/api/timetable/${id}/toggle`, { method: 'PATCH' });
      const data = await res.json();
      if (data.ok) {
        showToast(`"${data.class.name}" ${data.class.enabled ? 'enabled' : 'disabled'}`);
        await fetchTimetable();
        await fetchStatus();
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
        await fetchTimetable();
        await fetchStatus();
      }
    } catch {}
  };

  window.duplicateClass = function (id) {
    const item = timetableData.find((c) => c.id === id);
    if (!item) return;
    openScheduleModal(currentDayFilter, null, item, true);
  };

  window.editClass = function (id) {
    const item = timetableData.find((c) => c.id === id);
    if (!item) return;
    openScheduleModal(null, null, item, false);
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

  // Initial load & periodic polling
  fetchStatus();
  fetchSubjects();
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

      // Windows startup status
      await fetchStartupStatus();
    } catch {}
  }

  // Fetch Windows Auto-Startup Status
  async function fetchStartupStatus() {
    try {
      const res = await fetch('/api/startup');
      const data = await res.json();
      const badge = document.getElementById('startup-status-badge');
      const desc = document.getElementById('startup-status-desc');
      const btn = document.getElementById('btn-toggle-startup');
      if (!badge || !desc || !btn) return;

      if (data.enabled) {
        badge.textContent = 'Active (Starts on Boot)';
        badge.className = 'badge-success';
        desc.textContent = 'Bot launches automatically in the background when your PC boots.';
        btn.textContent = 'Disable Auto-Start';
        btn.className = 'btn-secondary btn-sm';
      } else {
        badge.textContent = 'Disabled';
        badge.className = 'badge-neutral';
        desc.textContent = 'Bot does not launch on PC boot. Start manually when needed.';
        btn.textContent = 'Enable Auto-Start';
        btn.className = 'btn-primary btn-sm';
      }
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

  // Toggle Windows Auto-Startup
  const btnToggleStartup = document.getElementById('btn-toggle-startup');
  btnToggleStartup?.addEventListener('click', async () => {
    btnToggleStartup.disabled = true;
    try {
      showToast('Updating Windows startup configuration...');
      const res = await fetch('/api/startup/toggle', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        showToast(data.message || (data.enabled ? 'Enabled auto-startup on boot!' : 'Disabled auto-startup'));
        await fetchStartupStatus();
      } else {
        showToast(data.error || 'Failed to toggle startup', 'error');
      }
    } catch {
      showToast('Error toggling startup configuration', 'error');
    } finally {
      btnToggleStartup.disabled = false;
    }
  });
});
