/**
 * backend/src/models/subjectModel.js
 * Model managing subjects/classes directory (variety of classes with Meet links)
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');

const PALETTE_COLORS = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Rose
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
  '#14b8a6', // Teal
];

/**
 * Loads all predefined class varieties / subjects from subjects.json
 * @returns {Array}
 */
function loadSubjects() {
  const filePath = config.SUBJECTS_FILE;

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch (e) {
      console.error(`[SubjectModel] Error reading ${filePath}:`, e.message);
    }
  }

  // Auto-seed from existing timetable or default subjects (Advance Engineering Math, Robotics)
  const initialSubjects = [];
  try {
    const timetableRaw = fs.existsSync(config.TIMETABLE_FILE)
      ? fs.readFileSync(config.TIMETABLE_FILE, 'utf-8')
      : '[]';
    const timetable = JSON.parse(timetableRaw);

    const seenNames = new Set();
    timetable.forEach((item, index) => {
      const name = (item.name || '').trim();
      if (name && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        initialSubjects.push({
          id: `subj-${Date.now()}-${index}`,
          name: name,
          link: item.link || '',
          color: PALETTE_COLORS[initialSubjects.length % PALETTE_COLORS.length],
          defaultDuration: item.duration || 60,
        });
      }
    });
  } catch {}

  // If still empty or only 1 item, seed helpful user examples (Advance Engineering Math, Robotics)
  if (initialSubjects.length === 0) {
    initialSubjects.push(
      {
        id: `subj-1`,
        name: 'Advance Engineering Math',
        link: 'https://meet.google.com/oqn-fqdh-stc',
        color: '#6366f1',
        defaultDuration: 60,
      },
      {
        id: `subj-2`,
        name: 'Robotics',
        link: 'https://meet.google.com/abc-defg-hij',
        color: '#ec4899',
        defaultDuration: 60,
      }
    );
  } else if (!initialSubjects.some((s) => s.name.toLowerCase().includes('robotics'))) {
    initialSubjects.push({
      id: `subj-robotics`,
      name: 'Robotics',
      link: 'https://meet.google.com/rob-otic-bot',
      color: '#ec4899',
      defaultDuration: 60,
    });
  }

  saveSubjects(initialSubjects);
  return initialSubjects;
}

/**
 * Persists subjects list to subjects.json
 * @param {Array} data
 * @returns {Array}
 */
function saveSubjects(data) {
  try {
    fs.writeFileSync(config.SUBJECTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[SubjectModel] Failed writing subjects file:`, err.message);
  }
  return data;
}

/**
 * Adds or updates a class variety / subject
 * @param {object} subjectData
 * @returns {object}
 */
function addOrUpdateSubject(subjectData) {
  const subjects = loadSubjects();
  const name = (subjectData.name || '').trim();
  const link = (subjectData.link || '').trim();

  if (!name) {
    throw new Error('Class/Subject name is required.');
  }

  const id = subjectData.id || `subj-${Date.now()}`;
  const existingIdx = subjects.findIndex((s) => s.id === id);

  const color =
    subjectData.color ||
    (existingIdx >= 0 && subjects[existingIdx].color
      ? subjects[existingIdx].color
      : PALETTE_COLORS[subjects.length % PALETTE_COLORS.length]);

  const defaultDuration = parseInt(subjectData.defaultDuration || '60', 10) || 60;

  const subject = {
    id,
    name,
    link,
    color,
    defaultDuration,
  };

  const oldName = existingIdx >= 0 ? subjects[existingIdx].name : null;

  if (existingIdx >= 0) {
    subjects[existingIdx] = subject;
  } else {
    subjects.push(subject);
  }

  saveSubjects(subjects);

  // Synchronize changes to timetable if class name or link was modified
  if (oldName || link) {
    try {
      const { loadTimetable, saveTimetable } = require('./timetableModel');
      const timetable = loadTimetable();
      let changed = false;

      timetable.forEach((item) => {
        if (
          (oldName && item.name && item.name.trim().toLowerCase() === oldName.trim().toLowerCase()) ||
          (item.name && item.name.trim().toLowerCase() === name.trim().toLowerCase())
        ) {
          if (oldName && oldName !== name) item.name = name;
          if (link && item.link !== link) item.link = link;
          changed = true;
        }
      });

      if (changed) {
        saveTimetable(timetable);
      }
    } catch (e) {
      console.warn('[SubjectModel] Could not sync changes to timetable:', e.message);
    }
  }

  return subject;
}

/**
 * Removes a subject by ID
 * @param {string} id
 * @returns {Array} Updated subjects list
 */
function deleteSubject(id) {
  const subjects = loadSubjects();
  const filtered = subjects.filter((s) => s.id !== id);
  saveSubjects(filtered);
  return filtered;
}

/**
 * Retrieves a subject by ID or name
 * @param {string} idOrName
 * @returns {object|null}
 */
function findSubject(idOrName) {
  if (!idOrName) return null;
  const subjects = loadSubjects();
  const query = idOrName.trim().toLowerCase();
  return (
    subjects.find(
      (s) => s.id === idOrName || (s.name && s.name.trim().toLowerCase() === query)
    ) || null
  );
}

module.exports = {
  loadSubjects,
  saveSubjects,
  addOrUpdateSubject,
  deleteSubject,
  findSubject,
  PALETTE_COLORS,
};
