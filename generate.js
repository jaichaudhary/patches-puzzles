/**
 * Shikaku puzzle generator for Patches app.
 * Generates 1000 puzzles: 400 easy (6x6), 400 medium (8x8), 200 hard (10x10).
 * Run: node generate.js
 * Output: puzzles/easy.json, puzzles/medium.json, puzzles/hard.json
 */

const fs = require('fs');
const path = require('path');

// ─── RNG helpers ────────────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Shape helpers ──────────────────────────────────────────────────────────

function getShape(rows, cols) {
  if (rows === cols) return 'square';
  if (cols > rows) return 'wide';
  return 'tall';
}

// ─── Grid partition ─────────────────────────────────────────────────────────
// Recursively bisects [r1,r2]×[c1,c2] into non-overlapping rectangles.
// stopProb controls how eagerly we stop splitting (higher = larger rectangles).

function partition(r1, c1, r2, c2, maxArea, stopProb) {
  const area = (r2 - r1 + 1) * (c2 - c1 + 1);

  // Always stop for 1-cell areas; also stop randomly once we're small enough
  if (area <= 1 || (area <= maxArea && Math.random() < stopProb)) {
    return [{r1, c1, r2, c2}];
  }

  const canH = c2 - c1 >= 1; // can split left/right (vertical cut)
  const canV = r2 - r1 >= 1; // can split top/bottom (horizontal cut)

  if (!canH && !canV) return [{r1, c1, r2, c2}];

  // Bias toward the longer axis to keep rectangles roughly square
  const rowLen = r2 - r1 + 1;
  const colLen = c2 - c1 + 1;
  let splitH; // split along a vertical line (produces left + right halves)
  if (canH && canV) {
    splitH = colLen >= rowLen ? Math.random() < 0.6 : Math.random() < 0.4;
  } else {
    splitH = canH;
  }

  if (splitH) {
    const mid = randInt(c1, c2 - 1);
    return [
      ...partition(r1, c1, r2, mid, maxArea, stopProb),
      ...partition(r1, mid + 1, r2, c2, maxArea, stopProb),
    ];
  } else {
    const mid = randInt(r1, r2 - 1);
    return [
      ...partition(r1, c1, mid, c2, maxArea, stopProb),
      ...partition(mid + 1, c1, r2, c2, maxArea, stopProb),
    ];
  }
}

// ─── Puzzle generator ───────────────────────────────────────────────────────

const DIFFICULTY_CONFIG = {
  easy:   {gridSize: 6,  maxArea: 8,  stopProb: 0.45, minPieces: 5,  maxPieces: 12},
  medium: {gridSize: 8,  maxArea: 12, stopProb: 0.40, minPieces: 8,  maxPieces: 20},
  hard:   {gridSize: 10, maxArea: 16, stopProb: 0.35, minPieces: 12, maxPieces: 30},
};

function generatePuzzle(id, difficulty) {
  const {gridSize, maxArea, stopProb, minPieces, maxPieces} =
    DIFFICULTY_CONFIG[difficulty];

  let rects;
  // Retry until we get a piece count in the desired range
  let attempts = 0;
  do {
    rects = partition(0, 0, gridSize - 1, gridSize - 1, maxArea, stopProb);
    attempts++;
    if (attempts > 200) break; // safety valve
  } while (rects.length < minPieces || rects.length > maxPieces);

  const clues = rects.map(rect => {
    const rows = rect.r2 - rect.r1 + 1;
    const cols = rect.c2 - rect.c1 + 1;
    const size = rows * cols;
    const shape = getShape(rows, cols);

    // Random clue cell within rectangle
    const row = randInt(rect.r1, rect.r2);
    const col = randInt(rect.c1, rect.c2);

    return {row, col, size, shape};
  });

  return {id, difficulty, gridSize, clues};
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const outDir = path.join(__dirname, 'puzzles');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive: true});

  const config = [
    {difficulty: 'easy',   count: 400, startId: 1},
    {difficulty: 'medium', count: 400, startId: 401},
    {difficulty: 'hard',   count: 200, startId: 801},
  ];

  for (const {difficulty, count, startId} of config) {
    const puzzles = [];
    for (let i = 0; i < count; i++) {
      puzzles.push(generatePuzzle(startId + i, difficulty));
    }

    const outPath = path.join(outDir, `${difficulty}.json`);
    fs.writeFileSync(outPath, JSON.stringify({puzzles}));
    console.log(
      `✓ ${difficulty}.json — ${count} puzzles (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`,
    );
  }

  // Manifest consumed by future app features (e.g., version checks)
  const manifest = {
    version: 1,
    generated: new Date().toISOString(),
    difficulties: config.map(({difficulty, count, startId}) => ({
      name: difficulty,
      count,
      startId,
      gridSize: DIFFICULTY_CONFIG[difficulty].gridSize,
      file: `puzzles/${difficulty}.json`,
    })),
  };
  fs.writeFileSync(
    path.join(__dirname, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  console.log('✓ manifest.json');
  console.log('\nDone! Push the puzzle-generator/ folder contents to your GitHub repo.');
}

main();
