#!/usr/bin/env node
// regrade-puzzles.mjs — Sudoku Explainer (SE) rating system
// ER = the score of the single hardest technique used (not a sum).
// Reads puzzles-dump.json, summary->stderr, JSON->stdout. No Firestore writes.

import { readFileSync } from 'fs';
import { ER_NAMES, gradePuzzle } from './public/logic-solver.js';

const puzzles = JSON.parse(readFileSync('./puzzles-dump.json', 'utf8'));
const aiPuzzles = puzzles.filter(p => p.isAI === true || p.authorUid === 'app-seed');
console.error(`Found ${aiPuzzles.length} AI-generated puzzles to grade (SE system).\n`);

// ── Main ─────────────────────────────────────────────────────────────────────

const results = [];
const oldNewCross = {};
const seDistro = {};
const appDistro = {};
let changed = 0, btCount = 0;
let highest = { er: 0 }, lowest = { er: Infinity };

for (const p of aiPuzzles) {
  const grade = gradePuzzle(p.puzzle);
  const result = { id: p.id, name: p.name, clueCount: p.clueCount, old_difficulty: p.difficulty, ...grade };
  results.push(result);
  const oldD = p.difficulty || 'Unknown';
  const newD = grade.app_difficulty;
  if (!oldNewCross[oldD]) oldNewCross[oldD] = {};
  oldNewCross[oldD][newD] = (oldNewCross[oldD][newD] || 0) + 1;
  seDistro[grade.difficulty] = (seDistro[grade.difficulty] || 0) + 1;
  appDistro[newD] = (appDistro[newD] || 0) + 1;
  if (oldD !== newD) changed++;
  if (grade.requires_backtracking) btCount++;
  if (grade.er > highest.er) highest = result;
  if (grade.er < lowest.er) lowest = result;
}

// ── Summary to stderr ────────────────────────────────────────────────────────

const e = console.error.bind(console);
e('\u2501'.repeat(70));
e(`SE REGRADING COMPLETE: ${results.length} AI puzzles`);
e('\u2501'.repeat(70));

e('\n-- SE Difficulty Bands --');
for (const d of ['Easy', 'Medium', 'Hard', 'Fiendish', 'Diabolical', 'Extreme', 'Beyond Human'])
  e(`  ${d.padEnd(14)}: ${String(seDistro[d] || 0).padStart(4)}`);

e('\n-- App Tier Mapping --');
for (const d of ['Easy', 'Medium', 'Hard', 'Expert'])
  e(`  ${d.padEnd(8)}: ${String(appDistro[d] || 0).padStart(4)}`);

e('\n-- Cross-tabulation: Old Clue-Count Tier -> New App Tier --');
e(`  ${'Old\\New'.padEnd(10)}${'Easy'.padStart(6)}${'Medium'.padStart(8)}${'Hard'.padStart(6)}${'Expert'.padStart(8)}`);
for (const old of ['Easy', 'Medium', 'Hard', 'Expert']) {
  const row = oldNewCross[old] || {};
  e(`  ${old.padEnd(10)}${String(row['Easy']||0).padStart(6)}${String(row['Medium']||0).padStart(8)}${String(row['Hard']||0).padStart(6)}${String(row['Expert']||0).padStart(8)}`);
}

e('\n-- Changes --');
e(`  Changed app tier: ${changed} / ${results.length}`);
e(`  Backtracking needed: ${btCount}`);

e('\n-- Extremes --');
e(`  Highest ER: ${highest.er} - "${highest.name}" (${highest.old_difficulty} -> ${highest.difficulty}) [${highest.hardest_technique}]`);
e(`  Lowest ER:  ${lowest.er} - "${lowest.name}" (${lowest.old_difficulty} -> ${lowest.difficulty}) [${lowest.hardest_technique}]`);

e('\n-- ER Distribution --');
const erValues = {};
for (const r of results) erValues[r.er] = (erValues[r.er] || 0) + 1;
const sortedERs = Object.keys(erValues).map(Number).sort((a, b) => a - b);
for (const er of sortedERs) {
  const name = ER_NAMES[er] || '';
  const count = erValues[er];
  const bar = '\u2588'.repeat(Math.max(1, Math.ceil(count / 3)));
  e(`  ER ${String(er).padEnd(4)} ${name.padEnd(28)} ${String(count).padStart(4)} ${bar}`);
}

e('\n-- Technique Usage --');
const allTech = {};
for (const r of results) for (const [t, c] of Object.entries(r.technique_counts))
  allTech[t] = (allTech[t] || 0) + c;
const sorted = Object.entries(allTech).sort((a, b) => b[1] - a[1]);
for (const [tech, count] of sorted) {
  const puz = results.filter(r => r.techniques_used.includes(tech)).length;
  e(`  ${tech.padEnd(32)} ${String(count).padStart(6)} uses in ${String(puz).padStart(4)} puzzles`);
}

e('\n' + '\u2501'.repeat(70));

// ── Full results to stdout ───────────────────────────────────────────────────
console.log(JSON.stringify(results, null, 2));
