#!/usr/bin/env node
// replace-brute-force.mjs
// Replaces the 44 AI puzzles that require bifurcation with fresh logically-solvable ones.
// Keeps the original Firestore document ID and puzzle name.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            "AIzaSyBxxqqaD6tVbXiUuqKHfOImUOTyRx3gAeA",
  authDomain:        "sudoku-459d3.firebaseapp.com",
  projectId:         "sudoku-459d3",
  storageBucket:     "sudoku-459d3.firebasestorage.app",
  messagingSenderId: "40654864944",
  appId:             "1:40654864944:web:32f8041fce7c8a6738e3f5"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── The 44 puzzles that need replacing ────────────────────────
const TO_REPLACE = [
  // Medium
  { id: 'LOQ5D9tEFQB71E5ox2uV', difficulty: 'Medium' },
  { id: 'BLp259FX2fO2m7QrEPTn', difficulty: 'Medium' },
  { id: 'zoMgatP2bDTCNJUhaw9S', difficulty: 'Medium' },
  { id: 'dnKCjBweUru0TNJb8JO5', difficulty: 'Medium' },
  { id: 'f7oApOvhwllEg5BaNPE0', difficulty: 'Medium' },
  // Hard
  { id: 'OZ2bweO9fHDTW2F8Lign', difficulty: 'Hard' },
  { id: 'vsubdE7ZtuMnFGaaqLsi', difficulty: 'Hard' },
  { id: 'we4gfaaBX6IgWCoJsyFM', difficulty: 'Hard' },
  { id: 'TZbJAQm0wDRSoqTJa0e8', difficulty: 'Hard' },
  { id: '6xvnOZynCob5bzUMZFWf', difficulty: 'Hard' },
  { id: 'IzIXz4VCToL7k1jNsTfe', difficulty: 'Hard' },
  { id: 'GClcZAWqyJ0nNs9K2eC3', difficulty: 'Hard' },
  { id: 'YEXzfWBpQKGDlqlTrSmn', difficulty: 'Hard' },
  { id: 'c1E7IaJw4uFz3VseTr2U', difficulty: 'Hard' },
  { id: 'tgG52Lc8xV9CYeSWAhuB', difficulty: 'Hard' },
  { id: 'qlpk1jyVvwxNX1HmJfq2', difficulty: 'Hard' },
  { id: 'tdwbYKncBwr3vRZdNVBa', difficulty: 'Hard' },
  { id: 'GVwN2iVoTy4GeN9kgBxS', difficulty: 'Hard' },
  { id: 'F5rHEHIABlFl1HqLD8is', difficulty: 'Hard' },
  { id: '6x0LbN0EZD3pmrH8eQtX', difficulty: 'Hard' },
  { id: 'ceb4O0l64pkwjY3Rx7DQ', difficulty: 'Hard' },
  { id: 'rdPhH5uZ0KlJo2tSnIKj', difficulty: 'Hard' },
  { id: 'HtL7l3p66ESspKcOa70d', difficulty: 'Hard' },
  { id: '2smPYVfum4sFE9VJFUJW', difficulty: 'Hard' },
  { id: 'o5YjnIba37rpPpPboSvy', difficulty: 'Hard' },
  // Expert
  { id: 'mlR6c4IR0fgiRsIl4Xi0', difficulty: 'Expert' },
  { id: 'pNDKEyE32c9nuwYR9oXC', difficulty: 'Expert' },
  { id: 'aNcq7JUWqjETQB2YhsG4', difficulty: 'Expert' },
  { id: '4bAFfEL1bfedOcCY53Wm', difficulty: 'Expert' },
  { id: 'JcOJUmqCP1GSGN4aAvZc', difficulty: 'Expert' },
  { id: '1uAWgPVQp1T8CQydEbx3', difficulty: 'Expert' },
  { id: 'I95Bh3AtHbWQ8XeWKsgk', difficulty: 'Expert' },
  { id: 'PCHRhrmnh0Ji10QHYJsC', difficulty: 'Expert' },
  { id: 'xLGbsCLhJzYe29xLQCwY', difficulty: 'Expert' },
  { id: 'l1clpSXWdpOoK2vszEKm', difficulty: 'Expert' },
  { id: 'C9VBN6Zoo52hdwDCK0cX', difficulty: 'Expert' },
  { id: 'eZkHFhNOpYnjIoxOFG38', difficulty: 'Expert' },
  { id: 'NmP3x4u53STOBQqNedcZ', difficulty: 'Expert' },
  { id: 'EZm1yYuIlG3LmwjmO1Hc', difficulty: 'Expert' },
  { id: 'zQqqs269HVwxJ8aqMpxt', difficulty: 'Expert' },
  { id: 'z0FIN2y3KazamexinlgZ', difficulty: 'Expert' },
  { id: 'Csnrm9fhWjfMcbjaVOpb', difficulty: 'Expert' },
  { id: 'RmVMTb1t6xfskWznIrTs', difficulty: 'Expert' },
  { id: '3BtEpt4DznDbjgw9IyJV', difficulty: 'Expert' },
];

// ── Sudoku generator ──────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function isValid(g,r,c,n) {
  for (let i=0;i<9;i++) if(g[r][i]===n||g[i][c]===n) return false;
  const br=Math.floor(r/3)*3,bc=Math.floor(c/3)*3;
  for (let rr=br;rr<br+3;rr++) for(let cc=bc;cc<bc+3;cc++) if(g[rr][cc]===n) return false;
  return true;
}
function findEmpty(g) {
  for (let r=0;r<9;r++) for(let c=0;c<9;c++) if(g[r][c]===0) return [r,c];
  return null;
}
function solveFill(g) {
  const pos=findEmpty(g); if(!pos) return true;
  const [r,c]=pos;
  for (const n of shuffle([1,2,3,4,5,6,7,8,9])) {
    if (isValid(g,r,c,n)) { g[r][c]=n; if(solveFill(g)) return true; g[r][c]=0; }
  }
  return false;
}
function countSols(g, limit=2) {
  const pos=findEmpty(g); if(!pos) return 1;
  const [r,c]=pos; let count=0;
  for (let n=1;n<=9;n++) {
    if (isValid(g,r,c,n)) { g[r][c]=n; count+=countSols(g,limit); g[r][c]=0; if(count>=limit) return count; }
  }
  return count;
}
function generateSolution() {
  const g=Array.from({length:9},()=>Array(9).fill(0)); solveFill(g); return g;
}
function createPuzzle(sol, difficulty) {
  const targets = { Easy:38, Medium:30, Hard:25, Expert:21 };
  const target = targets[difficulty] ?? 30;
  const p = sol.map(r=>[...r]);
  let clues = 81;
  for (const pos of shuffle([...Array(81).keys()])) {
    if (clues <= target) break;
    const r=Math.floor(pos/9), c=pos%9, bak=p[r][c];
    p[r][c]=0;
    if (countSols(p.map(row=>[...row])) !== 1) p[r][c]=bak; else clues--;
  }
  return p;
}
function flattenPuzzle(arr) { return arr.flat().join(''); }
function countClues(p) { return p.flat().filter(v=>v!==0).length; }

// ── Full logical solver (no bifurcation allowed) ──────────────
function rowCells(r)  { return Array.from({length:9},(_,j)=>r*9+j); }
function colCells(c)  { return Array.from({length:9},(_,j)=>j*9+c); }
function boxCells(b)  {
  const br=Math.floor(b/3)*3, bc=(b%3)*3, out=[];
  for (let r=br;r<br+3;r++) for(let c=bc;c<bc+3;c++) out.push(r*9+c);
  return out;
}
function cellBox(i) { return Math.floor(Math.floor(i/9)/3)*3+Math.floor((i%9)/3); }
function cellRow(i) { return Math.floor(i/9); }
function cellCol(i) { return i%9; }

const ALL_UNITS = [
  ...Array.from({length:9},(_,r)=>rowCells(r)),
  ...Array.from({length:9},(_,c)=>colCells(c)),
  ...Array.from({length:9},(_,b)=>boxCells(b)),
];

function buildCands(grid) {
  const cands = Array.from({length:81},()=>new Set());
  for (let i=0;i<81;i++) {
    if (grid[i]!==0) continue;
    const r=cellRow(i),c=cellCol(i),b=cellBox(i);
    const seen=new Set();
    for (let j=0;j<9;j++) seen.add(grid[r*9+j]);
    for (let j=0;j<9;j++) seen.add(grid[j*9+c]);
    for (const bc of boxCells(b)) seen.add(grid[bc]);
    for (let n=1;n<=9;n++) if(!seen.has(n)) cands[i].add(n);
  }
  return cands;
}

function place(grid, cands, i, n) {
  grid[i]=n; cands[i].clear();
  for (const j of [...rowCells(cellRow(i)),...colCells(cellCol(i)),...boxCells(cellBox(i))]) cands[j].delete(n);
}

function* subsets(arr, k) {
  if (k===0) { yield []; return; }
  for (let i=0;i<=arr.length-k;i++) for (const rest of subsets(arr.slice(i+1),k-1)) yield [arr[i],...rest];
}
function union(sets) { const u=new Set(); for (const s of sets) for (const v of s) u.add(v); return u; }

function logicalStep(grid, cands) {
  // 1. Naked Single
  for (let i=0;i<81;i++) if(grid[i]===0&&cands[i].size===1){place(grid,cands,i,[...cands[i]][0]);return true;}
  // 2. Hidden Single
  for (const unit of ALL_UNITS) {
    const empty=unit.filter(i=>grid[i]===0);
    for (let n=1;n<=9;n++){const p=empty.filter(i=>cands[i].has(n));if(p.length===1){place(grid,cands,p[0],n);return true;}}
  }
  // 3. Naked Pair/Triple/Quad
  for (const unit of ALL_UNITS) {
    const empty=unit.filter(i=>grid[i]===0);
    for (const k of [2,3,4]) for (const combo of subsets(empty,k)){
      const combined=union(combo.map(i=>cands[i]));
      if(combined.size===k){let ch=false;for(const i of empty){if(combo.includes(i))continue;for(const n of combined)if(cands[i].has(n)){cands[i].delete(n);ch=true;}}if(ch)return true;}
    }
  }
  // 4. Hidden Pair/Triple/Quad
  for (const unit of ALL_UNITS) {
    const empty=unit.filter(i=>grid[i]===0);
    for (const k of [2,3,4]){
      const dc={};
      for(let n=1;n<=9;n++){const cells=empty.filter(i=>cands[i].has(n));if(cells.length>=2&&cells.length<=k)dc[n]=cells;}
      for(const combo of subsets(Object.keys(dc).map(Number),k)){
        const covered=new Set(combo.flatMap(n=>dc[n]));
        if(covered.size===k){let ch=false;for(const i of covered)for(const n of [...cands[i]])if(!combo.includes(n)){cands[i].delete(n);ch=true;}if(ch)return true;}
      }
    }
  }
  // 5. Pointing Pairs/Triples
  for (let b=0;b<9;b++){
    const bc=boxCells(b).filter(i=>grid[i]===0);
    for(let n=1;n<=9;n++){
      const cells=bc.filter(i=>cands[i].has(n)); if(cells.length<2) continue;
      let ch=false;
      const rows=new Set(cells.map(cellRow)),cols=new Set(cells.map(cellCol));
      if(rows.size===1) for(const i of rowCells([...rows][0])) if(grid[i]===0&&!cells.includes(i)&&cands[i].has(n)){cands[i].delete(n);ch=true;}
      if(cols.size===1) for(const i of colCells([...cols][0])) if(grid[i]===0&&!cells.includes(i)&&cands[i].has(n)){cands[i].delete(n);ch=true;}
      if(ch) return true;
    }
  }
  // 6. Box-Line Reduction
  for(let r=0;r<9;r++) for(let n=1;n<=9;n++){
    const cells=rowCells(r).filter(i=>grid[i]===0&&cands[i].has(n)); if(cells.length<2) continue;
    const boxes=new Set(cells.map(cellBox));
    if(boxes.size===1){let ch=false;for(const i of boxCells([...boxes][0]))if(grid[i]===0&&!cells.includes(i)&&cands[i].has(n)){cands[i].delete(n);ch=true;}if(ch)return true;}
  }
  for(let c=0;c<9;c++) for(let n=1;n<=9;n++){
    const cells=colCells(c).filter(i=>grid[i]===0&&cands[i].has(n)); if(cells.length<2) continue;
    const boxes=new Set(cells.map(cellBox));
    if(boxes.size===1){let ch=false;for(const i of boxCells([...boxes][0]))if(grid[i]===0&&!cells.includes(i)&&cands[i].has(n)){cands[i].delete(n);ch=true;}if(ch)return true;}
  }
  // 7-9. X-Wing / Swordfish / Jellyfish
  for(const fs of [2,3,4]) for(let n=1;n<=9;n++){
    const rwn=[];
    for(let r=0;r<9;r++){const cols=rowCells(r).filter(i=>grid[i]===0&&cands[i].has(n)).map(cellCol);if(cols.length>=2&&cols.length<=fs)rwn.push({r,cols});}
    for(const combo of subsets(rwn,fs)){
      const ac=new Set(combo.flatMap(x=>x.cols));
      if(ac.size===fs){let ch=false;for(const col of ac)for(const i of colCells(col))if(grid[i]===0&&!combo.some(x=>x.r===cellRow(i))&&cands[i].has(n)){cands[i].delete(n);ch=true;}if(ch)return true;}
    }
    const cwn=[];
    for(let c=0;c<9;c++){const rows=colCells(c).filter(i=>grid[i]===0&&cands[i].has(n)).map(cellRow);if(rows.length>=2&&rows.length<=fs)cwn.push({c,rows});}
    for(const combo of subsets(cwn,fs)){
      const ar=new Set(combo.flatMap(x=>x.rows));
      if(ar.size===fs){let ch=false;for(const row of ar)for(const i of rowCells(row))if(grid[i]===0&&!combo.some(x=>x.c===cellCol(i))&&cands[i].has(n)){cands[i].delete(n);ch=true;}if(ch)return true;}
    }
  }
  // sees helper
  const sees=(i,j)=>i!==j&&(cellRow(i)===cellRow(j)||cellCol(i)===cellCol(j)||cellBox(i)===cellBox(j));
  const biCells=[];
  for(let i=0;i<81;i++) if(grid[i]===0&&cands[i].size===2) biCells.push(i);
  // 10. XY-Wing
  for(const pivot of biCells){
    const [A,B]=[...cands[pivot]];
    for(const p1 of biCells.filter(p=>p!==pivot&&sees(p,pivot)&&cands[p].has(A))){
      const [C]=[...cands[p1]].filter(x=>x!==A);
      for(const p2 of biCells.filter(p=>p!==pivot&&p!==p1&&sees(p,pivot)&&cands[p].has(B)&&cands[p].has(C))){
        let ch=false;
        for(let i=0;i<81;i++) if(grid[i]===0&&i!==p1&&i!==p2&&cands[i].has(C)&&sees(i,p1)&&sees(i,p2)){cands[i].delete(C);ch=true;}
        if(ch) return true;
      }
    }
  }
  // 11. XYZ-Wing
  for(let i=0;i<81;i++){
    if(grid[i]===0&&cands[i].size!==3) continue;
    const [A,B,C_]=[...cands[i]];
    for(const [zA,zB,zC] of [[A,B,C_],[A,C_,B],[B,C_,A]]){
      const pA=biCells.filter(p=>sees(p,i)&&cands[p].has(zA)&&cands[p].has(zC));
      const pB=biCells.filter(p=>sees(p,i)&&cands[p].has(zB)&&cands[p].has(zC));
      for(const pa of pA) for(const pb of pB){
        if(pa===pb) continue;
        let ch=false;
        for(let j=0;j<81;j++) if(grid[j]===0&&j!==i&&j!==pa&&j!==pb&&cands[j].has(zC)&&sees(j,i)&&sees(j,pa)&&sees(j,pb)){cands[j].delete(zC);ch=true;}
        if(ch) return true;
      }
    }
  }
  return false;
}

function isSolvableLogically(puzzleArr) {
  const grid = puzzleArr.flat().map(Number);
  const cands = buildCands(grid);
  let steps = 0;
  while (grid.includes(0)) {
    if (!logicalStep(grid, cands)) return false;
    if (++steps > 10000) return false;
  }
  return true;
}

// ── Generate a logically-solvable puzzle ──────────────────────
function generateLogical(difficulty) {
  let attempts = 0;
  while (true) {
    attempts++;
    const sol = generateSolution();
    const puz = createPuzzle(sol, difficulty);
    if (isSolvableLogically(puz)) return { puz, sol };
    if (attempts % 20 === 0) process.stdout.write(` (${attempts} attempts)`);
  }
}

// ── Main ──────────────────────────────────────────────────────
console.log(`Replacing ${TO_REPLACE.length} puzzles that require bifurcation...\n`);

let ok = 0, failed = 0;
for (const { id, difficulty } of TO_REPLACE) {
  const ref = doc(db, 'puzzles', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) { console.log(`  ❌ ${id} not found in Firestore`); failed++; continue; }

  const existing = snap.data();
  process.stdout.write(`  [${difficulty.padEnd(6)}] "${existing.name}" … generating`);

  const { puz, sol } = generateLogical(difficulty);
  const puzzleStr = flattenPuzzle(puz);
  const solStr    = sol.flat().join('');
  const clueCount = countClues(puz);

  await setDoc(ref, {
    ...existing,
    puzzle:    puzzleStr,
    solution:  solStr,
    clueCount,
  });

  console.log(` ✅ (${clueCount} clues)`);
  ok++;
}

console.log(`\nDone! ${ok} replaced, ${failed} failed.`);
process.exit(0);
