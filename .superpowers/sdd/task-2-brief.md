# Task 2: Integrate audit results into scoring and repairs

Modify only `src/scorer.mjs` and `test/scorer.test.mjs`.

Import `analyzePlayability` from `src/playability.mjs`; invoke it against normalized card data and return it as `result.playability` from `scoreCard`.

Requirements:

- Preserve the existing criteria array, point calculations, `total`, band, and existing score semantics exactly. The new audit must be informational.
- Merge Playability suggestions into the existing deterministic repair suggestions, cap the combined list at five, and assign contiguous priorities.
- Existing high-severity suggestions for missing core fields, placeholders, and weak core criteria must outrank Playability suggestions.
- Existing `applySuggestionToCard` must apply Playability field drafts using the established behaviour; do not add a special mutation path.
- Follow TDD. Record RED and GREEN evidence in `task-2-report.md`; run focused and full suites.

Required tests:

1. `scoreCard` exposes a non-empty `playability` result for a compact causal card while `total` equals the sum of existing criteria points.
2. A Playability repair is lower-ranked than a missing-field or placeholder repair when both are present.
3. Applying a selected Playability description/scenario/greeting draft changes only the targeted field and preserves input immutability.
