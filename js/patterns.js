// patterns.js — surface possible PEM episodes by looking back from
// high-symptom days for elevated exertion in the 24–72 hour window before.
//
// This is observation, not diagnosis. We deliberately use cautious thresholds
// and a wide window because PEM onset varies widely between people.

import { getEntriesArray } from './storage.js';

// Tunable thresholds. Kept conservative so we do not over-flag.
const HIGH_SYMPTOM_THRESHOLD = 6;      // fatigue or PEM rating 6+ counts as a "high symptom" day
const TRIGGER_ACTIVITY_THRESHOLD = 6;  // activity 6+ in the lookback window is potentially a trigger
const LOOKBACK_DAYS = 3;                // examine the prior 24–72 hours

function parseDate(s) {
  // s is YYYY-MM-DD
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const ms = parseDate(b) - parseDate(a);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function detectPemEvents() {
  const entries = getEntriesArray();
  if (entries.length < 4) return [];

  const byDate = new Map(entries.map(e => [e.date, e]));
  const events = [];

  for (const entry of entries) {
    const pem = Number(entry.symPem ?? 0);
    const fatigue = Number(entry.symFatigue ?? 0);
    const peakSymptom = Math.max(pem, fatigue);

    if (peakSymptom < HIGH_SYMPTOM_THRESHOLD) continue;

    // Build the lookback window
    const eventDate = parseDate(entry.date);
    const window = [];
    let triggers = [];

    for (let i = LOOKBACK_DAYS; i >= 1; i--) {
      const d = new Date(eventDate);
      d.setUTCDate(d.getUTCDate() - i);
      const iso = toIsoDate(d);
      const prior = byDate.get(iso) || null;
      const activity = prior ? Number(prior.activityLevel ?? 0) : null;

      window.push({
        date: iso,
        offsetLabel: `−${i}d`,
        activity,
        isTrigger: activity !== null && activity >= TRIGGER_ACTIVITY_THRESHOLD,
      });

      if (activity !== null && activity >= TRIGGER_ACTIVITY_THRESHOLD) {
        triggers.push({ date: iso, activity, daysBefore: i });
      }
    }

    // Add the event day itself
    window.push({
      date: entry.date,
      offsetLabel: 'event',
      activity: Number(entry.activityLevel ?? 0),
      pem,
      fatigue,
      isEvent: true,
    });

    if (triggers.length > 0) {
      events.push({
        eventDate: entry.date,
        pem,
        fatigue,
        peakSymptom,
        window,
        triggers,
      });
    }
  }

  // Most recent first
  return events.reverse();
}

export function summarisePatterns() {
  const entries = getEntriesArray();
  const events = detectPemEvents();

  const summary = {
    entryCount: entries.length,
    eventCount: events.length,
    averageActivity: null,
    averageFatigue: null,
    averagePem: null,
    daysCovered: 0,
  };

  if (entries.length === 0) return summary;

  const first = parseDate(entries[0].date);
  const last = parseDate(entries[entries.length - 1].date);
  summary.daysCovered = Math.round((last - first) / (1000 * 60 * 60 * 24)) + 1;

  const sum = entries.reduce((acc, e) => {
    acc.activity += Number(e.activityLevel ?? 0);
    acc.fatigue += Number(e.symFatigue ?? 0);
    acc.pem += Number(e.symPem ?? 0);
    return acc;
  }, { activity: 0, fatigue: 0, pem: 0 });

  summary.averageActivity = (sum.activity / entries.length).toFixed(1);
  summary.averageFatigue = (sum.fatigue / entries.length).toFixed(1);
  summary.averagePem = (sum.pem / entries.length).toFixed(1);

  return summary;
}
