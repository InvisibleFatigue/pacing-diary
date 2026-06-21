// week.js — weekly hourly activity chart (7 days × 24 hours).
// Tap or drag to "paint" each hour as Sleep / Rest / Low / High activity.
// The classic ME/CFS activity-diary view, for spotting the shape of a week
// at a glance. Hourly data is stored separately from daily entries.

import { getHours, saveHours } from './storage.js';

// Stored codes are stable: 0 sleep, 1 rest, 2 low, 3 high, 4 medium.
// Medium was added later as code 4 (not inserted at 3) so existing "high"
// cells keep their meaning. Array order is the display/brush order.
const CATS = [
  { v: 0, label: 'Sleep',  color: 'var(--act-sleep)'  },
  { v: 1, label: 'Rest',   color: 'var(--act-rest)'   },
  { v: 2, label: 'Low',    color: 'var(--act-low)'    },
  { v: 4, label: 'Medium', color: 'var(--act-medium)' },
  { v: 3, label: 'High',   color: 'var(--act-high)'   },
];
const ERASE = -1;
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const $ = (sel, root = document) => root.querySelector(sel);

let brush = 1;        // default brush: Rest
let weekStart = null; // Date (UTC midnight) of the displayed Monday

// ── Date helpers (mirrors app.js: local "today", UTC for date maths) ──
function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function isoOf(d) { return d.toISOString().slice(0, 10); }
function parseIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function mondayOf(iso) {
  const d = parseIso(iso);
  const offset = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}
function addDays(d, n) { const c = new Date(d); c.setUTCDate(d.getUTCDate() + n); return c; }
function catColor(v) { const c = CATS.find(c => c.v === v); return c ? c.color : ''; }
function catLabel(v) { const c = CATS.find(c => c.v === v); return c ? c.label : 'cleared'; }
function formatHour(h) { const ap = h < 12 ? 'am' : 'pm'; let hr = h % 12; if (hr === 0) hr = 12; return `${hr}${ap}`; }

// ── Brushes ──────────────────────────────────────────────────────
function buildBrushes() {
  const wrap = $('#week-brushes');
  wrap.innerHTML = '';
  [...CATS, { v: ERASE, label: 'Erase', color: null }].forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'brush';
    b.dataset.brush = String(c.v);
    b.setAttribute('aria-pressed', c.v === brush ? 'true' : 'false');
    const sw = c.color
      ? `<span class="brush-sw" style="background:${c.color}"></span>`
      : `<span class="brush-sw brush-sw-erase"></span>`;
    b.innerHTML = `${sw}<span>${c.label}</span>`;
    b.addEventListener('click', () => { brush = c.v; syncBrushes(); });
    wrap.appendChild(b);
  });
}
function syncBrushes() {
  document.querySelectorAll('#week-brushes .brush').forEach(b => {
    b.setAttribute('aria-pressed', Number(b.dataset.brush) === brush ? 'true' : 'false');
  });
}

// ── Render ───────────────────────────────────────────────────────
export function renderWeek() {
  if (!weekStart) weekStart = mondayOf(todayIso());

  const sun = addDays(weekStart, 6);
  const fmt = d => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  $('#week-range').textContent = `${fmt(weekStart)} – ${fmt(sun)}`;
  $('#week-next').disabled = weekStart.getTime() >= mondayOf(todayIso()).getTime();

  const today = todayIso();
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const iso = isoOf(d);
    const hrs = getHours(iso);
    const isToday = iso === today;
    let cells = '';
    for (let h = 0; h < 24; h++) {
      const v = hrs ? hrs[h] : null;
      const style = (v == null) ? '' : ` style="background:${catColor(v)}"`;
      cells += `<button type="button" class="wk-cell" data-date="${iso}" data-h="${h}"${style} aria-label="${WD[i]} ${formatHour(h)}, ${catLabel(v == null ? null : v)}"></button>`;
    }
    html += `<div class="wk-row${isToday ? ' is-today' : ''}">
      <div class="wk-label">${WD[i]}<span>${d.getUTCDate()}</span></div>
      <div class="wk-cells">${cells}</div>
    </div>`;
  }
  $('#week-grid').innerHTML = html;
  updateTally();
}

function updateTally() {
  const counts = {};
  CATS.forEach(c => { counts[c.v] = 0; });
  for (let i = 0; i < 7; i++) {
    const hrs = getHours(isoOf(addDays(weekStart, i)));
    if (hrs) hrs.forEach(v => { if (v != null && counts[v] !== undefined) counts[v]++; });
  }
  $('#week-tally').innerHTML = CATS.map(c =>
    `<span class="wk-tally-item"><i style="background:${c.color}"></i>${c.label} ${counts[c.v]}h</span>`
  ).join('');
}

// ── Painting (tap, drag, and keyboard via click) ─────────────────
function paintCell(target) {
  const cell = target && target.closest ? target.closest('.wk-cell') : null;
  if (!cell) return false;
  const date = cell.dataset.date;
  const h = Number(cell.dataset.h);
  const existing = getHours(date);
  const hrs = existing ? existing.slice() : new Array(24).fill(null);
  const value = brush === ERASE ? null : brush;
  hrs[h] = value;
  saveHours(date, hrs);
  cell.style.background = value == null ? '' : catColor(value);
  cell.setAttribute('aria-label', cell.getAttribute('aria-label').replace(/,[^,]*$/, `, ${catLabel(value)}`));
  return true;
}

function bindPainting() {
  const grid = $('#week-grid');
  let painting = false;

  // Click handles a simple tap and keyboard activation (Enter/Space on the button).
  grid.addEventListener('click', (e) => { if (!painting) { paintCell(e.target); updateTally(); } });

  grid.addEventListener('pointerdown', (e) => {
    if (paintCell(e.target)) { painting = true; e.preventDefault(); }
  });
  window.addEventListener('pointermove', (e) => {
    if (!painting) return;
    if (paintCell(document.elementFromPoint(e.clientX, e.clientY))) e.preventDefault();
  });
  window.addEventListener('pointerup', () => { if (painting) { painting = false; updateTally(); } });
}

// ── Navigation ───────────────────────────────────────────────────
function shiftWeek(deltaDays) {
  const next = addDays(weekStart, deltaDays);
  if (next.getTime() > mondayOf(todayIso()).getTime()) return; // no future weeks
  weekStart = next;
  renderWeek();
}

function clearWeek() {
  if (!confirm('Clear all painted hours for this week?')) return;
  for (let i = 0; i < 7; i++) saveHours(isoOf(addDays(weekStart, i)), new Array(24).fill(null));
  renderWeek();
}

export function initWeek() {
  buildBrushes();
  $('#week-prev').addEventListener('click', () => shiftWeek(-7));
  $('#week-next').addEventListener('click', () => shiftWeek(7));
  $('#week-clear').addEventListener('click', clearWeek);
  bindPainting();
}
