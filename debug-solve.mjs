#!/usr/bin/env node

// Debug script to check specific user's solve record
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, query, where, orderBy } from 'firebase/firestore';
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
const PUZZLE_NAME = 'Trying';

console.log(`🔍 Debugging solve record for ${USER_ID}`);
console.log(`📝 Looking for puzzle: "${PUZZLE_NAME}"`);

async function debugUserSolve() {
  try {
    // 1. Get user's solve records
    console.log('\n📋 Checking user solve records...');
    const solvesSnap = await getDocs(collection(db, 'users', USER_ID, 'solves'));
    
    console.log(`Found ${solvesSnap.size} total solves`);
    
    // Find the specific puzzle solve
    let targetSolve = null;
    solvesSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.puzzleName === PUZZLE_NAME) {
        targetSolve = { id: doc.id, ...data };
      }
    });
    
    if (!targetSolve) {
      console.log(`❌ No solve record found for "${PUZZLE_NAME}"`);
      return;
    }
    
    console.log(`✅ Found solve record:`, {
      id: targetSolve.id,
      puzzleName: targetSolve.puzzleName,
      puzzleId: targetSolve.puzzleId || 'MISSING!',
      timeSeconds: targetSolve.timeSeconds,
      difficulty: targetSolve.difficulty,
      solvedAt: targetSolve.solvedAt?.toDate?.()?.toLocaleString() || 'Unknown'
    });
    
    // 2. If no puzzleId, try to find the actual puzzle
    if (!targetSolve.puzzleId) {
      console.log('\n🔍 No puzzleId found. Searching for matching puzzle...');
      
      // Search all puzzles for one with this name
      const puzzlesSnap = await getDocs(collection(db, 'puzzles'));
      let foundPuzzle = null;
      
      puzzlesSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.name === PUZZLE_NAME) {
          foundPuzzle = { id: doc.id, ...data };
        }
      });
      
      if (foundPuzzle) {
        console.log(`✅ Found matching puzzle:`, {
          id: foundPuzzle.id,
          name: foundPuzzle.name,
          author: foundPuzzle.author,
          difficulty: foundPuzzle.difficulty
        });
        
        // 3. Check if solver record exists for this puzzle
        console.log('\n👥 Checking solver records...');
        const solverSnap = await getDoc(doc(db, 'puzzles', foundPuzzle.id, 'solvers', USER_ID));
        
        if (solverSnap.exists()) {
          console.log('✅ Solver record exists:', solverSnap.data());
        } else {
          console.log('❌ No solver record found');
          console.log('💡 This explains why the user is not in the Solved By list!');
          console.log(`🛠️ To fix: Create solver record in /puzzles/${foundPuzzle.id}/solvers/${USER_ID}`);
        }
        
      } else {
        console.log(`❌ No puzzle found with name "${PUZZLE_NAME}"`);
        console.log('💡 The puzzle might have been deleted or renamed');
      }
    } else {
      // Has puzzleId, check solver record
      console.log(`\n👥 Checking solver record for puzzleId: ${targetSolve.puzzleId}`);
      const solverSnap = await getDoc(doc(db, 'puzzles', targetSolve.puzzleId, 'solvers', USER_ID));
      
      if (solverSnap.exists()) {
        console.log('✅ Solver record exists:', solverSnap.data());
      } else {
        console.log('❌ No solver record found despite having puzzleId');
        console.log('💡 Migration should have fixed this - something went wrong');
      }
    }
    
  } catch (error) {
    console.error('💥 Debug failed:', error);
  }
}

debugUserSolve();