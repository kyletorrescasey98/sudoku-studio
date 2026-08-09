// Standalone client-side Sudoku generator. No dependencies.
// Ported from seed-puzzles.mjs (simpler backtracking generator, no logical-only guarantee).

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function isValid(g,r,c,n){
  for(let i=0;i<9;i++) if(g[r][i]===n || g[i][c]===n) return false;
  const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3;
  for(let rr=br;rr<br+3;rr++)
    for(let cc=bc;cc<bc+3;cc++)
      if(g[rr][cc]===n) return false;
  return true;
}

function findEmpty(g){
  for(let r=0;r<9;r++)
    for(let c=0;c<9;c++)
      if(g[r][c]===0) return [r,c];
  return null;
}

function solveFill(g){
  const pos=findEmpty(g);
  if(!pos) return true;
  const [r,c]=pos;
  for(const n of shuffle([1,2,3,4,5,6,7,8,9])){
    if(isValid(g,r,c,n)){
      g[r][c]=n;
      if(solveFill(g)) return true;
      g[r][c]=0;
    }
  }
  return false;
}

function countSols(g,limit=2){
  const pos=findEmpty(g);
  if(!pos) return 1;
  const [r,c]=pos;
  let count=0;
  for(let n=1;n<=9;n++){
    if(isValid(g,r,c,n)){
      g[r][c]=n;
      count+=countSols(g,limit);
      g[r][c]=0;
      if(count>=limit) return count;
    }
  }
  return count;
}

function generateSolution(){
  const g=Array.from({length:9},()=>Array(9).fill(0));
  solveFill(g);
  return g;
}

function carveClues(sol,target){
  const p=sol.map(r=>[...r]);
  let clues=81;
  for(const pos of shuffle([...Array(81).keys()])){
    if(clues<=target) break;
    const r=Math.floor(pos/9), c=pos%9;
    const bak=p[r][c];
    p[r][c]=0;
    // Uniqueness check on a copy so we don't corrupt p
    if(countSols(p.map(row=>[...row]))!==1){
      p[r][c]=bak;
    } else {
      clues--;
    }
  }
  return p;
}

const TARGETS = { Easy:38, Medium:30, Hard:25, Expert:23 };
const ADJECTIVES = ['Radiant','Obsidian','Frozen','Emerald','Golden','Kinetic','Phantom','Neon','Dusty','Ancient','Crystal','Solar','Twilight','Blazing','Vivid','Amber','Quiet','Whirling','Breezy'];
const NOUNS = ['Enigma','Vortex','Frontier','Riddle','Jewel','Pinnacle','Wanderer','Haven','Tempest','Delta','Inferno','Grove','Iris','Jungle','Galaxy','Blizzard','Orbit','Eclipse','Quest'];

function randomName(){
  return ADJECTIVES[Math.floor(Math.random()*ADJECTIVES.length)] + ' ' + NOUNS[Math.floor(Math.random()*NOUNS.length)];
}

function flatten(g){ return g.flat().join(''); }
function countClues(str){ let n=0; for(const ch of str) if(ch!=='0') n++; return n; }

export function generatePuzzle(difficulty='Medium'){
  const diff = (typeof difficulty === 'string')
    ? (difficulty[0].toUpperCase() + difficulty.slice(1).toLowerCase())
    : 'Medium';
  const target = TARGETS[diff] ?? TARGETS.Medium;
  const solution = generateSolution();
  const puzzle = carveClues(solution, target);
  const puzzleStr = flatten(puzzle);
  const solutionStr = flatten(solution);
  return {
    id: 'gen-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,6),
    name: randomName(),
    puzzle: puzzleStr,
    solution: solutionStr,
    difficulty: diff,
    clueCount: countClues(puzzleStr),
    author: 'App',
    authorUid: 'app-generated',
    isAI: true,
    isGenerated: true
  };
}
