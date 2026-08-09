import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { writeFileSync } from 'fs';

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

console.log('Fetching all puzzles from Firestore...');

const snap = await getDocs(query(collection(db, 'puzzles'), orderBy('createdAt', 'asc')));

const puzzles = [];
snap.forEach(doc => {
  puzzles.push({ id: doc.id, ...doc.data() });
});

console.log(`Fetched ${puzzles.length} puzzles.`);

writeFileSync('puzzles-dump.json', JSON.stringify(puzzles, null, 2));
console.log('Saved to puzzles-dump.json');
process.exit(0);
