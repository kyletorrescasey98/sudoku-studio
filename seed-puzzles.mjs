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
      const sol = generateSolution();
      const puz = createPuzzle(sol, diff);
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
