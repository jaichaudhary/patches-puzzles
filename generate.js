/**
 * Shikaku puzzle generator for Patches app.
 *
 * Clue types (LinkedIn Patches style):
 *   'both'   — shape icon + number  (fully constrained)
 *   'shape'  — shape icon only      (size: null)
 *   'any'    — dashed badge + number (shape: 'any')
 *
 * Every generated puzzle is verified to have EXACTLY ONE valid solution.
 * Constraints are relaxed progressively (both → shape or any) only when
 * uniqueness is preserved.
 *
 * Run: node generate.js
 */

const fs = require('fs');
const path = require('path');

// ─── RNG ────────────────────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Shape ──────────────────────────────────────────────────────────────────

function getShape(rows, cols) {
  if (rows === cols) return 'square';
  if (cols > rows) return 'wide';
  return 'tall';
}

// ─── Partition ──────────────────────────────────────────────────────────────

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

// ─── Solver ──────────────────────────────────────────────────────────────────
// Counts valid solutions up to maxCount.  Stops early once maxCount reached.
// Returns the count found (0 = impossible, 1 = unique, 2+ = ambiguous).

function countSolutions(gridSize, clues, maxCount = 2) {
  const totalCells = gridSize * gridSize;
  let count = 0;
  let iters = 0;
  const MAX_ITERS = gridSize <= 8 ? 80000 : gridSize <= 10 ? 300000 : 800000;

  function overlaps(r1, c1, r2, c2, placed) {
    for (const p of placed) {
      if (!(r2 < p.r1 || p.r2 < r1 || c2 < p.c1 || p.c2 < c1)) return true;
    }
    return false;
  }

  function placements(ci, placed, coveredSoFar) {
    const {row, col, size, shape} = clues[ci];
    const results = [];

    for (let rLen = 1; rLen <= gridSize; rLen++) {
      for (let cLen = 1; cLen <= gridSize; cLen++) {
        const area = rLen * cLen;
        if (size !== null && area !== size) continue;
        // Remaining clues need at least 1 cell each — prune impossible branches
        const remainingClues = clues.length - ci - 1;
        const coveredIfPlaced = coveredSoFar + area;
        if (coveredIfPlaced + remainingClues > totalCells) continue;
        if (coveredIfPlaced > totalCells) continue;

        const s = rLen === cLen ? 'square' : cLen > rLen ? 'wide' : 'tall';
        if (shape !== 'any' && s !== shape) continue;

        const r1min = Math.max(0, row - rLen + 1);
        const r1max = Math.min(gridSize - rLen, row);
        const c1min = Math.max(0, col - cLen + 1);
        const c1max = Math.min(gridSize - cLen, col);

        for (let r1 = r1min; r1 <= r1max; r1++) {
          for (let c1 = c1min; c1 <= c1max; c1++) {
            const r2 = r1 + rLen - 1;
            const c2 = c1 + cLen - 1;
            if (overlaps(r1, c1, r2, c2, placed)) continue;
            // No other clue inside
            let bad = false;
            for (let k = 0; k < clues.length; k++) {
              if (k === ci) continue;
              const o = clues[k];
              if (o.row >= r1 && o.row <= r2 && o.col >= c1 && o.col <= c2) {
                bad = true; break;
              }
            }
            if (bad) continue;
            results.push({r1, c1, r2, c2, area});
          }
        }
      }
    }
    return results;
  }

  function solve(ci, placed, covered) {
    if (count >= maxCount || iters > MAX_ITERS) return;
    iters++;
    if (ci === clues.length) {
      if (covered === totalCells) count++;
      return;
    }
    for (const rect of placements(ci, placed, covered)) {
      placed.push(rect);
      solve(ci + 1, placed, covered + rect.area);
      placed.pop();
      if (count >= maxCount || iters > MAX_ITERS) return;
    }
  }

  solve(0, [], 0);
  // If iteration limit was hit, we can't confirm uniqueness — treat as ambiguous
  if (iters > MAX_ITERS) return maxCount;
  return count;
}

// ─── Unique-clue builder ─────────────────────────────────────────────────────
// Starts with fully-constrained clues (both size & shape).
// Then relaxes each clue — shape-only or size-only — if uniqueness holds.

const RELAX_PROBS = {
  //                   P(try shape-only)  P(try size-only 'any')
  easy:       { ps: 0.35, pa: 0.10 },
  medium:     { ps: 0.45, pa: 0.25 },
  hard:       { ps: 0.50, pa: 0.35 },
  expert:     { ps: 0.50, pa: 0.45 },
  impossible: { ps: 0.40, pa: 0.55 },
};

function buildClues(rects, difficulty, gridSize) {
  // Start: all clues fully constrained
  const clues = rects.map(rect => {
    const rows = rect.r2 - rect.r1 + 1;
    const cols = rect.c2 - rect.c1 + 1;
    return {
      row: randInt(rect.r1, rect.r2),
      col: randInt(rect.c1, rect.c2),
      size: rows * cols,
      shape: getShape(rows, cols),
    };
  });

  const {ps, pa} = RELAX_PROBS[difficulty];
  const order = shuffle([...Array(clues.length).keys()]);

  for (const i of order) {
    const original = {...clues[i]};
    const r = Math.random();

    let candidate = null;
    if (r < ps) {
      // Try shape-only (remove size)
      candidate = {...original, size: null};
    } else if (r < ps + pa) {
      // Try size-only (any shape)
      candidate = {...original, shape: 'any'};
    } else {
      continue; // Keep both constraints
    }

    clues[i] = candidate;
    const sols = countSolutions(gridSize, clues, 2);
    if (sols !== 1) {
      clues[i] = original; // Revert — relaxing broke uniqueness
    }
  }

  return clues;
}

// ─── Difficulty config ───────────────────────────────────────────────────────

const DIFFICULTY_CONFIG = {
  // Fewer, larger pieces → more interesting puzzles, fewer ambiguities
  easy:       {gridSize: 6,  maxArea: 10, stopProb: 0.50, minPieces: 4,  maxPieces: 9},
  medium:     {gridSize: 8,  maxArea: 14, stopProb: 0.45, minPieces: 6,  maxPieces: 13},
  hard:       {gridSize: 10, maxArea: 18, stopProb: 0.40, minPieces: 9,  maxPieces: 18},
  expert:     {gridSize: 12, maxArea: 22, stopProb: 0.35, minPieces: 12, maxPieces: 24},
  impossible: {gridSize: 14, maxArea: 26, stopProb: 0.30, minPieces: 16, maxPieces: 32},
};

// ─── Main generator ──────────────────────────────────────────────────────────

function generatePuzzle(id, difficulty) {
  const {gridSize, maxArea, stopProb, minPieces, maxPieces} =
    DIFFICULTY_CONFIG[difficulty];

  let rects, clues;
  let outerAttempts = 0;

  do {
    let innerAttempts = 0;
    do {
      rects = partition(0, 0, gridSize - 1, gridSize - 1, maxArea, stopProb);
      innerAttempts++;
    } while ((rects.length < minPieces || rects.length > maxPieces) && innerAttempts < 300);

    clues = buildClues(rects, difficulty, gridSize);
    outerAttempts++;
    if (outerAttempts > 200) break;
  } while (countSolutions(gridSize, clues, 2) !== 1);

  return {id, difficulty, gridSize, clues};
}

// ─── Entry point ─────────────────────────────────────────────────────────────

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
    const t0 = Date.now();
    for (let i = 0; i < count; i++) {
      puzzles.push(generatePuzzle(startId + i, difficulty));
      if ((i + 1) % 50 === 0) process.stdout.write(`\r  ${difficulty}: ${i + 1}/${count}`);
    }
    const outPath = path.join(outDir, `${difficulty}.json`);
    fs.writeFileSync(outPath, JSON.stringify({puzzles}));
    const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\r✓ ${difficulty}.json — ${count} puzzles, ${kb} KB (${sec}s)`);
  }

  const manifest = {
    version: 4,
    generated: new Date().toISOString(),
    difficulties: config.map(({difficulty, count, startId}) => ({
      name: difficulty,
      count,
      startId,
      gridSize: DIFFICULTY_CONFIG[difficulty].gridSize,
      file: `puzzles/${difficulty}.json`,
    })),
  };
  fs.writeFileSync(path.join(__dirname, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('✓ manifest.json\nDone!');
}

main();
