// Logic solver shared by the game (teaching hints) and Node scripts (grading).
// Techniques are tried in Sudoku Explainer (SE) order; cells are indexed 0–80 row-major.

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

const ROWS  = Array.from({length:9}, (_, r) => ({ type: 'row', index: r, cells: rowCells(r) }));
const COLS  = Array.from({length:9}, (_, c) => ({ type: 'col', index: c, cells: colCells(c) }));
const BOXES = Array.from({length:9}, (_, b) => ({ type: 'box', index: b, cells: boxCells(b) }));
const ALL_UNITS = [...ROWS, ...COLS, ...BOXES];
const LINES = [...ROWS, ...COLS];

const CELL_UNITS = Array.from({length:81}, (_, i) => [
  ROWS[cellRow(i)].cells, COLS[cellCol(i)].cells, BOXES[cellBox(i)].cells
]);

function sees(i, j) {
  return i !== j && (cellRow(i) === cellRow(j) || cellCol(i) === cellCol(j) || cellBox(i) === cellBox(j));
}

// ── Candidates ───────────────────────────────────────────────────────────────

export function buildCands(grid) {
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

// ── Names & text ─────────────────────────────────────────────────────────────

export const ER_NAMES = {
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
  6.5: 'Short Chain',
  7.0: 'Medium Chain',
  8.0: 'Long Chain',
  10.0: 'Backtracking',
};

const LABELS = {
  1.0: 'Last Value', 1.2: 'Hidden Single', 1.5: 'Hidden Single', 1.7: 'Pointing', 1.9: 'Claiming',
  2.0: 'Hidden Pair', 2.3: 'Naked Single', 2.5: 'Hidden Triple', 2.6: 'Pointing', 2.8: 'Claiming',
  3.0: 'Naked Pair', 3.2: 'X-Wing', 3.4: 'Hidden Pair', 3.6: 'Naked Triple', 3.8: 'Swordfish',
  4.0: 'Hidden Triple', 4.2: 'XY-Wing', 4.4: 'XYZ-Wing', 5.0: 'Naked Quad', 5.2: 'Jellyfish', 5.4: 'Hidden Quad',
  6.5: 'Chain', 7.0: 'Chain', 8.0: 'Chain',
};

export function cellName(i) { return `R${cellRow(i) + 1}C${cellCol(i) + 1}`; }
function unitName(u) { return `${u.type === 'col' ? 'column' : u.type} ${u.index + 1}`; }
function joinList(xs) { return xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]; }
function cellList(cells) { return joinList([...cells].sort((a, b) => a - b).map(cellName)); }
function digitList(ds) { return [...ds].sort((a, b) => a - b).join('/'); }
function article(label) { return /^[AEIOUX]/.test(label) ? 'an' : 'a'; }
function forced(p) { return p ? ` That leaves ${cellName(p.cell)} as ${p.value}.` : ''; }

function makeStep(er, fields) {
  return {
    er, technique: ER_NAMES[er], label: LABELS[er],
    place: null, eliminations: [], pattern: [], units: [], digits: [],
    ...fields,
  };
}

// ── Intersection helpers ─────────────────────────────────────────────────────

function findPointingElims(grid, cands, b, n) {
  const bCells = BOXES[b].cells.filter(i => grid[i] === 0 && cands[i].has(n));
  if (bCells.length < 2) return null;
  const rows = new Set(bCells.map(cellRow));
  const cols = new Set(bCells.map(cellCol));
  if (rows.size === 1) {
    const line = ROWS[[...rows][0]];
    const targets = line.cells.filter(i => grid[i] === 0 && !bCells.includes(i) && cands[i].has(n));
    if (targets.length > 0) return { targets, digit: n, cells: bCells, box: BOXES[b], line };
  }
  if (cols.size === 1) {
    const line = COLS[[...cols][0]];
    const targets = line.cells.filter(i => grid[i] === 0 && !bCells.includes(i) && cands[i].has(n));
    if (targets.length > 0) return { targets, digit: n, cells: bCells, box: BOXES[b], line };
  }
  return null;
}

function findClaimingElims(grid, cands, line, n) {
  const cells = line.cells.filter(i => grid[i] === 0 && cands[i].has(n));
  if (cells.length < 2) return null;
  const boxes = new Set(cells.map(cellBox));
  if (boxes.size !== 1) return null;
  const box = BOXES[[...boxes][0]];
  const targets = box.cells.filter(i => grid[i] === 0 && !cells.includes(i) && cands[i].has(n));
  if (targets.length > 0) return { targets, digit: n, cells, box, line };
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
    if (!unit.cells.some(i => targetSet.has(i))) continue;
    const remaining = unit.cells.filter(i => grid[i] === 0 && cands[i].has(n) && !targetSet.has(i));
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

function intersectionText(e, pointing) {
  const d = e.digit;
  return pointing
    ? `In ${unitName(e.box)}, ${d} can only go in ${unitName(e.line)}, so remove ${d} from the rest of ${unitName(e.line)}.`
    : `In ${unitName(e.line)}, ${d} can only go in ${unitName(e.box)}, so remove ${d} from the rest of ${unitName(e.box)}.`;
}

function intersectionStep(er, e, pointing, single) {
  return makeStep(er, {
    digit: e.digit, digits: [e.digit],
    eliminations: e.targets.map(cell => ({ cell, digit: e.digit })),
    place: single,
    pattern: e.cells,
    units: pointing ? [e.box, e.line] : [e.line, e.box],
    nudge: `Look at where ${e.digit} can go in ${unitName(pointing ? e.box : e.line)}.`,
    explanation: intersectionText(e, pointing) + forced(single),
  });
}

// ── Techniques (SE order) ────────────────────────────────────────────────────

function findLastValue(grid, cands) {
  for (const u of ALL_UNITS) {
    const empty = u.cells.filter(i => grid[i] === 0);
    if (empty.length === 1) {
      const i = empty[0];
      const val = [...cands[i]][0];
      if (val !== undefined) return makeStep(1.0, {
        digit: val, digits: [val], place: { cell: i, value: val }, pattern: [i], units: [u],
        nudge: `${unitName(u)[0].toUpperCase() + unitName(u).slice(1)} is almost full.`,
        explanation: `${cellName(i)} is the only empty cell in ${unitName(u)}, so it must be ${val}.`,
      });
    }
  }
  return null;
}

function findHiddenSingle(grid, cands, units, er) {
  for (const u of units) {
    const empty = u.cells.filter(i => grid[i] === 0);
    if (empty.length <= 1) continue;
    for (let n = 1; n <= 9; n++) {
      const possible = empty.filter(i => cands[i].has(n));
      if (possible.length === 1) return makeStep(er, {
        digit: n, digits: [n], place: { cell: possible[0], value: n }, pattern: [possible[0]], units: [u],
        nudge: `Look at where ${n} can go in ${unitName(u)}.`,
        explanation: `${n} can only go in ${cellName(possible[0])} within ${unitName(u)}.`,
      });
    }
  }
  return null;
}

function findDirectPointing(grid, cands) {
  for (let b = 0; b < 9; b++) {
    for (let n = 1; n <= 9; n++) {
      const e = findPointingElims(grid, cands, b, n);
      if (!e) continue;
      const single = checkCreatesNakedSingle(cands, e.targets, n)
                  || checkCreatesHiddenSingleForN(grid, cands, e.targets, n);
      if (single) return intersectionStep(1.7, e, true, single);
    }
  }
  return null;
}

function findDirectClaiming(grid, cands) {
  for (const line of LINES) {
    for (let n = 1; n <= 9; n++) {
      const e = findClaimingElims(grid, cands, line, n);
      if (!e) continue;
      const single = checkCreatesNakedSingle(cands, e.targets, n)
                  || checkCreatesHiddenSingleForN(grid, cands, e.targets, n);
      if (single) return intersectionStep(1.9, e, false, single);
    }
  }
  return null;
}

function hiddenSubsetStep(er, u, digitCombo, coveredCells, elims, single) {
  const label = LABELS[er];
  return makeStep(er, {
    digits: [...digitCombo], eliminations: elims, place: single,
    pattern: [...coveredCells], units: [u],
    nudge: `Look for ${article(label)} ${label} in ${unitName(u)}.`,
    explanation: `${digitList(digitCombo)} only fit in ${cellList(coveredCells)} within ${unitName(u)}, so remove every other candidate from those cells.` + forced(single),
  });
}

function findDirectHiddenSubset(grid, cands, k, er) {
  for (const u of ALL_UNITS) {
    const empty = u.cells.filter(i => grid[i] === 0);
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
      if (single) return hiddenSubsetStep(er, u, digitCombo, coveredCells, elims, single);
    }
  }
  return null;
}

function findNakedSingle(grid, cands) {
  for (let i = 0; i < 81; i++) {
    if (grid[i] === 0 && cands[i].size === 1) {
      const val = [...cands[i]][0];
      return makeStep(2.3, {
        digit: val, digits: [val], place: { cell: i, value: val }, pattern: [i],
        nudge: `One cell has only a single candidate left.`,
        explanation: `${cellName(i)} has only one candidate left: ${val}.`,
      });
    }
  }
  return null;
}

function findPointing(grid, cands) {
  for (let b = 0; b < 9; b++) {
    for (let n = 1; n <= 9; n++) {
      const e = findPointingElims(grid, cands, b, n);
      if (e) return intersectionStep(2.6, e, true, null);
    }
  }
  return null;
}

function findClaiming(grid, cands) {
  for (const line of LINES) {
    for (let n = 1; n <= 9; n++) {
      const e = findClaimingElims(grid, cands, line, n);
      if (e) return intersectionStep(2.8, e, false, null);
    }
  }
  return null;
}

function findNakedSubset(grid, cands, k) {
  const ers = { 2: 3.0, 3: 3.6, 4: 5.0 };
  for (const u of ALL_UNITS) {
    const empty = u.cells.filter(i => grid[i] === 0);
    for (const combo of subsets(empty, k)) {
      const combined = union(combo.map(i => cands[i]));
      if (combined.size !== k) continue;
      const elims = [];
      for (const i of empty) {
        if (combo.includes(i)) continue;
        for (const n of combined) if (cands[i].has(n)) elims.push({ cell: i, digit: n });
      }
      if (elims.length) {
        const label = LABELS[ers[k]];
        return makeStep(ers[k], {
          digits: [...combined], eliminations: elims, pattern: combo, units: [u],
          nudge: `Look for ${article(label)} ${label} in ${unitName(u)}.`,
          explanation: `${cellList(combo)} only contain ${digitList(combined)} between them, so remove ${digitList(combined)} from the rest of ${unitName(u)}.`,
        });
      }
    }
  }
  return null;
}

function fishStep(er, n, base, cover, pattern, elims) {
  const label = LABELS[er];
  const coverType = cover[0].type === 'col' ? 'columns' : 'rows';
  const baseType = base[0].type === 'col' ? 'columns' : 'rows';
  return makeStep(er, {
    digit: n, digits: [n], eliminations: elims, pattern, units: [...base, ...cover],
    nudge: `Look for ${article(label)} ${label} on ${n}.`,
    explanation: `In ${baseType} ${joinList(base.map(u => u.index + 1))}, ${n} can only go in ${coverType} ${joinList(cover.map(u => u.index + 1))}, so remove ${n} from the rest of those ${coverType}.`,
  });
}

function findFish(grid, cands, fishSize) {
  const ers = { 2: 3.2, 3: 3.8, 4: 5.2 };
  for (let n = 1; n <= 9; n++) {
    const rowsWithN = [];
    for (let r = 0; r < 9; r++) {
      const cols = ROWS[r].cells.filter(i => grid[i] === 0 && cands[i].has(n)).map(cellCol);
      if (cols.length >= 2 && cols.length <= fishSize) rowsWithN.push({ r, cols });
    }
    for (const combo of subsets(rowsWithN, fishSize)) {
      const allCols = new Set(combo.flatMap(x => x.cols));
      if (allCols.size !== fishSize) continue;
      const elims = [];
      for (const col of allCols)
        for (const i of COLS[col].cells)
          if (grid[i] === 0 && !combo.some(x => x.r === cellRow(i)) && cands[i].has(n)) elims.push({ cell: i, digit: n });
      if (elims.length) {
        const base = combo.map(x => ROWS[x.r]);
        const cover = [...allCols].sort((a, b) => a - b).map(c => COLS[c]);
        const pattern = combo.flatMap(x => x.cols.map(c => x.r * 9 + c));
        return fishStep(ers[fishSize], n, base, cover, pattern, elims);
      }
    }
    const colsWithN = [];
    for (let c = 0; c < 9; c++) {
      const rows = COLS[c].cells.filter(i => grid[i] === 0 && cands[i].has(n)).map(cellRow);
      if (rows.length >= 2 && rows.length <= fishSize) colsWithN.push({ c, rows });
    }
    for (const combo of subsets(colsWithN, fishSize)) {
      const allRows = new Set(combo.flatMap(x => x.rows));
      if (allRows.size !== fishSize) continue;
      const elims = [];
      for (const row of allRows)
        for (const i of ROWS[row].cells)
          if (grid[i] === 0 && !combo.some(x => x.c === cellCol(i)) && cands[i].has(n)) elims.push({ cell: i, digit: n });
      if (elims.length) {
        const base = combo.map(x => COLS[x.c]);
        const cover = [...allRows].sort((a, b) => a - b).map(r => ROWS[r]);
        const pattern = combo.flatMap(x => x.rows.map(r => r * 9 + x.c));
        return fishStep(ers[fishSize], n, base, cover, pattern, elims);
      }
    }
  }
  return null;
}

function findHiddenSubset(grid, cands, k) {
  const ers = { 2: 3.4, 3: 4.0, 4: 5.4 };
  for (const u of ALL_UNITS) {
    const empty = u.cells.filter(i => grid[i] === 0);
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
      if (elims.length) return hiddenSubsetStep(ers[k], u, digitCombo, coveredCells, elims, null);
    }
  }
  return null;
}

function findXYWing(grid, cands) {
  const biCells = [];
  for (let i = 0; i < 81; i++) if (grid[i] === 0 && cands[i].size === 2) biCells.push(i);
  for (const pivot of biCells) {
    const [A, B] = [...cands[pivot]];
    const pincers1 = biCells.filter(p => p !== pivot && sees(p, pivot) && cands[p].has(A));
    for (const p1 of pincers1) {
      const [C] = [...cands[p1]].filter(x => x !== A);
      // C === B would make p1 a copy of the pivot, which is not a wing.
      if (C === B) continue;
      const pincers2 = biCells.filter(p =>
        p !== pivot && p !== p1 && sees(p, pivot) && cands[p].has(B) && cands[p].has(C));
      for (const p2 of pincers2) {
        const elims = [];
        for (let i = 0; i < 81; i++)
          if (grid[i] === 0 && i !== p1 && i !== p2 && cands[i].has(C) && sees(i, p1) && sees(i, p2))
            elims.push({ cell: i, digit: C });
        if (elims.length) return makeStep(4.2, {
          digit: C, digits: [A, B, C], eliminations: elims, pattern: [pivot, p1, p2],
          nudge: `Look for an XY-Wing that removes ${C}.`,
          explanation: `${cellName(pivot)} is ${digitList([A, B])}. If it's ${A}, ${cellName(p1)} is ${C}; if it's ${B}, ${cellName(p2)} is ${C}. Either way, cells that see both ${cellName(p1)} and ${cellName(p2)} can't be ${C}.`,
        });
      }
    }
  }
  return null;
}

function findXYZWing(grid, cands) {
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
        const elims = [];
        for (let j = 0; j < 81; j++)
          if (grid[j] === 0 && j !== i && j !== pa && j !== pb
            && cands[j].has(zC) && sees(j, i) && sees(j, pa) && sees(j, pb))
            elims.push({ cell: j, digit: zC });
        if (elims.length) return makeStep(4.4, {
          digit: zC, digits: [A, B, C_], eliminations: elims, pattern: [i, pa, pb],
          nudge: `Look for an XYZ-Wing that removes ${zC}.`,
          explanation: `${cellName(i)} (${digitList([A, B, C_])}), ${cellName(pa)} (${digitList([zA, zC])}) and ${cellName(pb)} (${digitList([zB, zC])}): one of them must be ${zC}, so cells that see all three can't be ${zC}.`,
        });
      }
    }
  }
  return null;
}

// ── Alternating inference chains ─────────────────────────────────────────────
// Node = cell*9 + (digit-1). Strong link: at least one of the pair is true. Weak link: at most one is.
// A chain X0 = X1 - X2 = X3 ... = Xk proves X0 or Xk is true, so any candidate weakly linked to both is false.
// This covers Skyscraper, 2-String Kite, Turbot Fish, W-Wing, X-Chain and XY-Chain.

const MAX_CHAIN_NODES = 16;
function nodeCell(v) { return Math.floor(v / 9); }
function nodeDigit(v) { return (v % 9) + 1; }
function weakLinked(a, b) {
  if (a === b) return false;
  const ca = nodeCell(a), cb = nodeCell(b);
  return ca === cb || (nodeDigit(a) === nodeDigit(b) && sees(ca, cb));
}

function chainStep(grid, cands, path, elims) {
  const nodes = path.length;
  const digits = new Set(path.map(nodeDigit));
  let strongInCell = true;
  for (let i = 0; i + 1 < nodes; i += 2) if (nodeCell(path[i]) !== nodeCell(path[i + 1])) strongInCell = false;
  const kind = digits.size === 1 ? 'X-Chain' : strongInCell ? 'XY-Chain' : 'Chain';
  const er = nodes <= 6 ? 6.5 : nodes <= 10 ? 7.0 : 8.0;
  const first = path[0], last = path[nodes - 1];
  const say = v => `${cellName(nodeCell(v))} ${nodeDigit(v)}`;
  const parts = path.slice(1).map((v, i) => i % 2 === 0
    ? `${cellName(nodeCell(v))} must be ${nodeDigit(v)}`
    : `${cellName(nodeCell(v))} can't be ${nodeDigit(v)}`);
  const removal = joinList(elims.map(e => `${e.digit} from ${cellName(e.cell)}`));
  const single = checkElimsCreateSingle(grid, cands, elims);
  return makeStep(er, {
    technique: kind, label: kind,
    digit: digits.size === 1 ? [...digits][0] : undefined,
    digits: [...digits], eliminations: elims, place: single,
    pattern: [...new Set(path.map(nodeCell))],
    nudge: `Look for a chain through ${digitList(digits)}.`,
    explanation: `If ${say(first)} is false, then ${parts.join(', so ')}. So either ${say(first)} or ${say(last)} is true. Remove ${removal}.` + forced(single),
  });
}

function findChain(grid, cands) {
  const strong = Array.from({length: 729}, () => []);
  const link = (a, b) => { strong[a].push(b); strong[b].push(a); };
  for (let i = 0; i < 81; i++)
    if (grid[i] === 0 && cands[i].size === 2) { const [a, b] = [...cands[i]]; link(i * 9 + a - 1, i * 9 + b - 1); }
  for (const u of ALL_UNITS)
    for (let n = 1; n <= 9; n++) {
      const cs = u.cells.filter(i => grid[i] === 0 && cands[i].has(n));
      if (cs.length === 2) link(cs[0] * 9 + n - 1, cs[1] * 9 + n - 1);
    }
  const linked = [];
  for (let v = 0; v < 729; v++) if (strong[v].length) linked.push(v);
  const live = [];
  for (let i = 0; i < 81; i++) if (grid[i] === 0) for (const n of cands[i]) live.push(i * 9 + n - 1);

  let best = null;
  for (const s of linked) {
    const seen = new Set([s]);
    let frontier = [];
    for (const x of strong[s]) if (!seen.has(x)) { seen.add(x); frontier.push([s, x]); }
    while (frontier.length) {
      const next = [];
      for (const path of frontier) {
        const v = path[path.length - 1];
        if (!best || path.length < best.length) {
          const elims = [];
          for (const z of live)
            if (z !== s && z !== v && weakLinked(s, z) && weakLinked(v, z)) elims.push({ cell: nodeCell(z), digit: nodeDigit(z) });
          if (elims.length) { best = path; best.elims = elims; continue; }
        }
        if (path.length + 2 > MAX_CHAIN_NODES || (best && path.length + 2 >= best.length)) continue;
        for (const w of linked) {
          if (!weakLinked(v, w)) continue;
          for (const x of strong[w]) {
            if (seen.has(x) || x === v) continue;
            seen.add(x);
            next.push([...path, w, x]);
          }
        }
      }
      frontier = next;
    }
  }
  return best ? chainStep(grid, cands, best, best.elims) : null;
}

// ── Public API ───────────────────────────────────────────────────────────────

const FINDERS = [
  (g, c) => findLastValue(g, c),
  (g, c) => findHiddenSingle(g, c, BOXES, 1.2),
  (g, c) => findHiddenSingle(g, c, LINES, 1.5),
  (g, c) => findDirectPointing(g, c),
  (g, c) => findDirectClaiming(g, c),
  (g, c) => findDirectHiddenSubset(g, c, 2, 2.0),
  (g, c) => findNakedSingle(g, c),
  (g, c) => findDirectHiddenSubset(g, c, 3, 2.5),
  (g, c) => findPointing(g, c),
  (g, c) => findClaiming(g, c),
  (g, c) => findNakedSubset(g, c, 2),
  (g, c) => findFish(g, c, 2),
  (g, c) => findHiddenSubset(g, c, 2),
  (g, c) => findNakedSubset(g, c, 3),
  (g, c) => findFish(g, c, 3),
  (g, c) => findHiddenSubset(g, c, 3),
  (g, c) => findXYWing(g, c),
  (g, c) => findXYZWing(g, c),
  (g, c) => findNakedSubset(g, c, 4),
  (g, c) => findFish(g, c, 4),
  (g, c) => findHiddenSubset(g, c, 4),
  (g, c) => findChain(g, c),
];

// grid: 81 numbers (0 = empty); cands: 81 Sets. Neither is modified.
export function findNextStep(grid, cands) {
  for (const find of FINDERS) {
    const step = find(grid, cands);
    if (step) return step;
  }
  return null;
}

export function applyStep(grid, cands, step) {
  for (const { cell, digit } of step.eliminations) cands[cell].delete(digit);
  if (step.place) place(grid, cands, step.place.cell, step.place.value);
}

export function gradePuzzle(puzzleStr) {
  const grid = Array.from(puzzleStr, ch => parseInt(ch, 10));
  const cands = buildCands(grid);
  let maxER = 0;
  const techniquesUsed = new Set();
  const techniqueCounts = {};
  let requiresBacktracking = false;
  let steps = 0;
  let erSum = 0;

  while (grid.includes(0)) {
    const step = findNextStep(grid, cands);
    if (!step) {
      maxER = 10.0;
      techniquesUsed.add('Backtracking');
      techniqueCounts['Backtracking'] = 1;
      requiresBacktracking = true;
      break;
    }
    applyStep(grid, cands, step);
    if (step.er > maxER) maxER = step.er;
    erSum += step.er;
    techniquesUsed.add(step.technique);
    techniqueCounts[step.technique] = (techniqueCounts[step.technique] || 0) + 1;
    if (++steps > 10000) { maxER = 10.0; requiresBacktracking = true; break; }
  }

  let difficulty;
  if (maxER < 2.0)      difficulty = 'Easy';
  else if (maxER < 3.0) difficulty = 'Medium';
  else if (maxER < 4.0) difficulty = 'Hard';
  else if (maxER < 5.0) difficulty = 'Fiendish';
  else if (maxER < 6.0) difficulty = 'Diabolical';
  else if (maxER < 8.0) difficulty = 'Extreme';
  else                   difficulty = 'Beyond Human';

  let appDifficulty;
  if (maxER < 2.0)      appDifficulty = 'Easy';
  else if (maxER < 3.0) appDifficulty = 'Medium';
  else if (maxER < 4.0) appDifficulty = 'Hard';
  else                   appDifficulty = 'Expert';

  return {
    er: maxER, er_sum: Math.round(erSum * 10) / 10, difficulty, app_difficulty: appDifficulty,
    hardest_technique: ER_NAMES[maxER] || 'Unknown',
    techniques_used: [...techniquesUsed],
    technique_counts: techniqueCounts,
    requires_backtracking: requiresBacktracking,
  };
}
