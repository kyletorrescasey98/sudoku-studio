# Migration Instructions

This will fix the issue where users who solved puzzles historically don't appear in the "Solved By" lists.

## What the migration does:
1. Finds all users who have personal solve records
2. Creates missing solver records in puzzle collections
3. Updates puzzle solve counts to match actual solver counts

## To run the migration:

```bash
npm run migrate
```

## What you'll see:
- Lists each user being processed
- Shows how many solver records are created vs already exist
- Updates puzzle solve counts
- Final summary of changes made

## After running:
- Historical solvers like `ftc1987@gmail.com` will appear in "Solved By" lists
- Puzzle solve counts will be accurate
- No data will be lost (only adds missing records)

## Safe to run multiple times:
- The script checks for existing records before creating new ones
- Won't create duplicates if run again