#!/usr/bin/env node

// Migration script to fix missing solver records
// Run this to ensure all historical solves appear in "Solved By" lists

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, query, where } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load Firebase config
let firebaseConfig;
try {
  const configContent = readFileSync(join(__dirname, 'public', 'firebase-config.js'), 'utf8');
  // Extract config object from the export
  const configMatch = configContent.match(/export const firebaseConfig = ({[\s\S]*?});/);
  if (configMatch) {
    firebaseConfig = eval('(' + configMatch[1] + ')');
  } else {
    throw new Error('Could not parse firebase config');
  }
} catch (error) {
  console.error('Error loading Firebase config:', error);
  console.log('Make sure firebase-config.js exists in the public directory');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log('🚀 Starting solver records migration...');

async function migrateUserSolverRecords() {
  try {
    // Get all users
    console.log('📋 Finding all users...');
    const usersSnap = await getDocs(collection(db, 'users'));
    console.log(`Found ${usersSnap.size} users`);

    let totalSolves = 0;
    let createdRecords = 0;
    let existingRecords = 0;
    let errors = 0;

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      console.log(`\n👤 Processing user: ${userId}`);
      console.log(`   Display name: ${userData.displayName || userData.email || 'Unknown'}`);

      try {
        // Get all solves for this user
        const solvesSnap = await getDocs(collection(db, 'users', userId, 'solves'));
        console.log(`   Found ${solvesSnap.size} solves`);
        totalSolves += solvesSnap.size;

        for (const solveDoc of solvesSnap.docs) {
          const solveData = solveDoc.data();
          const puzzleId = solveData.puzzleId;
          
          if (!puzzleId) {
            console.log(`   ⚠️ Skipping solve without puzzleId: ${solveDoc.id}`);
            continue;
          }

          try {
            // Check if solver record already exists
            const solverRef = doc(db, 'puzzles', puzzleId, 'solvers', userId);
            const solverSnap = await getDoc(solverRef);

            if (solverSnap.exists()) {
              existingRecords++;
              continue; // Already exists, skip
            }

            // Create missing solver record
            const solverData = {
              name: userData.displayName || 
                    userData.name || 
                    userData.email?.split('@')[0] || 
                    `User ${userId.slice(0, 6)}`,
              solvedAt: solveData.solvedAt || new Date(),
            };

            // Add time if available
            if (solveData.timeSeconds != null) {
              solverData.timeSeconds = solveData.timeSeconds;
            }

            await setDoc(solverRef, solverData);
            createdRecords++;
            console.log(`   ✅ Created solver record for puzzle ${puzzleId}`);

          } catch (solveError) {
            console.error(`   ❌ Error processing solve ${solveDoc.id}:`, solveError.message);
            errors++;
          }
        }

      } catch (userError) {
        console.error(`❌ Error processing user ${userId}:`, userError.message);
        errors++;
      }
    }

    console.log('\n🎉 Migration completed!');
    console.log(`📊 Summary:`);
    console.log(`   Total solves processed: ${totalSolves}`);
    console.log(`   Solver records created: ${createdRecords}`);
    console.log(`   Existing records (skipped): ${existingRecords}`);
    console.log(`   Errors: ${errors}`);

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

// Also migrate puzzle solve counts
async function updatePuzzleSolveCounts() {
  console.log('\n🔢 Updating puzzle solve counts...');
  
  try {
    const puzzlesSnap = await getDocs(collection(db, 'puzzles'));
    let updatedPuzzles = 0;

    for (const puzzleDoc of puzzlesSnap.docs) {
      const puzzleId = puzzleDoc.id;
      const solversSnap = await getDocs(collection(db, 'puzzles', puzzleId, 'solvers'));
      const currentCount = puzzleDoc.data().solveCount || 0;
      const actualCount = solversSnap.size;

      if (currentCount !== actualCount) {
        await setDoc(doc(db, 'puzzles', puzzleId), {
          solveCount: actualCount
        }, { merge: true });
        
        console.log(`   📈 Updated ${puzzleId}: ${currentCount} → ${actualCount} solves`);
        updatedPuzzles++;
      }
    }

    console.log(`✅ Updated ${updatedPuzzles} puzzle solve counts`);

  } catch (error) {
    console.error('❌ Error updating solve counts:', error);
  }
}

// Run migration
async function runMigration() {
  await migrateUserSolverRecords();
  await updatePuzzleSolveCounts();
  console.log('\n🎊 All done! Historical solvers should now appear in "Solved By" lists.');
  process.exit(0);
}

runMigration();