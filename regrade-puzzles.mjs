#!/usr/bin/env node
// regrade-puzzles.mjs — Sudoku Explainer (SE) rating system
// ER = the score of the single hardest technique used (not a sum).
// Reads puzzles-dump.json, summary->stderr, JSON->stdout. No Firestore writes.

import { readFileSync } from 'fs';

const puzzles = JSON.parse(readFileSync('./puzzles-dump.json', 'utf8'));
const aiPuzzles = puzzles.filter(p => p.isAI === true || p.authorUid === 'app-seed');
console.error(`Found ${aiPuzzles.length} AI-generated puzzles to grade (SE system).\n`);

// Cell / Unit helpers

function rowCells(r) { return Array.from({length:9}, (_, j) => r * 9 + j); }
function colCells(c) { return Array.from({length:9}, (_, j) => j * 9 + c); }
function boxCells(b) {
  const br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
  const out = [];
  for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) out.push(r * 9 + c);
  return out;
}
function cellRow(i) { return Math.floor(i / 9); }
function cellCol(i) { return i % 9; }
function cellBox(i) { return Math.floor(cellRow(i) / 3) * 3 + Math.floor(cellCol(i) / 3); }

const ROW_UNITS = Array.from({length:9}, (_, r) => rowCells(r));
const COL_UNITS = Array.from({length:9}, (_, c) => colCells(c));
const BOX_UNITS = Array.from({length:9}, (_, b) => boxCells(b));
const ALL_UNITS = [...ROW_UNITS, ...COL_UNITS, ...BOX_UNITS];

const CELL_UNITS = Array.from({length:81}, (_, i) => [
  ROW_UNITS[cellRow(i)], COL_UNITS[cellCol(i)], BOX_UNITS[cellBox(i)]
]);

function sees(i, j) {
  return i !== j && (cellRow(i) === cellRow(j) || cellCol(i) === cellCol(j) || cellBox(i) === cellBox(j));
}

// Candidate management

function buildCands(grid) {
  const cands = Array.from({length:81}, () => new Set());
  for (let i = 0; i < 81; i++) {
    if (grid[i] !== 0) continue;
    const seen = new Set();
    for (const unit of CELL_UNITS[i]) for (const j of unit) seen.add(grid[j]);
    for (let n = 1; n <= 9; n++) if (!seen.has(n)) cands[i].add(n);
  }
  return cands;
}

function place(grid, cands, i, n) {
  grid[i] = n;
  cands[i].clear();
  for (const unit of CELL_UNITS[i]) for (const j of unit) cands[j].delete(n);
}

function* subsets(arr, k) {
  if (k === 0) { yield []; return; }
  for (let i = 0; i <= arr.length - k; i++)
    for (const rest of subsets(arr.slice(i + 1), k - 1)) yield [arr[i], ...rest];
}

function union(sets) {
  const u = new Set();
  for (const s of sets) for (const v of s) u.add(v);
  return u;
}

// ER name mapping

const ER_NAMES = {
  1.0: 'Last value in block/row/col',
  1.2: 'Hidden Single in block',
  1.5: 'Hidden Single in row/col',
  1.7: 'Direct Pointing',
  1.9: 'Direct Claiming',
  2.0: 'Direct Hidden Pair',
  2.3: 'Naked Single',
  2.5: 'Direct Hidden Triplet',
  2.6: 'Pointing',
  2.8: 'Claiming',
  3.0: 'Naked Pair',
  3.2: 'X-Wing',
  3.4: 'Hidden Pair',
  3.6: 'Naked Triplet',
  3.8: 'Swordfish',
  4.0: 'Hidden Triplet',
  4.2: 'XY-Wing',
  4.4: 'XYZ-Wing',
  5.0: 'Naked Quad',
  5.2: 'Jellyfish',
  5.4: 'Hidden Quad',
  10.0: 'Backtracking',
};

// Intersection helpers

function findPointingElims(grid, cands, b, n) {
  const bCells = BOX_UNITS[b].filter(i => grid[i] === 0 && cands[i].has(n));
  if (bCells.length < 2) return null;
  const rows = new Set(bCells.map(cellRow));
  const cols = new Set(bCells.map(cellCol));
  if (rows.size === 1) {
    const targets = ROW_UNITS[[...rows][0]].filter(i =>
      grid[i] === 0 && !bCells.includes(i) && cands[i].has(n));
    if (targets.length > 0) return { targets, digit: n };
  }
  if (cols.size === 1) {
    const targets = COL_UNITS[[...cols][0]].filter(i =>
      grid[i] === 0 && !bCells.includes(i) && cands[i].has(n));
    if (targets.length > 0) return { targets, digit: n };
  }
  return null;
}

function findClaimingElims(grid, cands, lineCells, n) {
  const cells = lineCells.filter(i => grid[i] === 0 && cands[i].has(n));
  if (cells.length < 2) return null;
  const boxes = new Set(cells.map(cellBox));
  if (boxes.size !== 1) return null;
  const targets = BOX_UNITS[[...boxes][0]].filter(i =>
    grid[i] === 0 && !cells.includes(i) && cands[i].has(n));
  if (targets.length > 0) return { targets, digit: n };
  return null;
}

function checkCreatesNakedSingle(cands, targets, n) {
  for (const c of targets) {
    if (cands[c].size === 2 && cands[c].has(n)) {
      return { cell: c, value: [...cands[c]].find(x => x !== n) };
    }
  }
  return null;
}

function checkCreatesHiddenSingleForN(grid, cands, targets, n) {
  const targetSet = new Set(targets);
  for (const unit of ALL_UNITS) {
    if (!unit.some(i => targetSet.has(i))) continue;
    const remaining = unit.filter(i => grid[i] === 0 && cands[i].has(n) && !targetSet.has(i));
    if (remaining.length === 1) return { cell: remaining[0], value: n };
  }
  return null;
}

function checkElimsCreateSingle(grid, cands, elims) {
  const byCell = new Map();
  for (const { cell, digit } of elims) {
    if (!byCell.has(cell)) byCell.set(cell, []);
    byCell.get(cell).push(digit);
  }
  for (const [c, digits] of byCell) {
    const removed = digits.filter(d => cands[c].has(d)).length;
    if (cands[c].size - removed === 1) {
      const val = [...cands[c]].find(d => !digits.includes(d));
      return { cell: c, value: val };
    }
  }
  for (const { cell: c, digit: d } of elims) {
    for (const unit of CELL_UNITS[c]) {
      let count = 0, lastCell = -1;
      for (const i of unit) {
        if (grid[i] !== 0 || !cands[i].has(d)) continue;
        const cellLost = byCell.get(i);
        if (cellLost && cellLost.includes(d)) continue;
        count++;
        lastCell = i;
      }
      if (count === 1) return { cell: lastCell, value: d };
    }
  }
  return null;
}

// ── SE Techniques (tried in strict ascending ER order) ───────────────────────

function tryLastValue(grid, cands) {
  for (const unit of ALL_UNITS) {
    const empty = unit.filter(i => grid[i] === 0);
    if (empty.length === 1) {
      const i = empty[0];
      const val = [...cands[i]][0];
      if (val !== undefined) { place(grid, cands, i, val); return 1.0; }
    }
  }
  return false;
}

function tryHiddenSingleBlock(grid, cands) {
  for (const unit of BOX_UNITS) {
    const empty = unit.filter(i => grid[i] === 0);
    if (empty.length <= 1) continue;
    for (let n = 1; n <= 9; n++) {
      const possible = empty.filter(i => cands[i].has(n));
      if (possible.length === 1) { place(grid, cands, possible[0], n); return 1.2; }
    }
  }
  return false;
}

function tryHiddenSingleRowCol(grid, cands) {
  for (const unit of [...ROW_UNITS, ...COL_UNITS]) {
    const empty = unit.filter(i => grid[i] === 0);
    if (empty.length <= 1) continue;
    for (let n = 1; n <= 9; n++) {
      const possible = empty.filter(i => cands[i].has(n));
      if (possible.length === 1) { place(grid, cands, possible[0], n); return 1.5; }
    }
  }
  return false;
}

function tryDirectPointing(grid, cands) {
  for (let b = 0; b < 9; b++) {
    for (let n = 1; n <= 9; n++) {
      const elim = findPointingElims(grid, cands, b, n);
      if (!elim) continue;
      const single = checkCreatesNakedSingle(cands, elim.targets, elim.digit)
                   || checkCreatesHiddenSingleForN(grid, cands, elim.targets, elim.digit);
      if (single) {
        for (const c of elim.targets) cands[c].delete(elim.digit);
        place(grid, cands, single.cell, single.value);
        return 1.7;
      }
    }
  }
  return false;
}

function tryDirectClaiming(grid, cands) {
  for (const lineCells of [...ROW_UNITS, ...COL_UNITS]) {
    for (let n = 1; n <= 9; n++) {
      const elim = findClaimingElims(grid, cands, lineCells, n);
      if (!elim) continue;
      const single = checkCreatesNakedSingle(cands, elim.targets, elim.digit)
                   || checkCreatesHiddenSingleForN(grid, cands, elim.targets, elim.digit);
      if (single) {
        for (const c of elim.targets) cands[c].delete(elim.digit);
        place(grid, cands, single.cell, single.value);
        return 1.9;
      }
    }
  }
  return false;
}

function tryDirectHiddenPair(grid, cands) {
  return tryDirectHiddenSubsetK(grid, cands, 2, 2.0);
}

function tryDirectHiddenTriplet(grid, cands) {
  return tryDirectHiddenSubsetK(grid, cands, 3, 2.5);
}

function tryDirectHiddenSubsetK(grid, cands, k, er) {
  for (const unit of ALL_UNITS) {
    const empty = unit.filter(i => grid[i] === 0);
    if (empty.length <= k) continue;
    const digitCells = {};
    for (let n = 1; n <= 9; n++) {
      const cells = empty.filter(i => cands[i].has(n));
      if (cells.length >= 2 && cells.length <= k) digitCells[n] = cells;
    }
    for (const digitCombo of subsets(Object.keys(digitCells).map(Number), k)) {
      const coveredCells = new Set(digitCombo.flatMap(n => digitCells[n]));
      if (coveredCells.size !== k) continue;
      const elims = [];
      for (const i of coveredCells)
        for (const n of cands[i])
          if (!digitCombo.includes(n)) elims.push({ cell: i, digit: n });
      if (elims.length === 0) continue;
      const single = checkElimsCreateSingle(grid, cands, elims);
      if (single) {
        for (const { cell, digit } of elims) cands[cell].delete(digit);
        place(grid, cands, single.cell, single.value);
        return er;
      }
    }
  }
  return false;
}

function tryNakedSingle(grid, cands) {
  for (let i = 0; i < 81; i++) {
    if (grid[i] === 0 && cands[i].size === 1) {
      place(grid, cands, i, [...cands[i]][0]);
      return 2.3;
    }
  }
  return false;
}

function tryPointing(grid, cands) {
  for (let b = 0; b < 9; b++) {
    for (let n = 1; n <= 9; n++) {
      const elim = findPointingElims(grid, cands, b, n);
      if (!elim) continue;
      for (const c of elim.targets) cands[c].delete(elim.digit);
      return 2.6;
    }
  }
  return false;
}

function tryClaiming(grid, cands) {
  for (const lineCells of [...ROW_UNITS, ...COL_UNITS]) {
    for (let n = 1; n <= 9; n++) {
      const elim = findClaimingElims(grid, cands, lineCells, n);
      if (!elim) continue;
      for (const c of elim.targets) cands[c].delete(elim.digit);
      return 2.8;
    }
  }
  return false;
}

function tryNakedSubset(grid, cands, k) {
  const ers = { 2: 3.0, 3: 3.6, 4: 5.0 };
  for (const unit of ALL_UNITS) {
    const empty = unit.filter(i => grid[i] === 0);
    for (const combo of subsets(empty, k)) {
      const combined = union(combo.map(i => cands[i]));
      if (combined.size === k) {
        let changed = false;
        for (const i of empty) {
          if (combo.includes(i)) continue;
          for (const n of combined) if (cands[i].has(n)) { cands[i].delete(n); changed = true; }
        }
        if (changed) return ers[k];
      }
    }
  }
  return false;
}

function tryFish(grid, cands, fishSize) {
  const ers = { 2: 3.2, 3: 3.8, 4: 5.2 };
  for (let n = 1; n <= 9; n++) {
    // Row-based fish
    const rowsWithN = [];
    for (let r = 0; r < 9; r++) {
      const cols = ROW_UNITS[r].filter(i => grid[i] === 0 && cands[i].has(n)).map(cellCol);
      if (cols.length >= 2 && cols.length <= fishSize) rowsWithN.push({ r, cols });
    }
    for (const combo of subsets(rowsWithN, fishSize)) {
      const allCols = new Set(combo.flatMap(x => x.cols));
      if (allCols.size === fishSize) {
        let changed = false;
        for (const col of allCols)
          for (const i of COL_UNITS[col])
            if (grid[i] === 0 && !combo.some(x => x.r === cellRow(i)) && cands[i].has(n)) {
              cands[i].delete(n); changed = true;
            }
        if (changed) return ers[fishSize];
      }
    }
    // Col-based fish
    const colsWithN = [];
    for (let c = 0; c < 9; c++) {
      const rows = COL_UNITS[c].filter(i => grid[i] === 0 && cands[i].has(n)).map(cellRow);
      if (rows.length >= 2 && rows.length <= fishSize) colsWithN.push({ c, rows });
    }
    for (const combo of subsets(colsWithN, fishSize)) {
      const allRows = new Set(combo.flatMap(x => x.rows));
      if (allRows.size === fishSize) {
        let changed = false;
        for (const row of allRows)
          for (const i of ROW_UNITS[row])
            if (grid[i] === 0 && !combo.some(x => x.c === cellCol(i)) && cands[i].has(n)) {
              cands[i].delete(n); changed = true;
            }
        if (changed) return ers[fishSize];
      }
    }
  }
  return false;
}

function tryHiddenSubset(grid, cands, k) {
  const ers = { 2: 3.4, 3: 4.0, 4: 5.4 };
  for (const unit of ALL_UNITS) {
    const empty = unit.filter(i => grid[i] === 0);
    const digitCells = {};
    for (let n = 1; n <= 9; n++) {
      const cells = empty.filter(i => cands[i].has(n));
      if (cells.length >= 2 && cells.length <= k) digitCells[n] = cells;
    }
    for (const digitCombo of subsets(Object.keys(digitCells).map(Number), k)) {
      const coveredCells = new Set(digitCombo.flatMap(n => digitCells[n]));
      if (coveredCells.size === k) {
        let changed = false;
        for (const i of coveredCells)
          for (const n of [...cands[i]])
            if (!digitCombo.includes(n)) { cands[i].delete(n); changed = true; }
        if (changed) return ers[k];
      }
    }
  }
  return false;
}

function tryXYWing(grid, cands) {
  const biCells = [];
  for (let i = 0; i < 81; i++) if (grid[i] === 0 && cands[i].size === 2) biCells.push(i);
  for (const pivot of biCells) {
    const [A, B] = [...cands[pivot]];
    const pincers1 = biCells.filter(p => p !== pivot && sees(p, pivot) && cands[p].has(A));
    for (const p1 of pincers1) {
      const [C] = [...cands[p1]].filter(x => x !== A);
      const pincers2 = biCells.filter(p =>
        p !== pivot && p !== p1 && sees(p, pivot) && cands[p].has(B) && cands[p].has(C));
      for (const p2 of pincers2) {
        let changed = false;
        for (let i = 0; i < 81; i++)
          if (grid[i] === 0 && i !== p1 && i !== p2 && cands[i].has(C) && sees(i, p1) && sees(i, p2)) {
            cands[i].delete(C); changed = true;
          }
        if (changed) return 4.2;
      }
    }
  }
  return false;
}

function tryXYZWing(grid, cands) {
  const biCells = [];
  for (let i = 0; i < 81; i++) if (grid[i] === 0 && cands[i].size === 2) biCells.push(i);
  for (let i = 0; i < 81; i++) {
    if (grid[i] !== 0 || cands[i].size !== 3) continue;
    const [A, B, C_] = [...cands[i]];
    for (const [zA, zB, zC] of [[A, B, C_], [A, C_, B], [B, C_, A]]) {
      const pA = biCells.filter(p => sees(p, i) && cands[p].has(zA) && cands[p].has(zC));
      const pB = biCells.filter(p => sees(p, i) && cands[p].has(zB) && cands[p].has(zC));
      for (const pa of pA) for (const pb of pB) {
        if (pa === pb) continue;
        let changed = false;
        for (let j = 0; j < 81; j++)
          if (grid[j] === 0 && j !== i && j !== pa && j !== pb
            && cands[j].has(zC) && sees(j, i) && sees(j, pa) && sees(j, pb)) {
            cands[j].delete(zC); changed = true;
          }
        if (changed) return 4.4;
      }
    }
  }
  return false;
}

// ── Master solver step — strict SE order ─────────────────────────────────────

function logicalStep(grid, cands) {
  let r;
  if ((r = tryLastValue(grid, cands)) !== false)          return r;
  if ((r = tryHiddenSingleBlock(grid, cands)) !== false)   return r;
  if ((r = tryHiddenSingleRowCol(grid, cands)) !== false)  return r;
  if ((r = tryDirectPointing(grid, cands)) !== false)      return r;
  if ((r = tryDirectClaiming(grid, cands)) !== false)      return r;
  if ((r = tryDirectHiddenPair(grid, cands)) !== false)    return r;
  if ((r = tryNakedSingle(grid, cands)) !== false)         return r;
  if ((r = tryDirectHiddenTriplet(grid, cands)) !== false) return r;
  if ((r = tryPointing(grid, cands)) !== false)            return r;
  if ((r = tryClaiming(grid, cands)) !== false)            return r;
  if ((r = tryNakedSubset(grid, cands, 2)) !== false)      return r;
  if ((r = tryFish(grid, cands, 2)) !== false)             return r;
  if ((r = tryHiddenSubset(grid, cands, 2)) !== false)     return r;
  if ((r = tryNakedSubset(grid, cands, 3)) !== false)      return r;
  if ((r = tryFish(grid, cands, 3)) !== false)             return r;
  if ((r = tryHiddenSubset(grid, cands, 3)) !== false)     return r;
  if ((r = tryXYWing(grid, cands)) !== false)              return r;
  if ((r = tryXYZWing(grid, cands)) !== false)             return r;
  if ((r = tryNakedSubset(grid, cands, 4)) !== false)      return r;
  if ((r = tryFish(grid, cands, 4)) !== false)             return r;
  if ((r = tryHiddenSubset(grid, cands, 4)) !== false)     return r;
  return false;
}

// ── Grade a single puzzle ────────────────────────────────────────────────────

function gradePuzzle(puzzleStr) {
  const grid = Array.from(puzzleStr, ch => parseInt(ch, 10));
  const cands = buildCands(grid);
  let maxER = 0;
  const techniquesUsed = new Set();
  const techniqueCounts = {};
  let requiresBacktracking = false;
  let steps = 0;

  while (grid.includes(0)) {
    const er = logicalStep(grid, cands);
    if (er === false) {
      maxER = 10.0;
      techniquesUsed.add('Backtracking');
      techniqueCounts['Backtracking'] = 1;
      requiresBacktracking = true;
      break;
    }
    const name = ER_NAMES[er] || ('ER ' + er);
    if (er > maxER) maxER = er;
    techniquesUsed.add(name);
    techniqueCounts[name] = (techniqueCounts[name] || 0) + 1;
    if (++steps > 10000) { maxER = 10.0; requiresBacktracking = true; break; }
  }

  // SE difficulty band
  let difficulty;
  if (maxER < 2.0)      difficulty = 'Easy';
  else if (maxER < 3.0) difficulty = 'Medium';
  else if (maxER < 4.0) difficulty = 'Hard';
  else if (maxER < 5.0) difficulty = 'Fiendish';
  else if (maxER < 6.0) difficulty = 'Diabolical';
  else if (maxER < 8.0) difficulty = 'Extreme';
  else                   difficulty = 'Beyond Human';

  // Map to app's 4 tiers
  let appDifficulty;
  if (maxER < 2.0)      appDifficulty = 'Easy';
  else if (maxER < 3.0) appDifficulty = 'Medium';
  else if (maxER < 4.0) appDifficulty = 'Hard';
  else                   appDifficulty = 'Expert';

  return {
    er: maxER, difficulty, app_difficulty: appDifficulty,
    hardest_technique: ER_NAMES[maxER] || 'Unknown',
    techniques_used: [...techniquesUsed],
    technique_counts: techniqueCounts,
    requires_backtracking: requiresBacktracking,
  };
}

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
