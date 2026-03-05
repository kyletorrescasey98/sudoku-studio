#!/usr/bin/env node

// Fix specific missing solver record
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load Firebase config
const configContent = readFileSync(join(__dirname, 'public', 'firebase-config.js'), 'utf8');
const configMatch = configContent.match(/export const firebaseConfig = ({[\s\S]*?});/);
const firebaseConfig = eval('(' + configMatch[1] + ')');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const USER_ID = 'Vv1rNTEQMAYgEAFOVsuNOWYxc7a2';
const PUZZLE_ID = 'iG1hsEsq65dTiDP5bYGb';

async function fixSpecificSolverRecord() {
  try {
    console.log('🔧 Fixing missing solver record...');
    console.log(`User: ${USER_ID}`);
    console.log(`Puzzle: ${PUZZLE_ID}`);
    
    // 1. Check if puzzle exists
    const puzzleSnap = await getDoc(doc(db, 'puzzles', PUZZLE_ID));
    if (!puzzleSnap.exists()) {
      console.log('❌ Puzzle document does not exist!');
      console.log('💡 This is why the migration failed');
      return;
    }
    
    console.log('✅ Puzzle exists:', puzzleSnap.data().name);
    
    // 2. Get user profile for name
    const userSnap = await getDoc(doc(db, 'users', USER_ID));
    const userData = userSnap.exists() ? userSnap.data() : {};
    
    // 3. Create solver record
    const solverData = {
      name: userData.displayName || 
            userData.email?.split('@')[0] || 
            `User ${USER_ID.slice(0, 6)}`,
      solvedAt: new Date('2026-02-28T14:38:47'), // From debug output  
      timeSeconds: 2049  // 34:09
    };
    
    console.log('📝 Creating solver record with data:', solverData);
    
    await setDoc(doc(db, 'puzzles', PUZZLE_ID, 'solvers', USER_ID), solverData);
    
    console.log('✅ Solver record created successfully!');
    console.log('🎉 ftc1987@gmail.com should now appear in the "Happy Birthday Lucas" solved by list');
    
    // 4. Update puzzle solve count
    const solversSnap = await getDoc(doc(db, 'puzzles', PUZZLE_ID, 'solvers'));
    // Note: Can't easily count subcollection, but we can increment by 1
    
  } catch (error) {
    console.error('💥 Fix failed:', error);
  }
}

fixSpecificSolverRecord();