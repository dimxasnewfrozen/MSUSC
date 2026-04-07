#!/usr/bin/env node
/**
 * build.js — MSUSC schedule build pipeline
 *
 * Run:  node build.js
 *
 * What it does (in order):
 *  1. Finds the highest-versioned CSV in versions/  (e.g. spring2026-v2.csv)
 *  2. Parses it and rewrites the RAW data array in calendar.js
 *  3. Updates the subtitle line in index.html
 *  4. Diffs all consecutive version pairs and rewrites versions/changelog-data.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT          = __dirname;
const VERSIONS_DIR  = path.join(ROOT, 'versions');
const CALENDAR_JS   = path.join(ROOT, 'calendar.js');
const INDEX_HTML    = path.join(ROOT, 'index.html');
const CHANGELOG_JS  = path.join(VERSIONS_DIR, 'changelog-data.js');

// ── Shared CSV parser ──────────────────────────────────────────────────────────

function parseCSVRow(line) {
  const cells = [];
  let inQuotes = false;
  let current  = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

// ── Team definitions (must match calendar.js) ──────────────────────────────────

const TEAMS = [
  { key: 'U8 Boys Gunners',   color: '#E24B4A' },
  { key: 'U8 Girls Cherries', color: '#D85A30' },
  { key: 'U10 Boys Gunners',  color: '#BA7517' },
  { key: 'U10 Boys Lions',    color: '#639922' },
  { key: 'U10 Girls',         color: '#1D9E75' },
  { key: 'U12 Boys Gunners',  color: '#185FA5' },
  { key: 'U12 Boys Reds',     color: '#534AB7' },
  { key: 'U12 Girls',         color: '#993556' },
  { key: 'U14 Boys',          color: '#5F5E5A' },
  { key: 'U14 Girls',         color: '#8E24AA' },
  { key: 'U16 Gunners',        color: '#1976D2' },
  { key: 'U16 Girls',         color: '#0F6E56' },
  { key: 'U16G',              color: '#0F6E56' },
  { key: 'U17 Boys',          color: '#D85A30' },
];

function matchOurTeam(name) {
  const lower = name.toLowerCase();
  const match = TEAMS.find(t => lower.includes(t.key.toLowerCase()));
  return match ? match.key : null;
}

// ── Parse a CSV into the RAW format used by calendar.js ───────────────────────

function parseCalendarCSV(text) {
  const lines   = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('File appears empty.');
  const headers = parseCSVRow(lines[0]).map(h => h.toLowerCase());

  const col = (...names) => headers.findIndex(h => names.some(n => h.includes(n)));

  const matchCol    = col('match #', 'match#', 'game #', 'game#');
  const dateCol     = col('date');
  const timeCol     = col('time');
  const homeClubCol = col('home club');
  const homeCol     = col('home team');
  const awayClubCol = col('away club');
  const awayCol     = col('away team');
  const locationCol = col('location', 'field', 'venue', 'site');
  const ageCol      = col('age');
  const genderCol   = col('gender');

  if (dateCol < 0)                throw new Error('Could not find a "Date" column.');
  if (homeCol < 0 || awayCol < 0) throw new Error('Could not find "Home Team" / "Away Team" columns.');

  const isOurClub = s => s.toLowerCase().includes('mechanicville');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseCSVRow(lines[i]);
    const get = idx => (idx >= 0 && idx < cells.length) ? cells[idx] : '';

    const homeClub = get(homeClubCol);
    const awayClub = get(awayClubCol);
    const homeTeam = get(homeCol);
    const awayTeam = get(awayCol);

    // Prefer club-column detection (reliable); fall back to team-name matching
    let ourTeam, opponent, ha;
    if (homeClubCol >= 0 && awayClubCol >= 0 && (isOurClub(homeClub) || isOurClub(awayClub))) {
      if (isOurClub(homeClub)) { ha = 'Home'; ourTeam = matchOurTeam(homeTeam); opponent = awayTeam; }
      else                     { ha = 'Away'; ourTeam = matchOurTeam(awayTeam);  opponent = homeTeam; }
      if (!ourTeam) continue;
    } else {
      const homeKey = matchOurTeam(homeTeam);
      const awayKey = matchOurTeam(awayTeam);
      if      (homeKey && !awayKey) { ourTeam = homeKey; opponent = awayTeam; ha = 'Home'; }
      else if (awayKey && !homeKey) { ourTeam = awayKey; opponent = homeTeam; ha = 'Away'; }
      else continue;
    }

    let age = ageCol >= 0 ? parseInt(get(ageCol)) : 0;
    if (!age) { const m = ourTeam.match(/U(\d+)/i); age = m ? parseInt(m[1]) : 0; }

    let gender = genderCol >= 0 ? get(genderCol) : '';
    if (!gender) {
      const lower = ourTeam.toLowerCase();
      if (lower.includes('girl') || lower.includes('female')) gender = 'Female';
      else if (lower.includes('boy') || lower.includes('male')) gender = 'Male';
      else gender = 'Coed';
    }

    // Strip the timezone suffix from time (e.g. "18:30 EDT" → "18:30")
    const rawTime = get(timeCol).replace(/\s+\w{3,4}$/, '');

    rows.push({
      match:    matchCol >= 0 ? (parseInt(get(matchCol)) || i) : i,
      date:     get(dateCol),
      time:     rawTime,
      ourTeam,
      opponent,
      ha,
      location: get(locationCol),
      age,
      gender,
    });
  }

  if (rows.length === 0) throw new Error('No matching MSUSC games found.');
  return rows;
}

// ── Parse a CSV into the raw-field format used by compare-versions ─────────────

function parseVersionCSV(text) {
  const lines   = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVRow(lines[0]).map(h => h.toLowerCase());
  const col = (...names) => headers.findIndex(h => names.some(n => h.includes(n)));

  const iMatchNum  = col('match #', 'match#', 'match num');
  const iDate      = col('date');
  const iTime      = col('time');
  const iHomeClub  = col('home club');
  const iHomeTeam  = col('home team');
  const iHomeSc    = col('home score');
  const iAwayClub  = col('away club');
  const iAwayTeam  = col('away team');
  const iAwaySc    = col('away score');
  const iLocation  = col('location');
  const iDivision  = col('division');
  const iAge       = col('age');
  const iGender    = col('gender');
  const iStatus    = col('status');
  const iEvent     = col('event');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const c = parseCSVRow(lines[i]);
    const matchNum = c[iMatchNum] || '';
    if (!matchNum) continue;
    rows.push({
      matchNum,
      date:      c[iDate]     || '',
      time:      c[iTime]     || '',
      homeClub:  c[iHomeClub] || '',
      homeTeam:  c[iHomeTeam] || '',
      homeScore: c[iHomeSc]   || '',
      awayClub:  c[iAwayClub] || '',
      awayTeam:  c[iAwayTeam] || '',
      awayScore: c[iAwaySc]   || '',
      location:  c[iLocation] || '',
      division:  c[iDivision] || '',
      age:       c[iAge]      || '',
      gender:    c[iGender]   || '',
      status:    c[iStatus]   || '',
      eventName: c[iEvent]    || '',
    });
  }
  return rows;
}

// ── Version diff ───────────────────────────────────────────────────────────────

const COMPARE_FIELDS = [
  { key: 'date',      label: 'Date' },
  { key: 'time',      label: 'Time' },
  { key: 'homeClub',  label: 'Home Club' },
  { key: 'homeTeam',  label: 'Home Team' },
  { key: 'awayClub',  label: 'Away Club' },
  { key: 'awayTeam',  label: 'Away Team' },
  { key: 'location',  label: 'Location' },
  { key: 'division',  label: 'Division' },
  { key: 'status',    label: 'Status' },
];

function diffVersions(oldRows, newRows) {
  const oldMap = new Map(oldRows.map(r => [r.matchNum, r]));
  const newMap = new Map(newRows.map(r => [r.matchNum, r]));
  const added = [], removed = [], modified = [];

  for (const [id, oldRow] of oldMap) {
    if (!newMap.has(id)) {
      removed.push(oldRow);
    } else {
      const newRow  = newMap.get(id);
      const changes = [];
      for (const { key, label } of COMPARE_FIELDS) {
        if (oldRow[key] !== newRow[key]) changes.push({ field: label, from: oldRow[key], to: newRow[key] });
      }
      if (changes.length > 0) modified.push({ matchNum: id, row: newRow, changes });
    }
  }
  for (const [id, newRow] of newMap) {
    if (!oldMap.has(id)) added.push(newRow);
  }

  const sortKey = r => `${r.date}|${r.time}`;
  added.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  removed.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  modified.sort((a, b) => sortKey(a.row).localeCompare(sortKey(b.row)));

  return { added, removed, modified };
}

// ── File discovery ─────────────────────────────────────────────────────────────

function versionNumber(filename) {
  const m = filename.match(/-v(\d+)\.csv$/i);
  return m ? parseInt(m[1], 10) : 0;
}

function discoverVersionFiles() {
  return fs.readdirSync(VERSIONS_DIR)
    .filter(f => f.endsWith('.csv') && /-v\d+\.csv$/i.test(f))
    .sort((a, b) => versionNumber(a) - versionNumber(b));
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function parseGameDate(d) {
  const [m, day, y] = d.split('/');
  return new Date(+y, +m - 1, +day);
}

function fmtShort(dt) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

// ── Step 1 & 2: Update calendar.js RAW ────────────────────────────────────────

function updateCalendarJS(rows, sourceFile) {
  let src = fs.readFileSync(CALENDAR_JS, 'utf8');

  // Replace the entire "const RAW = [...];" line (it lives on one line)
  const newRaw = `const RAW = ${JSON.stringify(rows)};`;
  const updated = src.replace(/^const RAW = \[.*\];$/m, newRaw);

  if (!/^const RAW = \[/m.test(src)) throw new Error('Could not find "const RAW = [...];" in calendar.js to replace.');

  fs.writeFileSync(CALENDAR_JS, updated, 'utf8');
  console.log(`  calendar.js  updated RAW (${rows.length} games from ${sourceFile})`);
}

// ── Step 3: Update index.html subtitle ────────────────────────────────────────

function updateIndexHTML(rows) {
  const dates  = rows.map(r => parseGameDate(r.date));
  const minDt  = new Date(Math.min(...dates));
  const maxDt  = new Date(Math.max(...dates));
  const teams  = new Set(rows.map(r => r.ourTeam)).size;
  const range  = `${fmtShort(minDt)} – ${fmtShort(maxDt)}`;
  const newSub = `Mechanicville-Stillwater — ${rows.length} matches across ${teams} teams · ${range}`;

  let html    = fs.readFileSync(INDEX_HTML, 'utf8');
  if (!/<p id="subtitle">/.test(html)) throw new Error('Could not find subtitle <p> in index.html to replace.');
  const updated = html.replace(/(<p id="subtitle">)[^<]*/, `$1${newSub}`);

  fs.writeFileSync(INDEX_HTML, updated, 'utf8');
  console.log(`  index.html   subtitle → "${newSub}"`);
}

// ── Step 4: Regenerate changelog-data.js ──────────────────────────────────────

function updateChangelog(files) {
  const parsed = files.map(f => {
    const text  = fs.readFileSync(path.join(VERSIONS_DIR, f), 'utf8');
    const rows  = parseVersionCSV(text);
    const label = f.replace('.csv', '');
    const vNum  = versionNumber(f);
    return { file: f, label, vNum, rows };
  });

  const comparisons = [];
  for (let i = 0; i < parsed.length - 1; i++) {
    const older  = parsed[i];
    const newer  = parsed[i + 1];
    const result = diffVersions(older.rows, newer.rows);
    comparisons.push({
      fromLabel:   older.label,
      toLabel:     newer.label,
      fromVersion: older.vNum,
      toVersion:   newer.vNum,
      comparedAt:  new Date().toISOString(),
      added:       result.added,
      removed:     result.removed,
      modified:    result.modified,
    });
    console.log(
      `  changelog    v${older.vNum}→v${newer.vNum}: ` +
      `+${result.added.length} added, -${result.removed.length} removed, ~${result.modified.length} modified`
    );
  }

  const changelog = { lastRun: new Date().toISOString(), totalFiles: files.length, comparisons };
  const out = `// Auto-generated by build.js — do not edit manually.\n// Last run: ${changelog.lastRun}\nconst CHANGELOG = ${JSON.stringify(changelog, null, 2)};\n`;
  fs.writeFileSync(CHANGELOG_JS, out, 'utf8');
  console.log(`  changelog    wrote versions/changelog-data.js`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
  const files = discoverVersionFiles();
  if (files.length === 0) {
    console.error(`No version CSV files found in ${VERSIONS_DIR}`);
    process.exit(1);
  }

  const latest = files[files.length - 1];
  console.log(`\nBuild pipeline — ${new Date().toLocaleString()}`);
  console.log(`  Versions found: ${files.join(', ')}`);
  console.log(`  Using latest:   ${latest}\n`);

  // Parse latest CSV into calendar format
  const text = fs.readFileSync(path.join(VERSIONS_DIR, latest), 'utf8');
  const rows = parseCalendarCSV(text);

  updateCalendarJS(rows, latest);
  updateIndexHTML(rows);
  if (files.length >= 2) updateChangelog(files);
  else console.log('  changelog    skipped (need at least 2 version files)');

  console.log(`\nDone.\n`);
}

main();
