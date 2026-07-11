# Implementation Plan: Playability Audit

The complete execution plan is [2026-07-09-playability-audit.md](../docs/superpowers/plans/2026-07-09-playability-audit.md).

## Delivery order

1. Build and test the pure local analyzer.
2. Return results from `scoreCard` without changing total-score arithmetic.
3. Render the audit in the studio and verify repair/export flows.
4. Ground optional AI review in bounded local evidence.
5. Document the informational release and calibration boundary.

## Checkpoints

- After tasks 1–2: all unit tests pass; existing totals remain unchanged.
- After tasks 3–4: browser flow and optional AI review are verified.
- After task 5: all tests pass and documentation matches behaviour.
