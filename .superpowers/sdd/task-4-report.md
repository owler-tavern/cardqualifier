# Task 4 report: Ground optional AI review in local Playability evidence

## Scope

- Updated `src/ai-review.mjs` and `test/ai-review.test.mjs` only for the implementation.
- Added this required task record as directed.
- Did not initialize Git, branch, commit, alter response parsing, provider configuration, endpoint behaviour, API-key handling, or request schema/format.

## RED

- Added tests for the exact Playability instruction and a bounded `score.playability` payload section with evidence-bearing findings.
- Focused command: `node --test test\\ai-review.test.mjs`
- Result: 10 passed, 2 failed, as expected:
  - The required instruction was absent.
  - `payload.score.playability` was undefined.

## GREEN

- Added `score.playability` containing only `band`, the first three findings, and `greetingCoverage`.
- Added the exact required instruction to the existing AI instructions.
- Focused command: `node --test test\\ai-review.test.mjs`
- Result: 12 passed, 0 failed.

## Full verification

- Command: `node --test test\\*.test.mjs`
- Result: 50 passed, 0 failed, 0 skipped, 0 todo.

## Self-review

- The Playability findings retain their local evidence but are bounded to three.
- No extra raw card fields are exposed; the existing stripped `card.fields` payload remains unchanged.
- Existing request structure, schema, parser, and compatible chat request are unchanged.
- No concerns found.
