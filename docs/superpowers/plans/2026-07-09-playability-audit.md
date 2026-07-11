# Playability Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local evidence-backed Playability Audit that finds connected character context and produces targeted repairs without changing the existing 0-100 score.

**Architecture:** A new pure `src/playability.mjs` module analyzes normalized card data. `src/scorer.mjs` exposes its result and merges bounded repairs; the existing studio displays them; optional AI review receives only bounded audit evidence.

**Tech Stack:** Browser ES modules, Node.js built-in test runner, Node.js HTTP server, plain HTML/CSS/JavaScript.

## Global constraints

- The audit is local unless the user explicitly starts AI review.
- Every finding and suggestion must include evidence copied from the card.
- No automatic mutation, added provider, endpoint, storage, package, tool loop, or score-band change.
- Existing criterion points and total-score arithmetic must be unchanged.
- Keep the new analysis in `src/playability.mjs`, not another large block in `src/scorer.mjs`.
- Run `node --test` after every task.

## File map

| File | Change |
| --- | --- |
| `src/playability.mjs` | New pure analyzer and evidence-backed repair builder. |
| `test/playability.test.mjs` | Unit fixtures for positive signals and false positives. |
| `src/scorer.mjs` | Return `playability`; merge repairs without changing score maths. |
| `test/scorer.test.mjs` | Score-invariance and applied-repair tests. |
| `index.html`, `styles.css`, `src/app.mjs` | Safe Playability panel rendering. |
| `src/ai-review.mjs`, `test/ai-review.test.mjs` | Bounded audit payload and evidence-grounded instruction. |
| `README.md` | Explain the feature is local and informational. |

## Dependency graph

```text
pure analyzer and tests
        ↓
scorer contract and ranked repairs
        ↓
studio panel ────────── optional AI payload grounding
        ↓                        ↓
        └──────── documentation and end-to-end verification
```

### Task 1: Create the pure analyzer

**Files:** Create `src/playability.mjs`; create `test/playability.test.mjs`.

**Consumes:** `name`, `description`, `personality`, `scenario`, `first_mes`, and optional `character_book.entries` from normalized card data.

**Produces:**

```js
analyzePlayability(data) => ({
  band: "strong" | "developing" | "thin",
  links: [{ cause, behavior, consequence, evidence }],
  tensions: [{ statement, evidence }],
  greetingCoverage: { matchedAnchors, unusedAnchors },
  findings: [{ type, title, detail, evidence }],
  suggestions: [{ field, title, reason, draft, evidence }],
})
```

**Acceptance criteria:**

- [ ] All returned evidence is exact source text.
- [ ] Repetition cannot add links.
- [ ] Headings, metadata, character names, placeholders, and common words cannot create an anchor match.

- [ ] **Step 1: Write failing tests.**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { analyzePlayability } from "../src/playability.mjs";

test("finds an evidenced cause, behaviour, and consequence", () => {
  const result = analyzePlayability({
    name: "Mara",
    description: "After losing a client in a storm, Mara refuses to abandon paid travellers.",
    personality: "She jokes when frightened because silence makes her remember the storm.",
    scenario: "{{user}} is trapped with Mara at a station.",
    first_mes: "\"Did you hear three taps or four?\"",
  });
  assert.equal(result.band, "strong");
  assert.ok(result.links.some((link) => link.evidence.includes("refuses to abandon")));
});

test("does not reward repeated unconnected traits", () => {
  const result = analyzePlayability({
    name: "Flat", description: "Flat is loyal, loyal, loyal and brave, brave, brave.",
    personality: "Loyal and brave.", scenario: "Flat meets {{user}}.", first_mes: "Hello.",
  });
  assert.equal(result.links.length, 0);
  assert.equal(result.band, "thin");
});
```

- [ ] **Step 2: Run the failing tests.** Run `node --test test/playability.test.mjs`; expect failure because the module is missing.

- [ ] **Step 3: Implement the minimum contract.**

```js
export function analyzePlayability(data) {
  const source = cardSentences(data);
  const links = uniqueByEvidence(source.flatMap(findInteractionLinks));
  const tensions = uniqueByEvidence(source.flatMap(findTensions));
  const greetingCoverage = findGreetingCoverage(data, source);
  return {
    band: playabilityBand({ links, tensions, greetingCoverage }),
    links, tensions, greetingCoverage,
    findings: buildFindings({ links, tensions, greetingCoverage, source }),
    suggestions: buildSuggestions({ links, tensions, greetingCoverage, source }),
  };
}
```

Use literal signal sets for `because`, `after`, `due to`, `refuses`, `keeps`, `avoids`, `so`, `which makes`, `fears`, and explicit contrasts. Return no result when the source cannot support it.

- [ ] **Step 4: Add a heading/biography false-positive test.** Assert that `## Who She Is`, an age, a profession, and a greeting containing only the character name produce no anchor match.
- [ ] **Step 5: Run `node --test`; expect all tests to pass.**
- [ ] **Step 6: Commit:** `git add src/playability.mjs test/playability.test.mjs`; `git commit -m "feat: add local playability analysis"`.

### Task 2: Expose audit results without changing scoring

**Files:** Modify `src/scorer.mjs`; modify `test/scorer.test.mjs`.

**Consumes:** `analyzePlayability(data)`.

**Produces:** `scoreCard(input).playability` plus a maximum-five ranked repair queue.

**Acceptance criteria:**

- [ ] Current score totals are unchanged.
- [ ] Missing fields, placeholder cleanup, and weak core criteria outrank Playability repairs.
- [ ] Existing `applySuggestionToCard` can apply Playability drafts with no special mutation path.

- [ ] **Step 1: Add a failing score-invariance test.**

```js
test("adds playability evidence without changing score arithmetic", () => {
  const result = scoreCard({
    name: "Mara", description: "After a failed rescue, Mara refuses to leave anyone behind.",
    personality: "Warm but guarded.", scenario: "{{user}} is trapped with Mara during a storm.",
    first_mes: "\"Did you hear the signal?\"",
    mes_example: "<START>\n{{user}}: Why stay?\n{{char}}: Because I failed once.",
  });
  assert.equal(result.total, result.criteria.reduce((sum, item) => sum + item.points, 0));
  assert.ok(result.playability.links.length > 0);
});
```

- [ ] **Step 2: Run `node --test test/scorer.test.mjs`; expect `result.playability` failure.**
- [ ] **Step 3: Import the analyzer and append `playability` to the returned result.** Preserve the existing criteria construction and total calculation verbatim.
- [ ] **Step 4: Merge suggestions through one helper.** Re-rank all selected items into contiguous priorities after preserving high-severity existing repairs and capping the result at five.
- [ ] **Step 5: Add a test that applies a selected Playability repair and verifies only the target card field changes.**
- [ ] **Step 6: Run `node --test`; expect pass.**
- [ ] **Step 7: Commit:** `git add src/scorer.mjs test/scorer.test.mjs`; `git commit -m "feat: surface playability repairs in card scoring"`.

### Checkpoint 1: Local contract

- [ ] `node --test` passes.
- [ ] Existing test-card totals and criterion points are unchanged.
- [ ] Flat/repeated-trait fixtures have zero causal links.
- [ ] Compact connected fixtures have exact evidence.

### Task 3: Render the Playability panel

**Files:** Modify `index.html`, `styles.css`, and `src/app.mjs`.

**Consumes:** `result.playability`.

**Produces:** A compact panel below the decision summary with a band, summary, and at most three findings.

**Acceptance criteria:**

- [ ] The panel hides before scoring and clears on invalid JSON.
- [ ] Card-derived evidence uses `textContent`, never `innerHTML`.
- [ ] Existing Repair Queue, Apply, Undo, and exports behave unchanged.

- [ ] **Step 1: Add this placeholder after the decision panel.**

```html
<section class="playability-panel" id="playability-panel" aria-labelledby="playability-title" hidden>
  <div class="section-heading"><h3 id="playability-title">Playability</h3><span id="playability-band" class="playability-band"></span></div>
  <p id="playability-summary" class="playability-summary"></p>
  <ul id="playability-findings" class="playability-findings"></ul>
</section>
```

- [ ] **Step 2: Add safe renderer.**

```js
function renderPlayability(playability) {
  if (!playability) { playabilityPanel.hidden = true; playabilityFindings.replaceChildren(); return; }
  playabilityPanel.hidden = false;
  playabilityBand.textContent = playability.band;
  playabilitySummary.textContent = playabilitySummaryFor(playability);
  playabilityFindings.replaceChildren(...playability.findings.slice(0, 3).map((finding) => {
    const item = document.createElement("li");
    item.textContent = `${finding.title}: ${finding.detail}`;
    return item;
  }));
}
```

Call it from `renderResult` and call `renderPlayability(null)` from `showError`.

- [ ] **Step 3: Add scoped styles.** Use existing custom properties and responsive spacing only:

```css
.playability-panel { display: grid; gap: .75rem; padding: 1rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
.playability-findings { margin: 0; padding-left: 1.15rem; }
.playability-band { font-weight: 700; }
```

- [ ] **Step 4: Run `node --test`; expect pass.**
- [ ] **Step 5: Manually verify:** run `node server.mjs`; load sample; see evidence; load invalid JSON and see panel clear; apply/undo a repair; export JSON; then load and re-export a PNG if available.
- [ ] **Step 6: Commit:** `git add index.html styles.css src/app.mjs`; `git commit -m "feat: show playability evidence in the studio"`.

### Task 4: Ground optional AI review

**Files:** Modify `src/ai-review.mjs`; modify `test/ai-review.test.mjs`.

**Consumes:** `score.playability`.

**Produces:** An unchanged AI response schema with bounded Playability evidence in the request.

**Acceptance criteria:**

- [ ] No new provider, endpoint, API-key handling, or response schema property.
- [ ] Model input exposes only band, three findings, and greeting coverage.
- [ ] Instruction requires one evidence-targeted repair and candidate framing for new canon.

- [ ] **Step 1: Add a failing payload test.**

```js
const payload = buildAiReviewPayload(JSON.stringify(card));
assert.ok(payload.score.playability.findings.length > 0);
assert.ok(payload.score.playability.findings.every((item) => item.evidence.length > 0));
```

- [ ] **Step 2: Run `node --test test/ai-review.test.mjs`; expect missing payload property failure.**
- [ ] **Step 3: Add this bounded payload shape.**

```js
playability: {
  band: score.playability.band,
  findings: score.playability.findings.slice(0, 3),
  greetingCoverage: score.playability.greetingCoverage,
},
```

- [ ] **Step 4: Append this instruction verbatim:** “When Playability evidence identifies a gap, improve one named link only. Preserve all named facts and unresolved states. Do not invent canon; mark any necessary new decision as an editable candidate.”
- [ ] **Step 5: Run `node --test`; expect pass.**
- [ ] **Step 6: Commit:** `git add src/ai-review.mjs test/ai-review.test.mjs`; `git commit -m "feat: ground AI review in playability evidence"`.

### Checkpoint 2: Full feature

- [ ] `node --test` passes.
- [ ] JSON and PNG flows, Apply, Undo, invalid input, and optional AI review were manually checked.
- [ ] The total score and score bands are unchanged.

### Task 5: Document the informational rollout

**Files:** Modify `README.md`; modify `docs/superpowers/specs/2026-07-09-playability-audit-design.md`.

**Acceptance criteria:**

- [ ] README identifies Playability Audit as local and informational.
- [ ] README does not promise to predict model behaviour.
- [ ] The design spec records the actual final verification command and browser checks.

- [ ] **Step 1: Add this capability bullet to README:** `local Playability Audit: connected causes, behaviour, unresolved tension, and greeting-to-card grounding`.
- [ ] **Step 2: Add this paragraph after “Why this rubric”:** “The Playability Audit is a local writing-quality heuristic. It shows evidence from the card and recommends repairs, but it does not predict a model's exact behaviour or change the overall score in this release.”
- [ ] **Step 3: Append a dated “Implementation verification” section to the design spec with the successful `node --test` command and manual browser checks.**
- [ ] **Step 4: Run `node --test`; expect pass.**
- [ ] **Step 5: Commit:** `git add README.md docs/superpowers/specs/2026-07-09-playability-audit-design.md`; `git commit -m "docs: explain playability audit limits"`.

## Risks

| Risk | Mitigation |
| --- | --- |
| Keyword false positives | Direct fixtures for repetition, headings, metadata, and biographies. |
| Score regression | Do not alter criterion points or total calculation. |
| AI invention | Bounded evidence plus explicit candidate framing. |
| UI noise | One panel, maximum three findings, maximum five total repairs. |

## Execution notes

Tasks 1 and 2 are sequential. Tasks 3 and 4 can proceed after Task 2 but must not modify `src/scorer.mjs` concurrently. Task 5 follows the full feature checkpoint.

Before any commit step, run `git status --short`. Git metadata was not recognized during planning; if that persists, preserve completed files and report the repository-state blocker without attempting destructive repair.
