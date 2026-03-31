# MSUSC Schedule Calendar

A static web app displaying the Mechanicville-Stillwater United SC Spring 2026 soccer schedule. Supports calendar and list views, team filtering, and version history with changelogs.

## Viewing the Schedule

Open `calendar/index.html` directly in a browser — no server required.

## Updating the Schedule

### 1. Add a new CSV version

Drop the updated schedule CSV into `calendar/versions/` following the naming convention:

```
spring2026-v<N>.csv
```

For example: `spring2026-v6.csv`

The CSV must include at minimum: `Date`, `Home Team`, `Away Team` columns. The build script also recognizes: `Match #`, `Time`, `Home Club`, `Away Club`, `Location`, `Age`, `Gender`.

### 2. Run the build script

Requires [Node.js](https://nodejs.org).

```bash
cd calendar
node build.js
```

This will:
- Parse the highest-versioned CSV in `versions/`
- Rewrite the game data in `calendar.js`
- Update the subtitle in `index.html`
- Regenerate `versions/changelog-data.js` with diffs between all consecutive versions

### 3. Open the page

Refresh `calendar/index.html` in your browser to see the updated schedule.

## File Overview

| File | Purpose |
|---|---|
| `calendar/index.html` | Main schedule page |
| `calendar/calendar.js` | Schedule data + rendering logic |
| `calendar/calendar.css` | Styles |
| `calendar/versions.html` | Version history / changelog page |
| `calendar/build.js` | Build script — parses CSV and updates the above files |
| `calendar/compare-versions.js` | Diff utility used by the changelog page |
| `calendar/versions/spring2026-v*.csv` | Raw schedule exports (one per version) |
| `calendar/versions/changelog-data.js` | Auto-generated diff data (do not edit manually) |
