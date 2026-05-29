// export.js — CSV / JSON / PDF export for the diary.
// PDF uses jsPDF (loaded via CDN in index.html).

import { getEntriesArray, exportAll } from './storage.js';

const FIELDS = [
  ['date', 'Date'],
  ['activityLevel', 'Activity level'],
  ['uprightHours', 'Hours upright'],
  ['activityNotes', 'Activities and notes'],
  ['symFatigue', 'Fatigue'],
  ['symPem', 'PEM / crash intensity'],
  ['symPain', 'Pain'],
  ['symCognitive', 'Cognitive (brain fog)'],
  ['symOrthostatic', 'Orthostatic'],
  ['symSensory', 'Sensory sensitivity'],
  ['sleepHours', 'Sleep hours'],
  ['sleepQuality', 'Sleep quality'],
  ['restingHr', 'Resting heart rate'],
  ['notes', 'Free notes'],
];

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv() {
  const entries = getEntriesArray();
  if (entries.length === 0) {
    alert('No entries to export yet.');
    return;
  }

  const header = FIELDS.map(([, label]) => csvEscape(label)).join(',');
  const rows = entries.map(e =>
    FIELDS.map(([key]) => csvEscape(e[key])).join(',')
  );
  const csv = [header, ...rows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `pacing-diary-${date}.csv`);
}

export function exportJsonBackup() {
  const data = exportAll();
  const payload = {
    ...data,
    exportedAt: new Date().toISOString(),
    source: 'invisiblefatigue.com pacing diary',
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `pacing-diary-backup-${date}.json`);
}

function formatLongDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
}

export function exportPdfSummary(days = 30) {
  // Wait for jsPDF to be available (loaded via CDN with `defer`).
  if (typeof window.jspdf === 'undefined') {
    alert('PDF library is still loading. Please try again in a moment.');
    return;
  }

  const all = getEntriesArray();
  if (all.length === 0) {
    alert('No entries to summarise yet.');
    return;
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const entries = all.filter(e => e.date >= cutoffIso);

  if (entries.length === 0) {
    alert('No entries in that period. Try a longer range.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 48;
  let y = 56;

  // Header
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 104, 98);
  doc.text('Pacing diary summary · Invisible Fatigue', marginX, y);
  doc.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), pageW - marginX, y, { align: 'right' });
  y += 14;

  doc.setDrawColor(216, 210, 197);
  doc.line(marginX, y, pageW - marginX, y);
  y += 22;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(31, 31, 27);
  doc.text(`Summary of the last ${days} days`, marginX, y);
  y += 24;

  // Averages block
  const avg = (key) => (entries.reduce((s, e) => s + Number(e[key] ?? 0), 0) / entries.length).toFixed(1);
  const highActivityDays = entries.filter(e => Number(e.activityLevel ?? 0) >= 7).length;
  const highSymptomDays = entries.filter(e => Math.max(Number(e.symFatigue ?? 0), Number(e.symPem ?? 0)) >= 7).length;
  const avgSleepHours = entries.filter(e => e.sleepHours).reduce((s, e) => s + Number(e.sleepHours), 0) / Math.max(1, entries.filter(e => e.sleepHours).length);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(74, 72, 66);

  const lines = [
    `Entries logged: ${entries.length}`,
    `Average activity level: ${avg('activityLevel')} / 10`,
    `Average fatigue: ${avg('symFatigue')} / 10 · Average PEM intensity: ${avg('symPem')} / 10`,
    `Average pain: ${avg('symPain')} · Average cognitive symptoms: ${avg('symCognitive')}`,
    `Days with activity 7 or higher: ${highActivityDays}`,
    `Days with peak symptoms 7 or higher: ${highSymptomDays}`,
    `Average sleep: ${isNaN(avgSleepHours) ? 'not logged' : avgSleepHours.toFixed(1) + ' hours'}`,
  ];

  lines.forEach(line => {
    doc.text(line, marginX, y);
    y += 16;
  });

  y += 8;

  // Daily entries table heading
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(31, 31, 27);
  doc.text('Daily entries', marginX, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 104, 98);

  // Column layout
  const cols = [
    { label: 'Date', x: marginX, w: 110 },
    { label: 'Act.', x: marginX + 112, w: 30 },
    { label: 'Fat.', x: marginX + 144, w: 30 },
    { label: 'PEM', x: marginX + 176, w: 30 },
    { label: 'Pain', x: marginX + 208, w: 30 },
    { label: 'Cog.', x: marginX + 240, w: 30 },
    { label: 'Sleep', x: marginX + 272, w: 40 },
    { label: 'Notes', x: marginX + 316, w: pageW - marginX - (marginX + 316) },
  ];

  cols.forEach(c => doc.text(c.label, c.x, y));
  y += 6;
  doc.setDrawColor(216, 210, 197);
  doc.line(marginX, y, pageW - marginX, y);
  y += 12;

  doc.setTextColor(31, 31, 27);
  doc.setFontSize(9);

  // Most recent first for the table
  const tableEntries = [...entries].reverse();

  for (const e of tableEntries) {
    if (y > pageH - 60) {
      doc.addPage();
      y = 56;
      // Re-render heading row
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(107, 104, 98);
      cols.forEach(c => doc.text(c.label, c.x, y));
      y += 6;
      doc.line(marginX, y, pageW - marginX, y);
      y += 12;
      doc.setTextColor(31, 31, 27);
    }

    const dateLabel = formatLongDate(e.date);
    doc.text(dateLabel, cols[0].x, y);
    doc.text(String(e.activityLevel ?? '—'), cols[1].x, y);
    doc.text(String(e.symFatigue ?? '—'), cols[2].x, y);
    doc.text(String(e.symPem ?? '—'), cols[3].x, y);
    doc.text(String(e.symPain ?? '—'), cols[4].x, y);
    doc.text(String(e.symCognitive ?? '—'), cols[5].x, y);
    doc.text(e.sleepHours ? `${e.sleepHours}h` : '—', cols[6].x, y);

    const noteText = (e.activityNotes || e.notes || '').replace(/\s+/g, ' ').trim();
    if (noteText) {
      const wrapped = doc.splitTextToSize(noteText, cols[7].w);
      doc.text(wrapped, cols[7].x, y);
      y += Math.max(14, wrapped.length * 11);
    } else {
      y += 14;
    }
  }

  // Footer note on last page
  if (y > pageH - 80) { doc.addPage(); y = 56; }
  y += 10;
  doc.setDrawColor(216, 210, 197);
  doc.line(marginX, y, pageW - marginX, y);
  y += 16;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(107, 104, 98);
  doc.text('All ratings on a 0–10 scale. Generated from self-reported entries. Not a diagnostic record.', marginX, y);

  doc.save(`pacing-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
}
