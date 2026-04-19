/**
 * Shikaku puzzle generator for Patches app.
 * Matches LinkedIn Patches clue style:
 *   - Shape-only clues  (square/wide/tall icon, no number) → size: null
 *   - Size-only clues   (dashed "any" badge with number)   → shape: 'any'
 *   - Both clues        (shape icon + number)              → full constraint
 *
 * Difficulties:
 *   400 easy (6×6), 400 medium (8×8), 200 hard (10×10),
 *   200 expert (12×12), 50 impossible (14×14)
 *
 * Run: node generate.js
 */

const fs = require('fs');
const path = require('path');

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getShape(rows, cols) {
  if (rows === cols) return 'square';
  if (cols > rows) return 'wide';
  return 'tall';
}

// ─── Grid partition ──────────────────────────────────────────────────────────

function partition(r1, c1, r2, c2, maxArea, stopProb) {
  const area = (r2 - r1 + 1) * (c2 - c1 + 1);
  if (area <= 1 || (area <= maxArea && Math.random() < stopProb)) {
    return [{r1, c1, r2, c2}];
  }
  const canH = c2 - c1 >= 1;
  const canV = r2 - r1 >= 1;
  if (!canH && !canV) return [{r1, c1, r2, c2}];

  const rowLen = r2 - r1 + 1;
  const colLen = c2 - c1 + 1;
  let splitH;
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

// ─── Clue type probabilities per difficulty ───────────────────────────────
// each entry: [pBoth, pShapeOnly] — remainder is size-only ('any')
// pBoth:      clue has shape + size (most constrained)
// pShapeOnly: clue has shape only, size=null
// 1-pBoth-pShapeOnly: clue has size only, shape='any'

const CLUE_PROBS = {
  easy:       [0.55, 0.35],  // 55% both, 35% shape-only, 10% any+size
  medium:     [0.35, 0.40],  // 35% both, 40% shape-only, 25% any+size
  hard:       [0.20, 0.45],  // 20% both, 45% shape-only, 35% any+size
  expert:     [0.10, 0.45],  // 10% both, 45% shape-only, 45% any+size
  impossible: [0.05, 0.35],  // 5%  both, 35% shape-only, 60% any+size
};

const DIFFICULTY_CONFIG = {
  easy:       {gridSize: 6,  maxArea: 8,  stopProb: 0.45, minPieces: 5,  maxPieces: 12},
  medium:     {gridSize: 8,  maxArea: 12, stopProb: 0.40, minPieces: 8,  maxPieces: 20},
  hard:       {gridSize: 10, maxArea: 16, stopProb: 0.35, minPieces: 12, maxPieces: 30},
  expert:     {gridSize: 12, maxArea: 20, stopProb: 0.30, minPieces: 16, maxPieces: 42},
  impossible: {gridSize: 14, maxArea: 24, stopProb: 0.25, minPieces: 22, maxPieces: 56},
};

function pickClueType(difficulty) {
  const [pBoth, pShape] = CLUE_PROBS[difficulty];
  const r = Math.random();
  if (r < pBoth) return 'both';
  if (r < pBoth + pShape) return 'shape';
  return 'any';
}

function generatePuzzle(id, difficulty) {
  const {gridSize, maxArea, stopProb, minPieces, maxPieces} =
    DIFFICULTY_CONFIG[difficulty];

  let rects;
  let attempts = 0;
  do {
    rects = partition(0, 0, gridSize - 1, gridSize - 1, maxArea, stopProb);
    attempts++;
    if (attempts > 200) break;
  } while (rects.length < minPieces || rects.length > maxPieces);

  const clues = rects.map(rect => {
    const rows = rect.r2 - rect.r1 + 1;
    const cols = rect.c2 - rect.c1 + 1;
    const size = rows * cols;
    const shape = getShape(rows, cols);
    const row = randInt(rect.r1, rect.r2);
    const col = randInt(rect.c1, rect.c2);

    const type = pickClueType(difficulty);
    if (type === 'both') {
      return {row, col, size, shape};
    } else if (type === 'shape') {
      return {row, col, size: null, shape};
    } else {
      // size-only: 'any' shape
      return {row, col, size, shape: 'any'};
    }
  });

  return {id, difficulty, gridSize, clues};
}

// ─── Main ─────────────────────────────────────────────────────────────────

function main() {
  const outDir = path.join(__dirname, 'puzzles');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive: true});

  const config = [
    {difficulty: 'easy',       count: 400, startId: 1},
    {difficulty: 'medium',     count: 400, startId: 401},
    {difficulty: 'hard',       count: 200, startId: 801},
    {difficulty: 'expert',     count: 200, startId: 1001},
    {difficulty: 'impossible', count: 50,  startId: 1201},
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

  const manifest = {
    version: 3,
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
}

main();
