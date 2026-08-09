#!/usr/bin/env node
// check-brute-force.mjs
// Finds AI sudokus that truly require guessing (trial & error / bifurcation).
// A puzzle only counts as "requires guessing" if it cannot be advanced by ANY of:
//
//  Single-digit basics:
//   1. Naked Single     – one candidate left in a cell
//   2. Hidden Single    – digit has only 1 possible cell in a unit
//
//  Subset techniques:
//   3. Naked Pair/Triple/Quad   – N cells share exactly N candidates
//   4. Hidden Pair/Triple/Quad  – N digits appear in exactly N cells within a unit
//
//  Intersection techniques:
//   5. Pointing Pair/Triple  – candidates in a box confined to one row/col
//   6. Box-Line Reduction    – candidates in a row/col confined to one box
//
//  Fish techniques (multi-line):
//   7. X-Wing     – 2-row or 2-col basic fish
//   8. Swordfish  – 3-row or 3-col basic fish
//   9. Jellyfish  – 4-row or 4-col basic fish
//
//  Wing techniques:
//  10. XY-Wing    – pivot + 2 pincers eliminate shared candidate
//  11. XYZ-Wing   – 3-candidate pivot + 2 pincers

import { readFileSync } from 'fs';

const puzzles = JSON.parse(readFileSync('./puzzles-dump.json', 'utf8'));
const aiPuzzles = puzzles.filter(p => p.isAI === true);

console.log(`Checking ${aiPuzzles.length} AI-generated puzzles with full logical solver...\n`);

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowCells(r)  { return Array.from({length:9}, (_, j) => r*9+j); }
function colCells(c)  { return Array.from({length:9}, (_, j) => j*9+c); }
function boxCells(b)  {
  const br = Math.floor(b/3)*3, bc = (b%3)*3;
  const out = [];
  for (let r = br; r < br+3; r++) for (let c = bc; c < bc+3; c++) out.push(r*9+c);
  return out;
}
function cellBox(i)  { const r=Math.floor(i/9),c=i%9; return Math.floor(r/3)*3+Math.floor(c/3); }
function cellRow(i)  { return Math.floor(i/9); }
function cellCol(i)  { return i%9; }

const ALL_UNITS = [
  ...Array.from({length:9}, (_,r) => rowCells(r)),
  ...Array.from({length:9}, (_,c) => colCells(c)),
  ...Array.from({length:9}, (_,b) => boxCells(b)),
];

function buildCands(grid) {
  const cands = Array.from({length:81}, () => new Set());
  for (let i = 0; i < 81; i++) {
    if (grid[i] !== 0) continue;
    const r = cellRow(i), c = cellCol(i), b = cellBox(i);
    const seen = new Set();
    for (let j = 0; j < 9; j++) seen.add(grid[r*9+j]);
    for (let j = 0; j < 9; j++) seen.add(grid[j*9+c]);
    for (const bc of boxCells(b)) seen.add(grid[bc]);
    for (let n = 1; n <= 9; n++) if (!seen.has(n)) cands[i].add(n);
  }
  return cands;
}

function place(grid, cands, i, n) {
  grid[i] = n;
  cands[i].clear();
  const r = cellRow(i), c = cellCol(i), b = cellBox(i);
  for (const j of [...rowCells(r), ...colCells(c), ...boxCells(b)]) cands[j].delete(n);
}

function* subsets(arr, k) {
  if (k === 0) { yield []; return; }
  for (let i = 0; i <= arr.length - k; i++)
    for (const rest of subsets(arr.slice(i+1), k-1)) yield [arr[i], ...rest];
}

function union(sets) {
  const u = new Set();
  for (const s of sets) for (const v of s) u.add(v);
  return u;
}

function logicalStep(grid, cands) {

  // 1. Naked Single
  for (let i = 0; i < 81; i++) {
    if (grid[i] === 0 && cands[i].size === 1) {
      place(grid, cands, i, [...cands[i]][0]);
      return true;
    }
  }

  // 2. Hidden Single
  for (const unit of ALL_UNITS) {
    const empty = unit.filter(i => grid[i] === 0);
    for (let n = 1; n <= 9; n++) {
      const possible = empty.filter(i => cands[i].has(n));
      if (possible.length === 1) { place(grid, cands, possible[0], n); return true; }
    }
  }

  // 3. Naked Pair / Triple / Quad
  for (const unit of ALL_UNITS) {
    const empty = unit.filter(i => grid[i] === 0);
    for (const k of [2, 3, 4]) {
      for (const combo of subsets(empty, k)) {
        const combined = union(combo.map(i => cands[i]));
        if (combined.size === k) {
          let changed = false;
          for (const i of empty) {
            if (combo.includes(i)) continue;
            for (const n of combined) if (cands[i].has(n)) { cands[i].delete(n); changed = true; }
          }
          if (changed) return true;
        }
      }
    }
  }

  // 4. Hidden Pair / Triple / Quad
  for (const unit of ALL_UNITS) {
    const empty = unit.filter(i => grid[i] === 0);
    for (const k of [2, 3, 4]) {
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
          if (changed) return true;
        }
      }
    }
  }

  // 5. Pointing Pairs/Triples (box → row/col)
  for (let b = 0; b < 9; b++) {
    const bCells = boxCells(b).filter(i => grid[i] === 0);
    for (let n = 1; n <= 9; n++) {
      const cells = bCells.filter(i => cands[i].has(n));
      if (cells.length < 2) continue;
      let changed = false;
      const rows = new Set(cells.map(cellRow));
      const cols = new Set(cells.map(cellCol));
      if (rows.size === 1)
        for (const i of rowCells([...rows][0]))
          if (grid[i] === 0 && !cells.includes(i) && cands[i].has(n)) { cands[i].delete(n); changed = true; }
      if (cols.size === 1)
        for (const i of colCells([...cols][0]))
          if (grid[i] === 0 && !cells.includes(i) && cands[i].has(n)) { cands[i].delete(n); changed = true; }
      if (changed) return true;
    }
  }

  // 6. Box-Line Reduction (row/col → box)
  for (let r = 0; r < 9; r++) {
    for (let n = 1; n <= 9; n++) {
      const cells = rowCells(r).filter(i => grid[i] === 0 && cands[i].has(n));
      if (cells.length < 2) continue;
      const boxes = new Set(cells.map(cellBox));
      if (boxes.size === 1) {
        let changed = false;
        for (const i of boxCells([...boxes][0]))
          if (grid[i] === 0 && !cells.includes(i) && cands[i].has(n)) { cands[i].delete(n); changed = true; }
        if (changed) return true;
      }
    }
  }
  for (let c = 0; c < 9; c++) {
    for (let n = 1; n <= 9; n++) {
      const cells = colCells(c).filter(i => grid[i] === 0 && cands[i].has(n));
      if (cells.length < 2) continue;
      const boxes = new Set(cells.map(cellBox));
      if (boxes.size === 1) {
        let changed = false;
        for (const i of boxCells([...boxes][0]))
          if (grid[i] === 0 && !cells.includes(i) && cands[i].has(n)) { cands[i].delete(n); changed = true; }
        if (changed) return true;
      }
    }
  }

  // 7-9. Basic Fish: X-Wing (2), Swordfish (3), Jellyfish (4)
  for (const fishSize of [2, 3, 4]) {
    for (let n = 1; n <= 9; n++) {
      // rows → eliminate cols
      const rowsWithN = [];
      for (let r = 0; r < 9; r++) {
        const cols = rowCells(r).filter(i => grid[i] === 0 && cands[i].has(n)).map(cellCol);
        if (cols.length >= 2 && cols.length <= fishSize) rowsWithN.push({r, cols});
      }
      for (const combo of subsets(rowsWithN, fishSize)) {
        const allCols = new Set(combo.flatMap(x => x.cols));
        if (allCols.size === fishSize) {
          let changed = false;
          for (const col of allCols)
            for (const i of colCells(col))
              if (grid[i] === 0 && !combo.some(x => x.r === cellRow(i)) && cands[i].has(n)) {
                cands[i].delete(n); changed = true;
              }
          if (changed) return true;
        }
      }
      // cols → eliminate rows
      const colsWithN = [];
      for (let c = 0; c < 9; c++) {
        const rows = colCells(c).filter(i => grid[i] === 0 && cands[i].has(n)).map(cellRow);
        if (rows.length >= 2 && rows.length <= fishSize) colsWithN.push({c, rows});
      }
      for (const combo of subsets(colsWithN, fishSize)) {
        const allRows = new Set(combo.flatMap(x => x.rows));
        if (allRows.size === fishSize) {
          let changed = false;
          for (const row of allRows)
            for (const i of rowCells(row))
              if (grid[i] === 0 && !combo.some(x => x.c === cellCol(i)) && cands[i].has(n)) {
                cands[i].delete(n); changed = true;
              }
          if (changed) return true;
        }
      }
    }
  }

  // Sees helper
  function sees(i, j) {
    return i !== j && (cellRow(i)===cellRow(j) || cellCol(i)===cellCol(j) || cellBox(i)===cellBox(j));
  }
  const biCells = [];
  for (let i = 0; i < 81; i++) if (grid[i] === 0 && cands[i].size === 2) biCells.push(i);

  // 10. XY-Wing
  for (const pivot of biCells) {
    const [A, B] = [...cands[pivot]];
    const pincers1 = biCells.filter(p => p !== pivot && sees(p, pivot) && cands[p].has(A));
    for (const p1 of pincers1) {
      const [C] = [...cands[p1]].filter(x => x !== A);
      const pincers2 = biCells.filter(p => p !== pivot && p !== p1 && sees(p, pivot) && cands[p].has(B) && cands[p].has(C));
      for (const p2 of pincers2) {
        let changed = false;
        for (let i = 0; i < 81; i++)
          if (grid[i]===0 && i!==p1 && i!==p2 && cands[i].has(C) && sees(i,p1) && sees(i,p2)) {
            cands[i].delete(C); changed = true;
          }
        if (changed) return true;
      }
    }
  }

  // 11. XYZ-Wing
  for (let i = 0; i < 81; i++) {
    if (grid[i] === 0 && cands[i].size !== 3) continue;
    const [A, B, C_] = [...cands[i]];
    for (const [zA, zB, zC] of [[A,B,C_],[A,C_,B],[B,C_,A]]) {
      const pA = biCells.filter(p => sees(p,i) && cands[p].has(zA) && cands[p].has(zC));
      const pB = biCells.filter(p => sees(p,i) && cands[p].has(zB) && cands[p].has(zC));
      for (const pa of pA) for (const pb of pB) {
        if (pa === pb) continue;
        let changed = false;
        for (let j = 0; j < 81; j++)
          if (grid[j]===0 && j!==i && j!==pa && j!==pb && cands[j].has(zC) && sees(j,i) && sees(j,pa) && sees(j,pb)) {
            cands[j].delete(zC); changed = true;
          }
        if (changed) return true;
      }
    }
  }

  return false; // truly stuck
}

function logicalSolve(puzzleStr) {
  const grid = Array.from(puzzleStr, ch => parseInt(ch, 10));
  const cands = buildCands(grid);
  let steps = 0;
  while (grid.includes(0)) {
    if (!logicalStep(grid, cands)) return false;
    if (++steps > 10000) return false;
  }
  return true;
}

// ── Check each puzzle ─────────────────────────────────────────────────────────

const bruteForceList = [];
const byDifficulty = {};

for (const p of aiPuzzles) {
  if (!logicalSolve(p.puzzle)) {
    bruteForceList.push(p);
    const d = p.difficulty || 'Unknown';
    byDifficulty[d] = (byDifficulty[d] || 0) + 1;
  }
}

// ── Results ───────────────────────────────────────────────────────────────────

console.log('━'.repeat(63));
console.log(`RESULTS: ${bruteForceList.length} / ${aiPuzzles.length} AI puzzles truly require guessing`);
console.log('━'.repeat(63));
console.log('\nBreakdown by difficulty:');
for (const diff of ['Easy','Medium','Hard','Expert']) {
  const count = byDifficulty[diff] || 0;
  const total = aiPuzzles.filter(p => p.difficulty === diff).length;
  console.log(`  ${diff.padEnd(8)}: ${count} / ${total} require guessing`);
}

if (bruteForceList.length > 0) {
  console.log('\nFull list:\n');
  for (const p of bruteForceList)
    console.log(`  [${(p.difficulty||'?').padEnd(6)}] "${p.name}" (id: ${p.id}, clues: ${p.clueCount ?? 'n/a'})`);
}

console.log(`\nPurely logical (no guessing needed): ${aiPuzzles.length - bruteForceList.length} / ${aiPuzzles.length}`);
