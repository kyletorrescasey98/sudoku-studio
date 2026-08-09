import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';

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

// ── Sudoku generator ─────────────────────────────────────────
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function isValid(g,r,c,n){for(let i=0;i<9;i++)if(g[r][i]===n||g[i][c]===n)return false;const br=Math.floor(r/3)*3,bc=Math.floor(c/3)*3;for(let rr=br;rr<br+3;rr++)for(let cc=bc;cc<bc+3;cc++)if(g[rr][cc]===n)return false;return true;}
function findEmpty(g){for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(g[r][c]===0)return[r,c];return null;}
function solveFill(g){const pos=findEmpty(g);if(!pos)return true;const[r,c]=pos;for(const n of shuffle([1,2,3,4,5,6,7,8,9])){if(isValid(g,r,c,n)){g[r][c]=n;if(solveFill(g))return true;g[r][c]=0;}}return false;}
function countSols(g,limit=2){const pos=findEmpty(g);if(!pos)return 1;const[r,c]=pos;let count=0;for(let n=1;n<=9;n++){if(isValid(g,r,c,n)){g[r][c]=n;count+=countSols(g,limit);g[r][c]=0;if(count>=limit)return count;}}return count;}
function generateSolution(){const g=Array.from({length:9},()=>Array(9).fill(0));solveFill(g);return g;}
function createPuzzle(sol,difficulty){const targets={easy:38,medium:30,hard:25,expert:21};const target=targets[difficulty]??30;const p=sol.map(r=>[...r]);let clues=81;for(const pos of shuffle([...Array(81).keys()])){if(clues<=target)break;const r=Math.floor(pos/9),c=pos%9,bak=p[r][c];p[r][c]=0;if(countSols(p.map(row=>[...row]))!==1)p[r][c]=bak;else clues--;}return p;}
function flattenPuzzle(arr){return arr.flat().join('');}
function countClues(p){return p.flat().filter(v=>v!==0).length;}

// ── Full logical solver (ensures no bifurcation needed) ───────
const _rowCells=r=>Array.from({length:9},(_,j)=>r*9+j);
const _colCells=c=>Array.from({length:9},(_,j)=>j*9+c);
const _boxCells=b=>{const br=Math.floor(b/3)*3,bc=(b%3)*3,out=[];for(let r=br;r<br+3;r++)for(let c=bc;c<bc+3;c++)out.push(r*9+c);return out;};
const _cellBox=i=>Math.floor(Math.floor(i/9)/3)*3+Math.floor((i%9)/3);
const _cellRow=i=>Math.floor(i/9);
const _cellCol=i=>i%9;
const _ALL_UNITS=[...Array.from({length:9},(_,r)=>_rowCells(r)),...Array.from({length:9},(_,c)=>_colCells(c)),...Array.from({length:9},(_,b)=>_boxCells(b))];
function _buildCands(grid){const cands=Array.from({length:81},()=>new Set());for(let i=0;i<81;i++){if(grid[i]!==0)continue;const r=_cellRow(i),c=_cellCol(i),b=_cellBox(i);const seen=new Set();for(let j=0;j<9;j++)seen.add(grid[r*9+j]);for(let j=0;j<9;j++)seen.add(grid[j*9+c]);for(const bc of _boxCells(b))seen.add(grid[bc]);for(let n=1;n<=9;n++)if(!seen.has(n))cands[i].add(n);}return cands;}
function _place(grid,cands,i,n){grid[i]=n;cands[i].clear();for(const j of[..._rowCells(_cellRow(i)),..._colCells(_cellCol(i)),..._boxCells(_cellBox(i))])cands[j].delete(n);}
function* _subsets(arr,k){if(k===0){yield[];return;}for(let i=0;i<=arr.length-k;i++)for(const rest of _subsets(arr.slice(i+1),k-1))yield[arr[i],...rest];}
function _union(sets){const u=new Set();for(const s of sets)for(const v of s)u.add(v);return u;}
function _logicalStep(grid,cands){
  for(let i=0;i<81;i++)if(grid[i]===0&&cands[i].size===1){_place(grid,cands,i,[...cands[i]][0]);return true;}
  for(const unit of _ALL_UNITS){const empty=unit.filter(i=>grid[i]===0);for(let n=1;n<=9;n++){const p=empty.filter(i=>cands[i].has(n));if(p.length===1){_place(grid,cands,p[0],n);return true;}}}
  for(const unit of _ALL_UNITS){const empty=unit.filter(i=>grid[i]===0);for(const k of[2,3,4])for(const combo of _subsets(empty,k)){const combined=_union(combo.map(i=>cands[i]));if(combined.size===k){let ch=false;for(const i of empty){if(combo.includes(i))continue;for(const n of combined)if(cands[i].has(n)){cands[i].delete(n);ch=true;}}if(ch)return true;}}}
  for(const unit of _ALL_UNITS){const empty=unit.filter(i=>grid[i]===0);for(const k of[2,3,4]){const dc={};for(let n=1;n<=9;n++){const cells=empty.filter(i=>cands[i].has(n));if(cells.length>=2&&cells.length<=k)dc[n]=cells;}for(const combo of _subsets(Object.keys(dc).map(Number),k)){const covered=new Set(combo.flatMap(n=>dc[n]));if(covered.size===k){let ch=false;for(const i of covered)for(const n of[...cands[i]])if(!combo.includes(n)){cands[i].delete(n);ch=true;}if(ch)return true;}}}}
  for(let b=0;b<9;b++){const bc=_boxCells(b).filter(i=>grid[i]===0);for(let n=1;n<=9;n++){const cells=bc.filter(i=>cands[i].has(n));if(cells.length<2)continue;let ch=false;const rows=new Set(cells.map(_cellRow)),cols=new Set(cells.map(_cellCol));if(rows.size===1)for(const i of _rowCells([...rows][0]))if(grid[i]===0&&!cells.includes(i)&&cands[i].has(n)){cands[i].delete(n);ch=true;}if(cols.size===1)for(const i of _colCells([...cols][0]))if(grid[i]===0&&!cells.includes(i)&&cands[i].has(n)){cands[i].delete(n);ch=true;}if(ch)return true;}}
  for(let r=0;r<9;r++)for(let n=1;n<=9;n++){const cells=_rowCells(r).filter(i=>grid[i]===0&&cands[i].has(n));if(cells.length<2)continue;const boxes=new Set(cells.map(_cellBox));if(boxes.size===1){let ch=false;for(const i of _boxCells([...boxes][0]))if(grid[i]===0&&!cells.includes(i)&&cands[i].has(n)){cands[i].delete(n);ch=true;}if(ch)return true;}}
  for(let c=0;c<9;c++)for(let n=1;n<=9;n++){const cells=_colCells(c).filter(i=>grid[i]===0&&cands[i].has(n));if(cells.length<2)continue;const boxes=new Set(cells.map(_cellBox));if(boxes.size===1){let ch=false;for(const i of _boxCells([...boxes][0]))if(grid[i]===0&&!cells.includes(i)&&cands[i].has(n)){cands[i].delete(n);ch=true;}if(ch)return true;}}
  for(const fs of[2,3,4])for(let n=1;n<=9;n++){const rwn=[];for(let r=0;r<9;r++){const cols=_rowCells(r).filter(i=>grid[i]===0&&cands[i].has(n)).map(_cellCol);if(cols.length>=2&&cols.length<=fs)rwn.push({r,cols});}for(const combo of _subsets(rwn,fs)){const ac=new Set(combo.flatMap(x=>x.cols));if(ac.size===fs){let ch=false;for(const col of ac)for(const i of _colCells(col))if(grid[i]===0&&!combo.some(x=>x.r===_cellRow(i))&&cands[i].has(n)){cands[i].delete(n);ch=true;}if(ch)return true;}}const cwn=[];for(let c=0;c<9;c++){const rows=_colCells(c).filter(i=>grid[i]===0&&cands[i].has(n)).map(_cellRow);if(rows.length>=2&&rows.length<=fs)cwn.push({c,rows});}for(const combo of _subsets(cwn,fs)){const ar=new Set(combo.flatMap(x=>x.rows));if(ar.size===fs){let ch=false;for(const row of ar)for(const i of _rowCells(row))if(grid[i]===0&&!combo.some(x=>x.c===_cellCol(i))&&cands[i].has(n)){cands[i].delete(n);ch=true;}if(ch)return true;}}}
  const sees=(i,j)=>i!==j&&(_cellRow(i)===_cellRow(j)||_cellCol(i)===_cellCol(j)||_cellBox(i)===_cellBox(j));
  const bi=[];for(let i=0;i<81;i++)if(grid[i]===0&&cands[i].size===2)bi.push(i);
  for(const pv of bi){const[A,B]=[...cands[pv]];for(const p1 of bi.filter(p=>p!==pv&&sees(p,pv)&&cands[p].has(A))){const[C]=[...cands[p1]].filter(x=>x!==A);for(const p2 of bi.filter(p=>p!==pv&&p!==p1&&sees(p,pv)&&cands[p].has(B)&&cands[p].has(C))){let ch=false;for(let i=0;i<81;i++)if(grid[i]===0&&i!==p1&&i!==p2&&cands[i].has(C)&&sees(i,p1)&&sees(i,p2)){cands[i].delete(C);ch=true;}if(ch)return true;}}}
  for(let i=0;i<81;i++){if(grid[i]===0&&cands[i].size!==3)continue;const[A,B,C_]=[...cands[i]];for(const[zA,zB,zC]of[[A,B,C_],[A,C_,B],[B,C_,A]]){const pA=bi.filter(p=>sees(p,i)&&cands[p].has(zA)&&cands[p].has(zC));const pB=bi.filter(p=>sees(p,i)&&cands[p].has(zB)&&cands[p].has(zC));for(const pa of pA)for(const pb of pB){if(pa===pb)continue;let ch=false;for(let j=0;j<81;j++)if(grid[j]===0&&j!==i&&j!==pa&&j!==pb&&cands[j].has(zC)&&sees(j,i)&&sees(j,pa)&&sees(j,pb)){cands[j].delete(zC);ch=true;}if(ch)return true;}}}
  return false;
}
function isSolvableLogically(puzzleArr){
  const grid=puzzleArr.flat().map(Number);
  const cands=_buildCands(grid);
  let steps=0;
  while(grid.includes(0)){if(!_logicalStep(grid,cands))return false;if(++steps>10000)return false;}
  return true;
}
// Retry generation until a logically-solvable puzzle is produced
function generateLogicalPuzzle(difficulty){
  while(true){const sol=generateSolution();const puz=createPuzzle(sol,difficulty);if(isSolvableLogically(puz))return puz;}
}

// ── Name lists ────────────────────────────────────────────────
const ADJECTIVES = [
  'Radiant','Crimson','Frozen','Eternal','Blazing',
  'Hollow','Ivory','Shattered','Gilded','Silent',
  'Cursed','Forgotten','Luminous','Arcane','Veiled',
  'Scarlet','Obsidian','Celestial','Sovereign','Phantom',
  'Ashen','Fractal','Spectral','Infernal','Verdant',
  'Molten','Nebular','Abyssal','Onyx','Serene',
  'Twisted','Infinite','Primal','Exalted','Fading',
  'Ancient','Midnight','Crystal','Hallowed','Electric',
  'Sunken','Gilded','Boundless','Woven','Shimmering',
  'Forsaken','Polar','Tempest','Auric','Mythic',
  'Drifting','Eclipsed','Hollow','Wandering','Spectral',
  'Iron','Chrome','Ember','Storm','Dire',
  'Vivid','Crumbling','Nether','Veiled','Stark',
  'Prism','Broken','Ascendant','Lucid','Wild'
];
const NOUNS = [
  'Enigma','Oracle','Cipher','Prism','Rift',
  'Codex','Wraith','Nexus','Sanctum','Specter',
  'Labyrinth','Vortex','Mirage','Relic','Sigil',
  'Abyss','Expanse','Crucible','Zenith','Beacon',
  'Paradox','Epoch','Shroud','Monolith','Theorem',
  'Chronicle','Cascade','Dominion','Apparition','Fracture',
  'Meridian','Pinnacle','Reverie','Solstice','Tempest',
  'Undertow','Vestige','Wanderer','Horizon','Eclipse',
  'Obelisk','Nebula','Omen','Passage','Riddle',
  'Spiral','Talisman','Umbra','Verdict','Axiom',
  'Threshold','Remnant','Hollow','Citadel','Syntax',
  'Fragment','Sequence','Archive','Labyrinth','Vector',
  'Current','Nexus','Drift','Portal','Terminus'
];

const usedNames = new Set();
function randomName() {
  let name, attempts = 0;
  do {
    const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    name = `${adj} ${noun}`;
    attempts++;
    if (attempts > 10000) throw new Error('Ran out of unique names');
  } while (usedNames.has(name));
  usedNames.add(name);
  return name;
}

// ── Count existing puzzles per difficulty ─────────────────────
async function countExisting() {
  const snap = await getDocs(collection(db, 'puzzles'));
  const counts = { easy: 0, medium: 0, hard: 0, expert: 0 };
  snap.forEach(d => {
    const diff = (d.data().difficulty || '').toLowerCase();
    if (counts[diff] !== undefined) counts[diff]++;
  });

  // Also collect existing names to avoid duplicates
  snap.forEach(d => {
    const n = d.data().name;
    if (n) usedNames.add(n);
  });

  return counts;
}

// ── Main ──────────────────────────────────────────────────────
const TARGET = 100;
const difficulties = ['easy','medium','hard','expert'];

console.log('Fetching existing puzzle counts…');
const existing = await countExisting();
console.log('Existing:', existing);

let uploaded = 0, failed = 0;

for (const diff of difficulties) {
  const have = existing[diff] ?? 0;
  const need = Math.max(0, TARGET - have);
  console.log(`\n── ${diff.toUpperCase()} ── (have ${have}, adding ${need})`);

  for (let i = 0; i < need; i++) {
    const name = randomName();
    process.stdout.write(`  [${i+1}/${need}] Generating "${name}"… `);
    try {
      const puz = generateLogicalPuzzle(diff);
      const clueCount = countClues(puz);

      await addDoc(collection(db, 'puzzles'), {
        name,
        puzzle:     flattenPuzzle(puz),
        author:     'App',
        authorUid:  'app-seed',
        difficulty: diff.charAt(0).toUpperCase() + diff.slice(1),
        clueCount,
        isAI:       false,
        createdAt:  serverTimestamp()
      });

      console.log(`✅ (${clueCount} clues)`);
      uploaded++;
    } catch(err) {
      console.log(`❌ ${err.message}`);
      failed++;
    }
  }
}

console.log(`\nDone! ${uploaded} uploaded, ${failed} failed.`);
process.exit(0);
