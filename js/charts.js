// charts.js — hand-rolled SVG line chart.
// No external chart library, so no extra weight and no surprise animations.
// Static SVG honours prefers-reduced-motion implicitly: nothing moves.

import { getEntriesArray } from './storage.js';

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatShortDate(d) {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function renderTrendChart(container, days = 30) {
  const all = getEntriesArray();
  if (all.length === 0) {
    container.innerHTML = '<p class="field-hint">No entries yet. Save an entry on the Today tab and your trends will appear here.</p>';
    return;
  }

  // Filter to requested range
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const entries = all.filter(e => e.date >= cutoffIso);

  if (entries.length === 0) {
    container.innerHTML = '<p class="field-hint">No entries in this period. Try a longer range.</p>';
    return;
  }

  // Chart dimensions
  const width = 800;
  const height = 320;
  const padding = { top: 24, right: 16, bottom: 48, left: 36 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const dates = entries.map(e => parseDate(e.date));
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const dateRange = Math.max(1, (maxDate - minDate) / (1000 * 60 * 60 * 24));

  const xFor = (d) => padding.left + ((parseDate(d) - minDate) / (1000 * 60 * 60 * 24)) / dateRange * innerW;
  const yFor = (v) => padding.top + (1 - (v / 10)) * innerH;

  const series = [
    { key: 'activityLevel', label: 'Activity', colour: '#6F8770' },
    { key: 'symFatigue', label: 'Fatigue', colour: '#4A4842' },
    { key: 'symPem', label: 'PEM', colour: '#B5705A' },
  ];

  // Build paths
  const paths = series.map(s => {
    const pts = entries.map(e => {
      const v = Number(e[s.key] ?? 0);
      return `${xFor(e.date).toFixed(1)},${yFor(v).toFixed(1)}`;
    });
    return { ...s, d: 'M' + pts.join(' L') };
  });

  // Y axis ticks: 0, 5, 10
  const yTicks = [0, 5, 10];

  // X axis ticks: first, mid, last
  const xTicks = entries.length <= 2
    ? entries
    : [entries[0], entries[Math.floor(entries.length / 2)], entries[entries.length - 1]];

  const legend = series.map(s =>
    `<span><span class="legend-swatch" style="background:${s.colour}"></span>${s.label}</span>`
  ).join('');

  const svg = `
    <div class="trend-legend">${legend}</div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Activity, fatigue, and PEM over the last ${days} days">
      <title>Activity, fatigue, and PEM over the last ${days} days</title>

      <!-- Y gridlines -->
      ${yTicks.map(t => `
        <line x1="${padding.left}" y1="${yFor(t)}" x2="${width - padding.right}" y2="${yFor(t)}"
              stroke="#E5DFD2" stroke-width="1" />
        <text x="${padding.left - 8}" y="${yFor(t)}" dy="0.35em" text-anchor="end"
              font-family="-apple-system, system-ui, sans-serif" font-size="11" fill="#6B6862">${t}</text>
      `).join('')}

      <!-- X axis labels -->
      ${xTicks.map(e => `
        <text x="${xFor(e.date)}" y="${height - padding.bottom + 20}"
              text-anchor="middle" font-family="-apple-system, system-ui, sans-serif"
              font-size="11" fill="#6B6862">${formatShortDate(parseDate(e.date))}</text>
      `).join('')}

      <!-- Lines -->
      ${paths.map(p => `
        <path d="${p.d}" fill="none" stroke="${p.colour}" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round" />
      `).join('')}

      <!-- Points -->
      ${paths.map(p =>
        entries.map(e => {
          const v = Number(e[p.key] ?? 0);
          return `<circle cx="${xFor(e.date).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="3"
                          fill="${p.colour}" stroke="#FBF8F2" stroke-width="1.5" />`;
        }).join('')
      ).join('')}
    </svg>
  `;

  container.innerHTML = svg;
}

export function renderTrendSummary(container, days = 30) {
  const all = getEntriesArray();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const entries = all.filter(e => e.date >= cutoffIso);

  if (entries.length === 0) {
    container.innerHTML = '';
    return;
  }

  const avg = (key) => (entries.reduce((s, e) => s + Number(e[key] ?? 0), 0) / entries.length).toFixed(1);
  const highActivityDays = entries.filter(e => Number(e.activityLevel ?? 0) >= 7).length;
  const highSymptomDays = entries.filter(e => Math.max(Number(e.symFatigue ?? 0), Number(e.symPem ?? 0)) >= 7).length;

  container.innerHTML = `
    <p>Across the last ${days} days you logged <strong>${entries.length}</strong> entries.</p>
    <p>Average activity: ${avg('activityLevel')} · Average fatigue: ${avg('symFatigue')} · Average PEM: ${avg('symPem')}.</p>
    <p>${highActivityDays} day${highActivityDays === 1 ? '' : 's'} with activity 7 or higher · ${highSymptomDays} day${highSymptomDays === 1 ? '' : 's'} with peak symptoms 7 or higher.</p>
  `;
}
