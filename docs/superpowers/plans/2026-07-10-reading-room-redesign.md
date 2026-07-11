# Reading Room Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the competing-panel dashboard with the deterministic, merged Reading Room review flow.

**Architecture:** Local detectors return a shared Finding contract; a pure merger groups and gates them before the DOM renders any repair. The optional AI endpoint receives only merged findings and can only produce drafts that resolve supplied IDs. The browser holds one card-text snapshot per combined apply so undo and the session ledger are atomic.

**Tech Stack:** Vanilla ES modules, browser DOM APIs, CSS, Node built-in test runner, optional local Node server.

## Global Constraints

- No framework, build step, or dependency may be added.
- Rubric weights and score bands remain unchanged and are the only score source.
- Playability and style are advisories only; AI drafts only and never detects or judges.
- PNG pixel data must remain byte-identical; only character text chunks may change.
- Persist provider non-secret settings plus model lens/direction; never persist API keys.
- Keep one-level undo and make a merged field-card apply one undo/ledger event.
- Preserve a usable UI throughout the UI/AI schema migration.
- `node --test` must pass after every increment.

---

### Task 1: Shared local findings and weak fixture

**Files:**
- Modify: `src/scorer.mjs`, `src/playability.mjs`, `test/scorer.test.mjs`, `test/playability.test.mjs`
- Create: `test/fixtures/weak-card.json`

**Interfaces:**
- Produces: `scoreCard(input).findings` as `Finding[]`, retaining `criteria`, score, and source evidence.
- Produces: `analyzePlayability(data).findings` as advisory `Finding[]` with `estimatedDelta: 0`.

- [ ] Write failing tests that require every emitted local finding to contain `id`, `field`, `source`, `severity`, `summary`, `evidence`, `estimatedDelta`, and `fixTemplate`, and load the fixture with empty `mes_example`, a placeholder scenario, and an 800+ word description.
- [ ] Run `node --test test/scorer.test.mjs test/playability.test.mjs`; expect the contract assertions to fail.
- [ ] Add deterministic IDs and field mappings to rubric and playability producers without changing criterion arithmetic; replace UI-oriented `type/title/detail` suggestion data with the contract while retaining compatibility only until the UI increment.
- [ ] Run `node --test test/scorer.test.mjs test/playability.test.mjs`; expect pass.

### Task 2: Advisory style detectors

**Files:**
- Create: `src/style-checks.mjs`, `test/style-checks.test.mjs`
- Modify: `src/scorer.mjs`

**Interfaces:**
- Produces: `analyzeStyle(data): Finding[]` with IDs `style.perspective`, `style.positive-framing`, and `style.trait-anchoring`.

- [ ] Write three failing unit tests: mixed first/third-person narration, negation-heavy behavioral rules, and a listed trait absent from examples.
- [ ] Run `node --test test/style-checks.test.mjs`; expect module/import failure.
- [ ] Implement pure field-scoped lint functions that return only advisory, zero-delta findings; reuse the existing dialogue-anchor matching instead of adding scoring logic.
- [ ] Add style findings to `scoreCard` and run `node --test`.

### Task 3: Merge and gate review plans

**Files:**
- Create: `src/merge-findings.mjs`, `test/merge-findings.test.mjs`
- Modify: `src/scorer.mjs`

**Interfaces:**
- Produces: `mergeFindings(findings, { targetModel, appliedFindingIds, gateOpen }): ReviewPlan`.
- `ReviewPlan` contains `blockers`, `improvements`, `advisories`, and `gate` exactly as specified.

- [ ] Write golden tests using the current sample card and `test/fixtures/weak-card.json`; assert strong output has two improvement cards plus advisories, weak output has two blockers and gated remaining work.
- [ ] Run `node --test test/merge-findings.test.mjs`; expect import failure.
- [ ] Implement merge-by-field, leverage ordering, lens-aware template selection, structural-or-8-point blocker classification, and gate state based solely on resolved blocker IDs plus explicit re-analyze.
- [ ] Run `node --test`.

### Task 4: Reading Room DOM/CSS and atomic apply loop

**Files:**
- Modify: `index.html`, `styles.css`, `src/app.mjs`, `test/scorer.test.mjs`

**Interfaces:**
- Consumes: `ReviewPlan`, `applySuggestionToCard(card, { field, draft })`.
- Produces: card-level `appliedFindingIds`, `gateOpen`, `sessionLedger`, `targetModel`, `creatorDirection`, `artHue` state.

- [ ] Add a failing test proving one field-card application can add the supplied draft and is representable by one prior-card snapshot.
- [ ] Render the new DOM behind an initialized review state, retaining the legacy result render until the Reading Room is ready; then switch default rendering once the full screen is connected.
- [ ] Implement the verdict, assessment disclosure, steering controls, merged field cards, locked queue, polish drawer, ledger, export footer, empty/error/loading states, settings dialog, live region, and responsive stylesheet from the handoff.
- [ ] Make an apply capture exactly one JSON snapshot, update all field-card finding IDs together, rescore once, append one ledger chip, and make undo restore that snapshot and ledger state.
- [ ] Add art sampling with a contrast-clamped accent and persisted calm toggle; run `node --test`.

### Task 5: Constrained AI drafter and schema migration

**Files:**
- Modify: `src/ai-review.mjs`, `server.mjs`, `src/app.mjs`, `test/ai-review.test.mjs`

**Interfaces:**
- Consumes: `{ card, findings: FieldCard[], creatorDirection, targetModel, mode }`.
- Produces: suggestions with `resolvesFindingIds: string[]` and `directionUsed: boolean`.

- [ ] Write a failing client-side test for rejecting an AI draft whose `resolvesFindingIds` contains an unknown ID.
- [ ] Update request construction and server schema together; remove `warranted`, replace legacy suggestion/playability/essence blobs with merged findings, and retain anti-invention instructions.
- [ ] In `app.mjs`, validate every returned ID against the requested field card before rendering or applying the draft; surface pending and friendly error states.
- [ ] Run `node --test` and manually verify the new reviewer control without configured credentials still leaves local templates usable.

### Task 6: Remove retired UI/data paths and verify

**Files:**
- Modify: `src/scorer.mjs`, `src/app.mjs`, `index.html`, `README.md`, relevant tests

- [x] Remove `buildEssenceSuggestions`, essence suggestion rendering, legacy competing panels, and tests that assert the retired product behavior; keep `extractEssence` only if used as evidence. Evidence: 2026-07-10 `Get-ChildItem src -Recurse -File | Select-String -Pattern 'essence|buildEssenceSuggestions' -CaseSensitive:$false` returned no matches.
- [x] Update README score-band wording if the rendered labels differ, without changing numeric bands. Evidence: 2026-07-10 README now documents Reading Room field-card drafting, Written for / Take them steering, and Reviewer settings; `Select-String README.md -Pattern 'AI deep review|Fetch models'` returned no matches.
- [x] Run `node --test`; open the app, verify desktop/mobile layouts, keyboard focus, modal focus, live announcements, error/empty/loading states, and PNG export preservation. Evidence: 2026-07-10 `node --test` reported 53 tests, 53 pass, 0 fail; recorded Edge/Playwright pass uploaded bad text, JSON, and PNG, verified Apply/Undo, AI error, keyboard/modal focus, 800px layout, gate unlock, and byte-identical non-text PNG chunks.
