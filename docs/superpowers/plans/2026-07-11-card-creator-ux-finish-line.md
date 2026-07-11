# Card-Creator UX: Finish-Line & Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap between "diagnose & improve" and "celebrate & ship" for a card creator, and remove the flow friction (opaque gate, silent reviewer waits, buried export, unclear scope) found during the live UX pass.

**Architecture:** The app is a single-page vanilla-ESM UI (`src/app.mjs` mutating the DOM defined in `index.html`, styled by `styles.css`) over pure, unit-tested logic modules (`src/*.mjs`). This plan follows the codebase's split: extract each new *decision* into a small pure module with `node --test` coverage, then wire it into the DOM glue and verify that wiring live in the browser. No framework, no build step.

**Tech Stack:** Vanilla ES modules, Node's built-in `node --test`, plain CSS. Live verification via the running server (`node server.mjs`, default port 4173 — the current dev instance is on 4176) and the Chrome extension.

## Global Constraints

- No new runtime dependencies; vanilla ESM only (matches the whole `src/` tree).
- Tests run with `node --test test/*.test.mjs` and must stay green (currently 79 passing).
- DOM glue in `src/app.mjs` is not unit-testable without a DOM; put every non-trivial decision in a pure exported function with its own test, and browser-verify only the wiring.
- Band thresholds live in one place — `bandForScore` in `src/card-scoring.mjs` (Excellent ≥85, Good ≥70, Mixed ≥50, Weak <50). Do not duplicate numeric thresholds; key new logic off the band string.
- Preserve the deterministic-score guarantee: none of these changes may alter `scoreCard` output. They are presentation/flow only.
- `behavior: 'smooth'` scrolling is non-functional in at least one target engine; use plain `scrollIntoView({block:'start'})` (established in commit 41dae34).
- Commit after each task with a Conventional-Commit-style message and the repo's `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer; commit with `--no-verify` is the repo norm here.

---

## File Structure

- `src/export-readiness.mjs` (new) — pure: maps a band string to a ship-readiness verdict + message. Owns Task 1's decision.
- `test/export-readiness.test.mjs` (new) — its tests.
- `src/merge-findings.mjs` (modify) — gate `reason` copy (Task 2).
- `test/merge-findings.test.mjs` (modify) — assert the new gate copy (Task 2).
- `src/app.mjs` (modify) — wire the ship banner (T1), auto-unlock-on-last-blocker (T2), reviewer elapsed timer (T3), scroll-spy (T4).
- `index.html` (modify) — `#ship-banner` element (T1), scope clarifier line (T5).
- `styles.css` (modify) — ship banner (T1), sticky topbar (T4).

---

### Task 1: Export "finish line" moment

When the card reaches a shippable band (Good/Excellent), surface a celebratory, actionable banner near the verdict with a button that jumps to the export footer — so the creator gets a clear "you're done, ship it" beat instead of hunting for the download buttons.

**Files:**
- Create: `src/export-readiness.mjs`
- Test: `test/export-readiness.test.mjs`
- Modify: `index.html:4` (add `#ship-banner` inside the verdict text column, after `#summary`)
- Modify: `src/app.mjs` render() (populate/toggle the banner) and the journey-jump handler (reuse for the banner's button)
- Modify: `styles.css` (banner styling)

**Interfaces:**
- Produces: `exportReadiness(band: string) => { ready: boolean, band: string, message: string }`
- Consumes (T1 wiring): existing `#export` element and the journey-jump scroll established in Task-less commit 41dae34.

- [ ] **Step 1: Write the failing test**

```js
// test/export-readiness.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { exportReadiness } from "../src/export-readiness.mjs";

test("Good and Excellent bands are ship-ready", () => {
  assert.equal(exportReadiness("Good").ready, true);
  assert.equal(exportReadiness("Excellent").ready, true);
});

test("Weak and Mixed bands are not ship-ready", () => {
  assert.equal(exportReadiness("Weak").ready, false);
  assert.equal(exportReadiness("Mixed").ready, false);
});

test("each band carries a distinct creator-facing message", () => {
  const messages = ["Weak", "Mixed", "Good", "Excellent"].map((b) => exportReadiness(b).message);
  assert.equal(new Set(messages).size, 4);
  assert.match(exportReadiness("Excellent").message, /ship|ready/i);
});

test("an unknown band is treated as not ready", () => {
  const r = exportReadiness("Nonsense");
  assert.equal(r.ready, false);
  assert.equal(typeof r.message, "string");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/export-readiness.test.mjs`
Expected: FAIL — `Cannot find module '../src/export-readiness.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/export-readiness.mjs
const READY = new Set(["Good", "Excellent"]);
const MESSAGES = {
  Excellent: "Excellent — this card is ready to ship.",
  Good: "Good to ship. Export when you're happy, or keep polishing below.",
  Mixed: "Getting there — clear the queue to reach shippable.",
  Weak: "Early draft — start with the blockers below.",
};

export function exportReadiness(band) {
  return { ready: READY.has(band), band, message: MESSAGES[band] ?? MESSAGES.Weak };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/export-readiness.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the banner element to the DOM**

In `index.html:4`, inside the verdict's text `<div>`, immediately after `<p id="summary" class="lede"></p>`, insert:

```html
<div id="ship-banner" class="ship" hidden><span id="ship-message"></span><button type="button" id="ship-export" class="ship-cta">Export the card →</button></div>
```

- [ ] **Step 6: Wire the banner in `src/app.mjs`**

Add the import at the top alongside the other `./ai-review.mjs`/`./scorer.mjs` imports:

```js
import { exportReadiness } from "./export-readiness.mjs";
```

Inside `render()`, after the line that sets `$('#band').textContent=result.band;`, add:

```js
const ship=exportReadiness(result.band);$('#ship-banner').hidden=!ship.ready;$('#ship-message').textContent=ship.message;
```

After the existing journey-button wiring block (the `for(const b of document.querySelectorAll('.journey'))...` line), add a handler for the banner CTA that reuses the export jump:

```js
$('#ship-export').onclick=()=>{setJourney('export');const t=$('#export');if(t&&!t.hidden)t.scrollIntoView({block:'start'})};
```

- [ ] **Step 7: Style the banner in `styles.css`**

```css
.ship {
  display:flex;
  align-items:center;
  gap:14px;
  margin-top:14px;
  padding:12px 16px;
  border:1px solid #4a4030;
  border-radius:12px;
  background:#211b12
}
.ship-cta {
  margin-left:auto;
  border:0;
  background:var(--accent);
  color:#1a150d;
  padding:8px 14px;
  border-radius:8px;
  cursor:pointer;
  font:inherit;
  font-weight:600
}
```

- [ ] **Step 8: Run the full suite**

Run: `node --test test/*.test.mjs`
Expected: PASS (83 tests — was 79, +4 from Task 1).

- [ ] **Step 9: Browser-verify**

Restart the server, reload `http://127.0.0.1:4176/`, load the sample card, then apply the mes_example reviewer draft to push the score to Good (74). Confirm the ship banner appears with the "Good to ship…" message and that clicking "Export the card →" scrolls to the footer (`window.scrollY` > 500). Confirm the banner is hidden again after Undo (score back to 65/Mixed).

- [ ] **Step 10: Commit**

```bash
git add src/export-readiness.mjs test/export-readiness.test.mjs src/app.mjs index.html styles.css
git commit --no-verify -m "feat: surface a ship-ready export banner at Good/Excellent

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Gate clarity — auto-unlock and honest copy

The improvement queue locks until blockers are cleared, then demands a manual "Re-analyze" click whose purpose is opaque. Auto-unlock the queue the moment the last blocker is applied, and rewrite the gate copy to explain *why* it was ever locked. Keep the manual Re-analyze button as an explicit re-score/re-open affordance.

**Files:**
- Modify: `src/merge-findings.mjs:11` (gate `reason` strings)
- Modify: `test/merge-findings.test.mjs` (assert new copy)
- Modify: `src/app.mjs:22` `applyCard` (auto-open the gate when no blockers remain)

**Interfaces:**
- Consumes: `mergeFindings(findings, { targetModel, appliedFindingIds, gateOpen })` — unchanged signature; only the `gate.reason` text changes.

- [ ] **Step 1: Write the failing test**

Add to `test/merge-findings.test.mjs`:

```js
test("gate copy explains the blocker-first lock and the unlock states", () => {
  const blocker = { id: "b1", field: "scenario", severity: "blocker", estimatedDelta: 8 };
  const improvement = { id: "i1", field: "personality", severity: "improvement", estimatedDelta: 5 };

  const locked = mergeFindings([blocker, improvement], { gateOpen: false });
  assert.match(locked.gate.reason, /blocker/i);
  assert.equal(locked.gate.open, false);

  const clearedButClosed = mergeFindings([improvement], { appliedFindingIds: [], gateOpen: false });
  assert.match(clearedButClosed.gate.reason, /re-analyze/i);

  const opened = mergeFindings([improvement], { gateOpen: true });
  assert.equal(opened.gate.open, true);
  assert.match(opened.gate.reason, /open|actionable/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/merge-findings.test.mjs`
Expected: FAIL — the current `reason` for the locked state is "Apply every blocker, then re-analyze to unlock the queue." which matches `/blocker/i` but the "open" branch currently returns "Unlocked" which does not match `/open|actionable/i`.

- [ ] **Step 3: Update the gate copy**

In `src/merge-findings.mjs:11`, replace the `gate` object with:

```js
    gate: { open: !unresolved && gateOpen, reason: unresolved ? "Improvements stay locked until every blocker is cleared — this keeps you fixing what breaks the card first." : gateOpen ? "Queue open — these are actionable now." : "Blockers cleared. Re-analyze to open the improvement queue." },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/merge-findings.test.mjs`
Expected: PASS.

- [ ] **Step 5: Auto-unlock on last blocker applied**

In `src/app.mjs:22`, inside `applyCard`, the current tail is `...gateOpen=false;render();...`. Replace `gateOpen=false` with a re-scored check that opens the gate when no blockers remain:

```js
gateOpen=mergeFindings(result.reviewFindings,{targetModel,appliedFindingIds:applied,gateOpen:false}).blockers.length===0;
```

(`mergeFindings` is already imported in `app.mjs`. This computes, from the freshly re-scored `result`, whether any blocker survives; if none do, the queue opens automatically. If blockers remain, it stays closed exactly as before.)

- [ ] **Step 6: Run the full suite**

Run: `node --test test/*.test.mjs`
Expected: PASS.

- [ ] **Step 7: Browser-verify**

Reload, load the sample (1 blocker: mes_example). Draft + Apply the blocker. Confirm the gate now reads "✓ Unlocked — improvements are actionable" **without** a manual Re-analyze click, and the improvement cards are actionable. Confirm the locked-state copy (before clearing) reads the new "Improvements stay locked until every blocker is cleared…" explanation.

- [ ] **Step 8: Commit**

```bash
git add src/merge-findings.mjs test/merge-findings.test.mjs src/app.mjs
git commit --no-verify -m "feat: auto-unlock the queue on last blocker and clarify gate copy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Reviewer progress affordance

Live reviewer calls take 10–40s; the button shows a static "The reviewer is reading…" with no sign of life. Add an elapsed-seconds counter so a long wait reads as progress, not a hang.

**Files:**
- Modify: `src/app.mjs` `askReviewer`

**Interfaces:** none new — internal to `askReviewer`.

- [ ] **Step 1: Add the elapsed timer to `askReviewer`**

In `src/app.mjs`, in `askReviewer`, replace the opening `button.disabled=true;button.textContent='The reviewer is reading…';` with a ticking timer, and clear it in the `finally`:

```js
button.disabled=true;const t0=Date.now();button.textContent='The reviewer is reading… 0s';const tick=setInterval(()=>{button.textContent=`The reviewer is reading… ${Math.round((Date.now()-t0)/1000)}s`},1000);
```

Then in the existing `finally{...}` block, add `clearInterval(tick);` as the first statement so the counter stops before `button.disabled=false` and any button-text reset runs.

- [ ] **Step 2: Browser-verify**

Reload, load the sample, click "Draft with reviewer →" on the mes_example blocker. Confirm the button text increments ("… 1s", "… 2s", …) during the wait and that on success it flips to "AI draft · grounded" (counter cleared, no leftover "…Ns"). Trigger an error path (e.g. temporarily set an invalid Base URL in Settings) and confirm the counter stops and the error lands in the `.ask-status` element with the button reverting to its label.

- [ ] **Step 3: Commit**

```bash
git add src/app.mjs
git commit --no-verify -m "feat: show elapsed seconds while the reviewer is drafting

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Sticky journey nav + scroll-spy

The page is one long column; the journey chips only navigate on click. Make the top bar sticky so Load/Review/Export are always reachable, and highlight the chip for the section currently in view via an IntersectionObserver.

**Files:**
- Modify: `styles.css` (`.topbar` sticky)
- Modify: `src/app.mjs` (scroll-spy that calls the existing `setJourney`)

**Interfaces:**
- Consumes: existing `setJourney(where)` and the `#review` / `#export` section ids.

- [ ] **Step 1: Make the top bar sticky**

Find the `.topbar` rule in `styles.css` and add:

```css
.topbar {
  position:sticky;
  top:0;
  z-index:10;
  background:var(--bg,#191510)
}
```

(If `.topbar` already sets a background, keep the existing value; the point is an opaque backdrop so content scrolls under it cleanly. Confirm the CSS var name against `:root` in `styles.css`; fall back to the literal page background color if `--bg` is not defined.)

- [ ] **Step 2: Add the scroll-spy in `src/app.mjs`**

After the journey-button wiring block, add an observer that activates the chip of whichever section is most in view. Guard for `IntersectionObserver` existence:

```js
if('IntersectionObserver'in window){const spy=new IntersectionObserver((entries)=>{for(const e of entries)if(e.isIntersecting)setJourney(e.target.id==='export'?'export':'review')},{rootMargin:'-45% 0px -45% 0px'});for(const id of ['review','export']){const s=document.getElementById(id);if(s)spy.observe(s)}}
```

(The `-45%` root margin makes a section "active" only when it crosses the vertical middle of the viewport, so the highlight tracks reading position. `#empty-state`/Load is not observed — it is hidden after load; Load stays a manual action.)

- [ ] **Step 3: Browser-verify**

Reload, load the sample. Scroll slowly from top to bottom and confirm the active journey chip moves from "2 Review" to "3 Export" as the footer reaches mid-viewport, and back when scrolling up. Confirm the top bar stays pinned while scrolling and that content passes cleanly beneath it (no transparent overlap).

- [ ] **Step 4: Commit**

```bash
git add styles.css src/app.mjs
git commit --no-verify -m "feat: sticky journey nav with scroll-spy section highlighting

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Scope-expectation clarifier

An aesthetics-driven creator may expect feedback on the portrait art. Set the expectation in one line that CardQualifier grades the card's writing/roleplay readiness, not the image.

**Files:**
- Modify: `index.html:3` (empty-state) and/or `index.html:4` (assessment details)

**Interfaces:** none — static copy.

- [ ] **Step 1: Add the clarifier to the empty state**

In `index.html:3`, inside the `#empty-state` section, after the `<button id="sample-button" ...>` element, add:

```html
<p class="scope-note">CardQualifier reviews the card's writing and roleplay readiness — its text fields and lorebook, not the portrait art.</p>
```

- [ ] **Step 2: Style the note (optional, minimal)**

In `styles.css`:

```css
.scope-note {
  margin-top:12px;
  color:var(--muted);
  font-size:13px;
  text-align:center;
  max-width:40ch
}
```

- [ ] **Step 3: Browser-verify**

Reload with no card loaded. Confirm the clarifier appears under the sample-card link on the landing screen and reads clearly.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit --no-verify -m "docs: clarify that review scope is card text, not portrait art

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** (the five "bigger" UX items from the live pass):
1. Buried export / no ship moment → **Task 1** (ship banner + CTA jump).
2. Opaque gate ceremony → **Task 2** (auto-unlock + explanatory copy).
3. Silent reviewer waits → **Task 3** (elapsed counter).
4. Long single-column scroll → **Task 4** (sticky nav + scroll-spy). Note: the journey chips were made functional in commit 41dae34; Task 4 builds directly on that.
5. Unclear scope (brain vs face) → **Task 5** (clarifier copy).

**Placeholder scan:** No TBDs; every code step shows complete code and every DOM step names the exact insertion point.

**Type consistency:** `exportReadiness(band)` returns `{ready, band, message}` and is consumed only in `render()` via `.ready`/`.message`. `setJourney(where)` is reused by Tasks 1 and 4 with the same `'review'|'export'|'load'` argument domain established in commit 41dae34. `mergeFindings` signature is unchanged in Task 2.

**Risk notes:** Tasks 1–2 carry unit tests; Tasks 3–5 are DOM/CSS-only and rely on browser verification (consistent with this codebase, where `app.mjs` glue is not unit-tested). Task 2's `applyCard` change and Task 4's observer are the two behavioral edits worth the closest review; both degrade safely (gate simply stays closed / spy is feature-detected).
