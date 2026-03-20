#!/usr/bin/env node
/**
 * compare-versions.js
 * Scans the versions/ folder for CSV files (e.g. spring2026-v1.csv, spring2026-v2.csv),
 * compares consecutive versions, and writes versions/changelog-data.js.
 *
 * Run:  node compare-versions.js
 */

const fs   = require('fs');
const path = require('path');

const VERSIONS_DIR  = path.join(__dirname, 'versions');
const OUTPUT_FILE   = path.join(VERSIONS_DIR, 'changelog-data.js');

// ── CSV parsing ────────────────────────────────────────────────────────────────

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

function parseCSV(text) {
  const lines   = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVRow(lines[0]).map(h => h.toLowerCase());

  const col = (...names) =>
    headers.findIndex(h => names.some(n => h.includes(n)));

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

// ── Diff logic ─────────────────────────────────────────────────────────────────

// Fields we care about comparing (excludes scores which are always blank at scheduling time)
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

  const added    = [];
  const removed  = [];
  const modified = [];

  // Find removed and modified
  for (const [id, oldRow] of oldMap) {
    if (!newMap.has(id)) {
      removed.push(oldRow);
    } else {
      const newRow  = newMap.get(id);
      const changes = [];
      for (const { key, label } of COMPARE_FIELDS) {
        if (oldRow[key] !== newRow[key]) {
          changes.push({ field: label, from: oldRow[key], to: newRow[key] });
        }
      }
      if (changes.length > 0) {
        modified.push({ matchNum: id, row: newRow, changes });
      }
    }
  }

  // Find added
  for (const [id, newRow] of newMap) {
    if (!oldMap.has(id)) {
      added.push(newRow);
    }
  }

  // Sort everything by date then time
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

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
  const files = discoverVersionFiles();

  if (files.length < 2) {
    console.error(`Need at least 2 version CSV files in ${VERSIONS_DIR}. Found: ${files.length}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} version(s): ${files.join(', ')}`);

  // Parse all versions
  const parsed = files.map(f => {
    const fullPath = path.join(VERSIONS_DIR, f);
    const text     = fs.readFileSync(fullPath, 'utf8');
    const rows     = parseCSV(text);
    const label    = f.replace('.csv', '');
    const vNum     = versionNumber(f);
    console.log(`  ${f}: ${rows.length} games`);
    return { file: f, label, vNum, rows };
  });

  // Compare consecutive pairs
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
      `  ${older.label} → ${newer.label}: ` +
      `+${result.added.length} added, ` +
      `-${result.removed.length} removed, ` +
      `~${result.modified.length} modified`
    );
  }

  const changelog = {
    lastRun:     new Date().toISOString(),
    totalFiles:  files.length,
    comparisons,
  };

  const output = `// Auto-generated by compare-versions.js — do not edit manually.\n// Last run: ${changelog.lastRun}\nconst CHANGELOG = ${JSON.stringify(changelog, null, 2)};\n`;
  fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
  console.log(`\nWrote ${OUTPUT_FILE}`);
}

main();
