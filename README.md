# Pacing diary

A private, on-device pacing diary for people with ME/CFS. Log activity and symptoms day by day, surface possible post-exertional malaise patterns, and export a one-page PDF summary for appointments.

A companion tool to the pacing guide at [invisiblefatigue.com/mecfs/pacing](https://invisiblefatigue.com/mecfs/pacing/).

## What it does

- **Today** — record activity level, six symptom dimensions, sleep, optional resting heart rate, and notes.
- **History** — calendar view showing activity intensity per day. Red dot marks possible PEM episodes.
- **Patterns** — looks back from high-symptom days for elevated activity in the preceding 24–72 hours.
- **Trends** — SVG line chart of activity, fatigue, and PEM over time.
- **Export** — PDF summary for GP visits, CSV for spreadsheets, JSON backup, full data restore.

## Privacy

All data is stored in `localStorage` on the user's device. Nothing is sent to a server. No accounts, no tracking, no analytics. Clearing browser data clears the diary.

## Tech

Vanilla JavaScript with ES modules. No build step. Single external dependency: jsPDF via CDN, loaded only for PDF export. Hand-rolled SVG chart instead of a chart library to keep the bundle light and avoid surprise animations.

Installable as a Progressive Web App: add it to a phone home screen and it opens full-screen like an app and works offline. A service worker (`sw.js`) caches the app shell; a web manifest (`manifest.webmanifest`) and icons make it installable.

Designed to meet the Invisible Fatigue accessibility and design house rules:

- Warm muted palette, sage primary, dusty terracotta only for warnings.
- Fraunces for display, Newsreader for body, system sans for UI.
- Respects `prefers-reduced-motion`.
- 44px minimum tap targets.
- Keyboard navigable, semantic HTML, ARIA labels on the calendar.
- WCAG AA contrast.
- Mobile-first single-column layout.

## File structure

```
pacing-diary/
├── index.html
├── styles.css
├── manifest.webmanifest    — PWA manifest (installability)
├── sw.js                   — service worker (offline cache)
├── icons/                  — app icons (192, 512, maskable, apple-touch, favicon)
├── js/
│   ├── app.js        — routing, form, history, patterns, install prompt
│   ├── storage.js    — localStorage wrapper
│   ├── patterns.js   — PEM pattern detection logic
│   ├── charts.js     — SVG trend chart
│   └── export.js     — CSV / JSON / PDF export
└── README.md
```

## Run locally

ES modules need to be served over HTTP, not `file://`. Pick one:

```bash
# From the pacing-diary directory:
python3 -m http.server 8000
# then open http://localhost:8000
```

Or with Node:

```bash
npx serve .
```

## Deploy to GitHub Pages

From inside the `pacing-diary` directory:

```bash
# 1. Initialise the repository
git init
git add .
git commit -m "Initial commit: pacing diary"

# 2. Create the repo on GitHub (replace YOUR-USERNAME)
# Easiest path is via the GitHub web UI — make a new public repo
# called pacing-diary, then:

git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/pacing-diary.git
git push -u origin main

# 3. Enable Pages
# On GitHub: Settings → Pages → Source: "Deploy from a branch"
# Branch: main, folder: / (root). Save.
# After a minute or two it will be live at:
# https://YOUR-USERNAME.github.io/pacing-diary/
```

If you have the GitHub CLI installed, the repo creation and push collapse to:

```bash
gh repo create pacing-diary --public --source=. --remote=origin --push
gh api -X POST repos/YOUR-USERNAME/pacing-diary/pages \
  -f source.branch=main -f source.path=/
```

## Install on a phone

Once it is live on GitHub Pages, open the URL on the phone and add it to the home screen:

- **iPhone / iPad (Safari):** tap the Share button, then "Add to Home Screen". The diary also shows this instruction in its About tab.
- **Android (Chrome):** open the About tab and tap "Add to home screen", or use the browser menu's "Install app". On many devices Chrome offers an install banner automatically.

After installing, it launches full-screen, with no browser chrome, and works offline. Saving uses the device's local storage, so entries persist between sessions. Because phone browsers can clear local storage under storage pressure, download a JSON backup from the Export tab every week or two.

## Updating after you change a file

The service worker caches the app shell, so phones keep serving the cached version until the cache name changes. When you edit `index.html`, `styles.css`, or any file in `js/`, bump the version string near the top of `sw.js`:

```js
const CACHE = 'pacing-diary-v2';   // was v1
```

Commit and push. Installed copies pick up the new version on their next launch.

## Custom domain on invisiblefatigue.com

If you want to host this at, for example, `diary.invisiblefatigue.com`:

1. Add a file called `CNAME` to the repo root containing only `diary.invisiblefatigue.com`.
2. In your DNS provider, create a CNAME record pointing `diary` to `YOUR-USERNAME.github.io`.
3. In GitHub Settings → Pages, enter the custom domain and tick "Enforce HTTPS" once the certificate is issued.

## Embedding on the main site

If you want to keep the diary on a subdomain but link to it from `/mecfs/pacing/`, a plain link works fine. An iframe is also possible, but `localStorage` is scoped per-origin, so embedding the same diary across origins would create separate, disconnected data stores. Best to link out.

## License and notes

This tool keeps no clinical claims. The PEM pattern detector is a pattern-surfacer, not a diagnostic instrument. Thresholds (activity ≥ 6, peak symptom ≥ 6, 24–72 hour window) are deliberately cautious; they can be tuned in `js/patterns.js` if you want a more sensitive or stricter read.

NICE NG206 is the clinical anchor for any pacing-related copy. Existing pages on Invisible Fatigue use the same hedged register.
