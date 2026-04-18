# patches-puzzles

Puzzle data for the **Patches** app — 1000 Shikaku grid puzzles.

## Structure

```
puzzles/
  easy.json    — 400 puzzles (6×6 grid, IDs 1–400)
  medium.json  — 400 puzzles (8×8 grid, IDs 401–800)
  hard.json    — 200 puzzles (10×10 grid, IDs 801–1000)
manifest.json  — metadata
```

## Puzzle format

```json
{
  "puzzles": [
    {
      "id": 1,
      "difficulty": "easy",
      "gridSize": 6,
      "clues": [
        { "row": 0, "col": 2, "size": 4, "shape": "wide" }
      ]
    }
  ]
}
```

**shape** values:
- `"square"` — rectangle where width = height
- `"wide"` — rectangle wider than it is tall
- `"tall"` — rectangle taller than it is wide

## Regenerating puzzles

```bash
node generate.js
```

Requires Node.js 16+. Outputs to `puzzles/`.
