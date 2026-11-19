#!/usr/bin/env node
// Writes the tiers from regrade-puzzles.mjs into Firestore puzzles/{id}.difficulty.
// Dry run by default; pass --apply to write. Uses the signed-in Firebase CLI session
// (the security rules only let a puzzle's author update it, and app puzzles have no user author).
//   node regrade-puzzles.mjs > tmp/regrade-new.json 2>/dev/null
//   node apply-difficulty-tiers.mjs [results.json] [--apply]

import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const resultsPath = args.find(a => !a.startsWith('--')) || 'tmp/regrade-new.json';
const results = JSON.parse(readFileSync(resultsPath, 'utf8'));

const PROJECT = 'sudoku-459d3';
const tools = createRequire(import.meta.url);
const root = execSync('npm root -g').toString().trim() + '/firebase-tools/lib';
const { requireAuth } = tools(root + '/requireAuth');
const { Client } = tools(root + '/apiv2');
const { getGlobalDefaultAccount, setActiveAccount } = tools(root + '/auth');

const options = { project: PROJECT, projectId: PROJECT };
const account = getGlobalDefaultAccount();
if (!account) { console.error('Not signed in. Run `firebase login` first.'); process.exit(1); }
setActiveAccount(options, account);
await requireAuth(options);
const client = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1', auth: true });
const base = `/projects/${PROJECT}/databases/(default)/documents/puzzles`;

const counts = { updated: 0, same: 0, skipped: 0 };
const moves = {};
for (const r of results) {
  const { body: doc } = await client.get(`${base}/${r.id}`).catch(e => ({ body: null, err: e }));
  if (!doc) { console.log(`SKIP ${r.id} ${r.name}: not found`); counts.skipped++; continue; }
  const current = doc.fields?.difficulty?.stringValue;
  if (current === r.app_difficulty) { counts.same++; continue; }
  if (current !== r.old_difficulty) {
    console.log(`SKIP ${r.id} ${r.name}: Firestore has "${current}", expected "${r.old_difficulty}"`);
    counts.skipped++; continue;
  }
  const key = `${current} -> ${r.app_difficulty}`;
  moves[key] = (moves[key] || 0) + 1;
  if (apply) {
    await client.patch(`${base}/${r.id}`, { fields: { difficulty: { stringValue: r.app_difficulty } } },
      { queryParams: { 'updateMask.fieldPaths': 'difficulty' } });
  }
  counts.updated++;
}

console.log(apply ? '\nApplied:' : '\nDry run (nothing written):', counts);
console.log(moves);
if (!apply) console.log('Re-run with --apply to write.');
