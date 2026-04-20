/**
 * Verifies all puzzles have exactly one solution.
 * Uses a solver with no artificial iteration cap (but stops at maxCount solutions).
 */

const fs = require('fs');
const path = require('path');

function countSolutions(gridSize, clues, maxCount = 2) {
  const totalCells = gridSize * gridSize;
  let count = 0;

  function overlaps(r1, c1, r2, c2, placed) {
    for (const p of placed) {
      if (!(r2 < p.r1 || p.r2 < r1 || c2 < p.c1 || p.c2 < c1)) return true;
    }
    return false;
  }

  function placements(ci, placed, coveredSoFar) {
    const { row, col, size, shape } = clues[ci];
    const results = [];
    for (let rLen = 1; rLen <= gridSize; rLen++) {
      for (let cLen = 1; cLen <= gridSize; cLen++) {
        const area = rLen * cLen;
        if (size !== null && area !== size) continue;
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
            let bad = false;
            for (let k = 0; k < clues.length; k++) {
              if (k === ci) continue;
              const o = clues[k];
              if (o.row >= r1 && o.row <= r2 && o.col >= c1 && o.col <= c2) { bad = true; break; }
            }
            if (bad) continue;
            results.push({ r1, c1, r2, c2, area });
          }
        }
      }
    }
    return results;
  }

  function solve(ci, placed, covered) {
    if (count >= maxCount) return;
    if (ci === clues.length) {
      if (covered === totalCells) count++;
      return;
    }
    for (const rect of placements(ci, placed, covered)) {
      placed.push(rect);
      solve(ci + 1, placed, covered + rect.area);
      placed.pop();
      if (count >= maxCount) return;
    }
  }

  solve(0, [], 0);
  return count;
}

const files = ['easy', 'medium', 'hard', 'expert', 'impossible'];
const bad = [];
let total = 0;

for (const name of files) {
  const filePath = path.join(__dirname, 'puzzles', `${name}.json`);
  const { puzzles } = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let fileOk = 0, fileBad = 0;
  process.stdout.write(`Checking ${name} (${puzzles.length} puzzles)...`);

  for (const p of puzzles) {
    const sols = countSolutions(p.gridSize, p.clues, 2);
    if (sols !== 1) {
      bad.push({ id: p.id, difficulty: p.difficulty, sols });
      fileBad++;
    } else {
      fileOk++;
    }
    total++;
  }
  console.log(` ok=${fileOk} bad=${fileBad}`);
}

console.log(`\nTotal: ${total} puzzles checked`);
if (bad.length === 0) {
  console.log('All puzzles are valid (exactly 1 solution each).');
} else {
  console.log(`\n${bad.length} invalid puzzle(s):`);
  for (const b of bad) {
    console.log(`  #${b.id} (${b.difficulty}): ${b.sols === 0 ? 'NO solution' : 'AMBIGUOUS (2+ solutions)'}`);
  }
}
