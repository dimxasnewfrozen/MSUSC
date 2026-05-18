# MSUSC Spring 2026 Schedule

Interactive calendar and schedule viewer for Mechanicville-Stillwater United SC.

## Pages

| File | Description |
|---|---|
| `index.html` | Main schedule — calendar/list view with team filters |
| `versions.html` | Changelog between schedule versions |

## Running

No server required. Open `index.html` directly in a browser:

```
# macOS / Linux
open index.html

# Windows
start index.html
```

Or use any static file server (e.g. VS Code Live Server extension).

## Updating the Schedule

1. Drop the new CSV from GotSoccer/Blue Star into `versions/` following the naming convention:
   ```
   versions/spring2026-v8.csv
   ```

2. Run the build script (requires Node.js):
   ```
   node build.js
   ```

   This will:
   - Parse the latest versioned CSV and update the game data in `calendar.js`
   - Update the subtitle in `index.html`
   - Regenerate `versions/changelog-data.js` with diffs between all versions

3. Refresh `index.html` in the browser.

## CSV Format

The build script expects these columns (case-insensitive):

| Column | Required |
|---|---|
| Date | Yes |
| Home Team / Away Team | Yes |
| Home Club / Away Club | Recommended |
| Time | Optional |
| Location / Field / Venue | Optional |
| Match # | Optional |
| Age, Gender | Optional |

The script auto-detects MSUSC games by matching "mechanicville" in the club columns or team names against the known team list.
