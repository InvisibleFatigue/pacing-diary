// storage.js — thin wrapper around localStorage.
// All data is keyed under a single namespace so it is easy to back up,
// restore, and clear without affecting anything else in the browser.

const STORAGE_KEY = 'invisiblefatigue.pacing-diary.v1';

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: {}, hours: {}, settings: {}, meta: { created: new Date().toISOString() } };
    const parsed = JSON.parse(raw);
    if (!parsed.entries) parsed.entries = {};
    if (!parsed.hours) parsed.hours = {};
    if (!parsed.settings) parsed.settings = {};
    if (!parsed.meta) parsed.meta = { created: new Date().toISOString() };
    return parsed;
  } catch (err) {
    console.error('Could not read storage:', err);
    return { entries: {}, hours: {}, settings: {}, meta: { created: new Date().toISOString() } };
  }
}

function write(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('Could not write storage:', err);
    return false;
  }
}

export function getAllEntries() {
  const data = read();
  return data.entries;
}

export function getEntriesArray() {
  const entries = getAllEntries();
  return Object.values(entries).sort((a, b) => a.date.localeCompare(b.date));
}

export function getEntry(date) {
  const entries = getAllEntries();
  return entries[date] || null;
}

export function saveEntry(entry) {
  if (!entry || !entry.date) throw new Error('Entry must have a date.');
  const data = read();
  data.entries[entry.date] = {
    ...entry,
    updated: new Date().toISOString(),
  };
  return write(data);
}

export function deleteEntry(date) {
  const data = read();
  delete data.entries[date];
  return write(data);
}

// ── Hourly activity chart ────────────────────────────────────────
// Stored separately from entries (keyed by date → array of 24 values:
// 0 sleep, 1 rest, 2 low, 3 high, 4 medium, or null). Kept out of `entries` on
// purpose so painted-only days don't skew the activity/symptom averages.

export function getAllHours() {
  return read().hours || {};
}

export function getHours(date) {
  const hours = read().hours || {};
  return hours[date] || null;
}

export function saveHours(date, hours) {
  const data = read();
  if (!data.hours) data.hours = {};
  const hasAny = Array.isArray(hours) && hours.some(v => v !== null && v !== undefined);
  if (hasAny) {
    data.hours[date] = hours;
  } else {
    delete data.hours[date]; // prune fully-cleared days
  }
  return write(data);
}

// ── Settings (small UI preferences, kept with the diary so backups carry them) ──
export function getSetting(key, fallback) {
  const settings = read().settings || {};
  return key in settings ? settings[key] : fallback;
}

export function setSetting(key, value) {
  const data = read();
  if (!data.settings) data.settings = {};
  data.settings[key] = value;
  return write(data);
}

export function exportAll() {
  return read();
}

export function importAll(payload) {
  // Defensive: ensure structure before writing
  if (!payload || typeof payload !== 'object') throw new Error('Invalid backup file.');
  if (!payload.entries || typeof payload.entries !== 'object') {
    throw new Error('Backup file is missing entries.');
  }
  // Merge rather than overwrite — gives users back their data without
  // accidentally wiping anything newer they have on this device.
  const current = read();
  const merged = {
    ...current,
    entries: { ...current.entries, ...payload.entries },
    hours: { ...(current.hours || {}), ...(payload.hours || {}) },
    settings: { ...(current.settings || {}), ...(payload.settings || {}) },
    meta: payload.meta || current.meta,
  };
  return write(merged);
}

export function clearAll() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (err) {
    console.error('Could not clear storage:', err);
    return false;
  }
}
