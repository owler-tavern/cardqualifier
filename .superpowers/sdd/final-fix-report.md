# Final review fixes: TDD evidence

## Scope

- `src/playability.mjs`
- `src/scorer.mjs`
- `src/app.mjs`
- `test/playability.test.mjs`
- `test/scorer.test.mjs`

No Git operations were run; this workspace was explicitly treated as git-less.

## RED

Command:

```powershell
node --test test\playability.test.mjs test\scorer.test.mjs
```

Before the implementation, this exited with code 1:

- Disabled lore still produced one causal link.
- The strong-unused-anchor greeting test found no grounding finding.
- `scorer.mjs` did not export `findRecommendedSuggestion`.

## GREEN

Implemented:

- Disabled character-book entries are excluded before all source, link, and anchor analysis.
- A generic or disconnected greeting with at least two strong unused anchors now produces an evidence-targeted `greeting-grounding` finding and a first-message repair using the strongest anchor.
- Playability suggestion evidence survives merging into the deterministic repair queue.
- The recommended-fix helper selects ranked deterministic repairs before essence suggestions.
- The Playability panel uses DOM nodes and `textContent` to visibly render audit evidence, including Playability repairs.

Focused verification:

```powershell
node --test test\playability.test.mjs test\scorer.test.mjs
```

Result: 27 passed, 0 failed.

## Full verification

Commands:

```powershell
node --check src\playability.mjs
node --check src\scorer.mjs
node --check src\app.mjs
node --test test\*.test.mjs
```

Result: all syntax checks passed; 55 tests passed, 0 failed.

## Regressions covered

- Disabled lore does not appear in causal links or greeting anchors.
- Lore-heavy cards with a generic greeting receive an evidence-targeted grounding repair.
- Intentionally minimal cards do not receive the lore-grounding finding.
- Merged Playability repairs retain exact source evidence.
- The recommended repair queue takes precedence over essence suggestions.
