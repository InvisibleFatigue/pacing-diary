// app.js — entry point. Handles tab routing, form binding, history calendar,
// and pattern rendering. Imports the focused modules for storage, charts,
// patterns, and export.

import { saveEntry, getEntry, deleteEntry, importAll, clearAll, getEntriesArray } from './storage.js';
import { detectPemEvents, summarisePatterns } from './patterns.js';
import { renderTrendChart, renderTrendSummary } from './charts.js';
import { exportCsv, exportJsonBackup, exportPdfSummary } from './export.js';

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function todayIso() {
  const now = new Date();
  // Honour the user's local date, not UTC. Otherwise people just after
  // midnight in UK winter could see the wrong day.
  const offsetMin = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offsetMin * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatLongDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function activityWord(n) {
  const map = ['rest day', 'very low', 'low', 'gentle', 'moderate-low', 'moderate', 'moderate-high', 'high', 'over baseline', 'well over', 'crash territory'];
  return map[n] ?? '';
}

// ───────────────────────────────────────────────────────────────
// Routing
// ───────────────────────────────────────────────────────────────

function showView(name) {
  $$('.view').forEach(v => v.hidden = v.dataset.view !== name);
  $$('.primary-nav [role="tab"]').forEach(b => {
    b.setAttribute('aria-selected', b.dataset.view === name ? 'true' : 'false');
  });
  // Lazy-render the heavier views on entry
  if (name === 'history') renderHistory();
  if (name === 'patterns') renderPatterns();
  if (name === 'trends') renderTrends();
  // Scroll back to top for clarity on small screens
  window.scrollTo({ top: 0, behavior: 'instant' });
  $('#main').focus({ preventScroll: true });
}

function initRouting() {
  $$('.primary-nav [role="tab"]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });
}

// ───────────────────────────────────────────────────────────────
// Today / entry form
// ───────────────────────────────────────────────────────────────

const READOUT_BINDINGS = [
  { input: '#activity-level', readout: '#activity-readout', formatter: v => `${v} — ${activityWord(Number(v))}` },
  { input: '#sym-fatigue', readout: '#sym-fatigue-readout' },
  { input: '#sym-pem', readout: '#sym-pem-readout' },
  { input: '#sym-pain', readout: '#sym-pain-readout' },
  { input: '#sym-cognitive', readout: '#sym-cognitive-readout' },
  { input: '#sym-orthostatic', readout: '#sym-orthostatic-readout' },
  { input: '#sym-sensory', readout: '#sym-sensory-readout' },
  { input: '#sleep-quality', readout: '#sleep-quality-readout' },
];

function refreshReadouts() {
  READOUT_BINDINGS.forEach(({ input, readout, formatter }) => {
    const el = $(input);
    const out = $(readout);
    if (!el || !out) return;
    out.textContent = formatter ? formatter(el.value) : el.value;
  });
}

function bindRangeReadouts() {
  READOUT_BINDINGS.forEach(({ input, readout, formatter }) => {
    const el = $(input);
    const out = $(readout);
    if (!el || !out) return;
    el.addEventListener('input', () => {
      out.textContent = formatter ? formatter(el.value) : el.value;
    });
  });
  refreshReadouts();
}

function fillFormFromEntry(entry) {
  $('#activity-level').value = entry.activityLevel ?? 5;
  $('#activity-notes').value = entry.activityNotes ?? '';
  $('#upright-hours').value = entry.uprightHours ?? '';
  $('#sym-fatigue').value = entry.symFatigue ?? 5;
  $('#sym-pem').value = entry.symPem ?? 0;
  $('#sym-pain').value = entry.symPain ?? 0;
  $('#sym-cognitive').value = entry.symCognitive ?? 0;
  $('#sym-orthostatic').value = entry.symOrthostatic ?? 0;
  $('#sym-sensory').value = entry.symSensory ?? 0;
  $('#sleep-hours').value = entry.sleepHours ?? '';
  $('#sleep-quality').value = entry.sleepQuality ?? 5;
  $('#resting-hr').value = entry.restingHr ?? '';
  $('#general-notes').value = entry.notes ?? '';
  // Trigger readouts
  refreshReadouts();
}

function resetForm() {
  $('#entry-form').reset();
  $('#entry-date').value = todayIso();
  refreshReadouts();
  refreshDateStatus();
}

function refreshDateStatus() {
  const date = $('#entry-date').value;
  const existing = getEntry(date);
  const status = $('#date-status');
  if (!date) { status.textContent = ''; return; }

  if (existing) {
    status.textContent = `An entry already exists for ${formatLongDate(date)}. Saving will update it.`;
    fillFormFromEntry(existing);
  } else {
    status.textContent = date === todayIso()
      ? 'A fresh entry for today.'
      : `No entry for ${formatLongDate(date)} yet.`;
  }
}

function bindEntryForm() {
  $('#entry-date').value = todayIso();
  refreshDateStatus();

  $('#entry-date').addEventListener('change', refreshDateStatus);

  $('#reset-form').addEventListener('click', () => {
    resetForm();
    $('#save-status').textContent = '';
  });

  $('#entry-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const date = $('#entry-date').value;
    if (!date) {
      $('#save-status').textContent = 'Please choose a date.';
      return;
    }

    const entry = {
      date,
      activityLevel: Number($('#activity-level').value),
      activityNotes: $('#activity-notes').value.trim(),
      uprightHours: $('#upright-hours').value ? Number($('#upright-hours').value) : null,
      symFatigue: Number($('#sym-fatigue').value),
      symPem: Number($('#sym-pem').value),
      symPain: Number($('#sym-pain').value),
      symCognitive: Number($('#sym-cognitive').value),
      symOrthostatic: Number($('#sym-orthostatic').value),
      symSensory: Number($('#sym-sensory').value),
      sleepHours: $('#sleep-hours').value ? Number($('#sleep-hours').value) : null,
      sleepQuality: Number($('#sleep-quality').value),
      restingHr: $('#resting-hr').value ? Number($('#resting-hr').value) : null,
      notes: $('#general-notes').value.trim(),
    };

    const ok = saveEntry(entry);
    if (ok) {
      $('#save-status').textContent = `Saved for ${formatLongDate(date)}.`;
    } else {
      $('#save-status').textContent = 'Could not save. Your browser may have storage disabled.';
    }
  });
}

// ───────────────────────────────────────────────────────────────
// History calendar
// ───────────────────────────────────────────────────────────────

let historyMonthOffset = 0; // 0 = current month, -1 = previous, etc.

function monthLabel(offset) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function renderHistory() {
  const grid = $('#history-grid');
  const range = $('#hist-range');
  range.textContent = monthLabel(historyMonthOffset);

  // Compute month boundaries
  const today = new Date();
  today.setUTCHours(0,0,0,0);
  const view = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + historyMonthOffset, 1));
  const year = view.getUTCFullYear();
  const month = view.getUTCMonth();
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Mon = 0
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const entries = getEntriesArray();
  const byDate = new Map(entries.map(e => [e.date, e]));
  const pemDates = new Set(detectPemEvents().map(ev => ev.eventDate));

  let html = '';
  // Weekday header
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d => {
    html += `<div class="history-day is-empty" aria-hidden="true" style="cursor:default;background:transparent;font-weight:500;color:var(--ink-quiet)">${d}</div>`;
  });
  // Leading blanks
  for (let i = 0; i < firstWeekday; i++) {
    html += `<div class="history-day is-empty" aria-hidden="true"></div>`;
  }
  // Days
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = byDate.get(iso);
    const hasEntry = !!entry;
    const isPem = pemDates.has(iso);
    const isToday = iso === todayIso();
    const fillPct = hasEntry ? Math.round((Number(entry.activityLevel ?? 0) / 10) * 100) : 0;
    const classes = [
      'history-day',
      hasEntry ? 'has-entry' : '',
      isPem ? 'has-pem' : '',
      isToday ? 'is-today' : '',
    ].filter(Boolean).join(' ');

    const ariaLabel = hasEntry
      ? `${formatLongDate(iso)}. Activity ${entry.activityLevel}. ${isPem ? 'Likely PEM episode. ' : ''}Click to view.`
      : `${formatLongDate(iso)}. No entry. Click to log.`;

    html += `<button type="button" class="${classes}" data-date="${iso}" aria-label="${ariaLabel}">
      <span class="day-num">${day}</span>
      ${hasEntry ? `<span class="day-bar"><span class="day-bar-fill" style="width:${fillPct}%"></span></span>` : ''}
    </button>`;
  }

  grid.innerHTML = html;

  // Bind day clicks
  $$('.history-day[data-date]', grid).forEach(btn => {
    btn.addEventListener('click', () => showHistoryDetail(btn.dataset.date));
  });

  $('#history-detail').hidden = true;
}

function showHistoryDetail(date) {
  const entry = getEntry(date);
  const detail = $('#history-detail');

  if (!entry) {
    detail.innerHTML = `
      <h3>${formatLongDate(date)}</h3>
      <p>No entry for this day.</p>
      <div class="form-actions">
        <button type="button" class="btn btn-primary" id="detail-log">Log this day</button>
      </div>
    `;
    detail.hidden = false;
    $('#detail-log').addEventListener('click', () => {
      $('#entry-date').value = date;
      showView('today');
      refreshDateStatus();
    });
    return;
  }

  const rows = [
    ['Activity level', `${entry.activityLevel} / 10 (${activityWord(entry.activityLevel)})`],
    ['Activities', entry.activityNotes || '—'],
    ['Hours upright', entry.uprightHours != null ? `${entry.uprightHours}` : '—'],
    ['Fatigue', `${entry.symFatigue} / 10`],
    ['PEM / crash', `${entry.symPem} / 10`],
    ['Pain', `${entry.symPain} / 10`],
    ['Cognitive', `${entry.symCognitive} / 10`],
    ['Orthostatic', `${entry.symOrthostatic} / 10`],
    ['Sensory', `${entry.symSensory} / 10`],
    ['Sleep', entry.sleepHours ? `${entry.sleepHours} hours, quality ${entry.sleepQuality}/10` : '—'],
    ['Resting HR', entry.restingHr ? `${entry.restingHr} bpm` : '—'],
    ['Notes', entry.notes || '—'],
  ];

  detail.innerHTML = `
    <h3>${formatLongDate(date)}</h3>
    <dl class="detail-grid">
      ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(String(v))}</dd>`).join('')}
    </dl>
    <div class="form-actions">
      <button type="button" class="btn btn-quiet" id="detail-edit">Edit entry</button>
      <button type="button" class="btn btn-warning" id="detail-delete">Delete entry</button>
    </div>
  `;
  detail.hidden = false;

  $('#detail-edit').addEventListener('click', () => {
    $('#entry-date').value = date;
    showView('today');
    refreshDateStatus();
  });
  $('#detail-delete').addEventListener('click', () => {
    if (confirm(`Delete the entry for ${formatLongDate(date)}? This cannot be undone.`)) {
      deleteEntry(date);
      renderHistory();
    }
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function bindHistoryNav() {
  $('#hist-prev').addEventListener('click', () => { historyMonthOffset--; renderHistory(); });
  $('#hist-next').addEventListener('click', () => {
    if (historyMonthOffset < 0) { historyMonthOffset++; renderHistory(); }
  });
}

// ───────────────────────────────────────────────────────────────
// Patterns
// ───────────────────────────────────────────────────────────────

function renderPatterns() {
  const summary = summarisePatterns();
  const events = detectPemEvents();

  const summaryEl = $('#pattern-summary');
  const eventsEl = $('#pattern-events');

  if (summary.entryCount === 0) {
    summaryEl.innerHTML = `<p>No entries yet. Log a few days on the Today tab and patterns will start to appear here.</p>`;
    eventsEl.innerHTML = '';
    return;
  }

  if (summary.entryCount < 5) {
    summaryEl.innerHTML = `
      <p>You have logged <strong>${summary.entryCount}</strong> ${summary.entryCount === 1 ? 'entry' : 'entries'} so far.</p>
      <p>Pattern detection is more reliable with at least a week of data. Keep logging and the picture will sharpen.</p>
    `;
  } else {
    summaryEl.innerHTML = `
      <p>You have logged <strong>${summary.entryCount}</strong> entries over a span of <strong>${summary.daysCovered}</strong> days.</p>
      <p>Average activity ${summary.averageActivity} · Average fatigue ${summary.averageFatigue} · Average PEM ${summary.averagePem}.</p>
      <p>${events.length === 0
        ? 'No clear PEM patterns surfaced. That can mean stable pacing, or simply too little overlap between high activity and high symptoms in your data so far.'
        : `Found <strong>${events.length}</strong> possible PEM ${events.length === 1 ? 'episode' : 'episodes'} where elevated activity in the 24–72 hours before a high-symptom day stands out.`
      }</p>
    `;
  }

  if (events.length === 0) {
    eventsEl.innerHTML = '';
    return;
  }

  eventsEl.innerHTML = events.map(ev => {
    const triggerDays = ev.triggers.map(t => `day ${t.daysBefore}`).join(', ');
    const timeline = ev.window.map(w => {
      const cls = w.isEvent ? 'timeline-day is-event' : (w.isTrigger ? 'timeline-day is-trigger' : 'timeline-day');
      const valueLabel = w.isEvent
        ? `PEM ${w.pem ?? 0} · Fat ${w.fatigue ?? 0}`
        : (w.activity !== null ? `Act ${w.activity}` : 'no entry');
      return `<div class="${cls}">
        <div class="td-label">${w.offsetLabel}</div>
        <div class="td-value">${valueLabel}</div>
      </div>`;
    }).join('');

    return `
      <article class="pattern-event">
        <h3>${formatLongDate(ev.eventDate)} — PEM ${ev.pem}, fatigue ${ev.fatigue}</h3>
        <p class="event-meta">Elevated activity on ${triggerDays} before this day.</p>
        <div class="pattern-timeline">${timeline}</div>
      </article>
    `;
  }).join('');
}

// ───────────────────────────────────────────────────────────────
// Trends
// ───────────────────────────────────────────────────────────────

function renderTrends() {
  const range = Number($('#trend-range').value);
  renderTrendChart($('#trend-chart'), range);
  renderTrendSummary($('#trend-summary'), range);
}

function bindTrends() {
  $('#trend-range').addEventListener('change', renderTrends);
}

// ───────────────────────────────────────────────────────────────
// Export
// ───────────────────────────────────────────────────────────────

function bindExport() {
  $('#btn-csv').addEventListener('click', exportCsv);
  $('#btn-backup').addEventListener('click', exportJsonBackup);
  $('#btn-pdf').addEventListener('click', () => {
    const days = Number($('#pdf-range').value);
    exportPdfSummary(days);
  });
  $('#btn-clear').addEventListener('click', () => {
    if (!confirm('Permanently delete every entry on this device? This cannot be undone.')) return;
    if (!confirm('Are you sure? This is final.')) return;
    clearAll();
    alert('All entries deleted.');
    resetForm();
  });
  $('#file-restore').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const status = $('#restore-status');
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      importAll(payload);
      const count = Object.keys(payload.entries || {}).length;
      status.textContent = `Restored ${count} ${count === 1 ? 'entry' : 'entries'} from backup.`;
    } catch (err) {
      status.textContent = 'Could not restore that file. Is it a valid pacing-diary backup?';
    }
    e.target.value = '';
  });
}

// ───────────────────────────────────────────────────────────────
// Install to home screen (PWA)
// ───────────────────────────────────────────────────────────────

function bindInstall() {
  const card = $('#install-card');
  const btn = $('#btn-install');
  const hint = $('#install-hint');
  if (!card) return;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) {
    // Already installed — nothing to offer.
    return;
  }

  const ua = navigator.userAgent || '';
  const isIos = /iphone|ipad|ipod/i.test(ua);

  card.hidden = false;

  if (isIos) {
    hint.textContent = 'On iPhone or iPad: tap the Share button in Safari, then choose "Add to Home Screen".';
    return;
  }

  // Android / Chromium: capture the install prompt and show a button.
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
    hint.textContent = '';
  });

  btn.addEventListener('click', async () => {
    if (!deferred) {
      hint.textContent = 'Use your browser menu and choose "Install app" or "Add to home screen".';
      return;
    }
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    btn.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    card.hidden = true;
  });

  // Fallback hint if the browser never fires the prompt event.
  setTimeout(() => {
    if (btn.hidden && !isIos) {
      hint.textContent = 'If no button appears, use your browser menu and choose "Install app" or "Add to home screen".';
    }
  }, 1500);
}

// ───────────────────────────────────────────────────────────────
// Storage availability
// ───────────────────────────────────────────────────────────────

function checkStorage() {
  try {
    const k = '__pd_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
  } catch (err) {
    $('#save-status').textContent = 'Warning: this browser is blocking storage (private mode?). Entries will not be saved between visits.';
  }
}

// ───────────────────────────────────────────────────────────────
// Init
// ───────────────────────────────────────────────────────────────

function init() {
  initRouting();
  bindRangeReadouts();
  bindEntryForm();
  bindHistoryNav();
  bindTrends();
  bindExport();
  bindInstall();
  checkStorage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
