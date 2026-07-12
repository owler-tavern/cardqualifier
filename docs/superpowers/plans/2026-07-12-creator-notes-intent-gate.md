# Creator Notes Intent Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed *substantive* `creator_notes` to the AI reviewer as stated creator intent, gate the +2 metadata bonus on substance, and keep junk notes out — using one deterministic classifier.

**Architecture:** A new pure module `src/creator-notes.mjs` exports `classifyCreatorNotes(text)`. Two existing consumers call it: `src/card-scoring.mjs` (score gate) and `src/ai-review.mjs` (strip junk from the payload + elevate substantive notes to an intent instruction). No new dependencies; classification is heuristic and runs identically in browser and server.

**Tech Stack:** Node.js ESM (`.mjs`), `node --test`, zero third-party deps.

**Design spec:** `docs/superpowers/specs/2026-07-12-creator-notes-intent-gate-design.md`

## Global Constraints

- ESM only (`.mjs`); no `package.json`, no third-party dependencies.
- Run tests with `node --test test/*.test.mjs` (the bare `node --test test/` directory form is broken on Node 24). Keep every suite green.
- `classifyCreatorNotes` must be a total pure function — never throws; non-string/empty input returns `{ substantive: false }`.
- One logical change per commit; commit at the end of each task.
- Follow existing code style: small focused modules, `stringValue`/`hasText`-style helpers, no comments restating the obvious.

---

### Task 1: The classifier — `src/creator-notes.mjs`

**Files:**
- Create: `src/creator-notes.mjs`
- Test: `test/creator-notes.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `classifyCreatorNotes(text: string | any) -> { substantive: boolean, reason: string }`. Borderline notes (some prose, no explicit intent word) resolve to `substantive: true` (forgiving default). `reason` is a short human-readable string for auditability.

- [ ] **Step 1: Write the failing test**

Create `test/creator-notes.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { classifyCreatorNotes } from "../src/creator-notes.mjs";

test("empty / non-string notes are not substantive and never throw", () => {
  for (const v of ["", "   ", null, undefined, 42, {}]) {
    assert.equal(classifyCreatorNotes(v).substantive, false);
  }
});

test("notes stating genre/tone/behavior/model intent are substantive", () => {
  for (const v of [
    "Dark mystery, keep replies short.",
    "Genre: horror. She responds tersely.",
    "Best with a Claude model and a low temperature.",
    "NSFW opt-in; wholesome otherwise.",
  ]) {
    assert.equal(classifyCreatorNotes(v).substantive, true, v);
  }
});

test("link/handle/boilerplate-only notes are junk", () => {
  for (const v of [
    "Follow me @author on discord.gg/abc",
    "https://patreon.com/me — subscribe!",
    "enjoy!",
    "v2: fixed typos",
    "thanks for downloading, my first card",
  ]) {
    assert.equal(classifyCreatorNotes(v).substantive, false, v);
  }
});

test("borderline prose with no explicit intent word leans substantive", () => {
  // Two-plus meaningful words remain after stripping junk → included.
  assert.equal(classifyCreatorNotes("A cozy little seaside tale.").substantive, true);
  assert.equal(classifyCreatorNotes("Grumpy retired mercenary.").substantive, true);
});

test("substance mixed with a promo link still counts as substantive", () => {
  assert.equal(
    classifyCreatorNotes("Slow-burn romance, be patient with her. Support me at ko-fi.com/x").substantive,
    true,
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/creator-notes.test.mjs`
Expected: FAIL — `Cannot find module '../src/creator-notes.mjs'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/creator-notes.mjs`:

```js
// Words that signal a creator is stating intent (genre, tone, behaviour, or
// model/content guidance). Matched on word boundaries to avoid substring hits.
const INTENT_WORDS = [
  "genre", "tone", "setting", "mood", "theme", "vibe", "atmosphere",
  "romance", "horror", "mystery", "comedy", "drama", "fantasy", "sci-fi",
  "scifi", "slice of life", "dark", "wholesome", "angst", "slow-burn",
  "personality", "behavior", "behaviour", "responds", "reply", "replies",
  "roleplay", "dynamic", "relationship", "backstory", "lore", "scenario",
  "plays", "acts", "speaks", "voice", "persona", "greeting",
  "nsfw", "sfw", "content warning", "trigger", "model", "preset",
  "temperature", "context", "jailbreak", "system prompt",
];
const INTENT_RE = new RegExp("\\b(" + INTENT_WORDS.join("|") + ")\\b", "i");

// Material that carries no character intent: links, handles, promo platforms,
// filler, and changelog/credit lines. Stripped before measuring what remains.
const JUNK_RE = [
  /https?:\/\/\S+/gi,
  /\b[\w.-]+\.(?:com|net|org|io|gg|me|ai|xyz|co)\b\S*/gi,
  /@[a-z0-9_]+/gi,
  /\b(?:discord|patreon|ko-?fi|twitter|instagram|tiktok|youtube|reddit|subscribe|follow me|dm me|donate|tip jar)\b/gi,
  /\b(?:enjoy|have fun|thanks for downloading|my first card|hope you like|please rate|feedback welcome|credit|credits)\b/gi,
  /\bv?\d+(?:\.\d+)*\s*[:\-]/gi,
  /\b(?:fixed|updated|typo|typos|changelog)\b/gi,
];

export function classifyCreatorNotes(text) {
  if (typeof text !== "string") return { substantive: false, reason: "empty" };
  const raw = text.trim();
  if (!raw) return { substantive: false, reason: "empty" };

  if (INTENT_RE.test(raw)) return { substantive: true, reason: "states intent" };

  let residue = raw;
  for (const re of JUNK_RE) residue = residue.replace(re, " ");
  const words = residue.replace(/[^a-z0-9\s]/gi, " ").split(/\s+/).filter(Boolean);

  // Lean-substance: any real prose beyond a stray word survives the gate.
  if (words.length >= 2) return { substantive: true, reason: "meaningful prose remains" };
  return { substantive: false, reason: "link/handle/boilerplate only" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/creator-notes.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/creator-notes.mjs test/creator-notes.test.mjs
git commit -m "feat: classifyCreatorNotes gates substantive notes from junk"
```

---

### Task 2: Gate the +2 metadata bonus — `src/card-scoring.mjs`

**Files:**
- Modify: `src/card-scoring.mjs` (import + `scoreMetadata`, ~line 223 and the criterion note at ~line 240)
- Test: `test/scorer.test.mjs` (add one test)

**Interfaces:**
- Consumes: `classifyCreatorNotes` from `./creator-notes.mjs` (Task 1).
- Produces: no new exports; the "Metadata hygiene" criterion now awards its `creator_notes` points only for substantive notes.

- [ ] **Step 1: Write the failing test**

Add to `test/scorer.test.mjs`:

```js
test("metadata hygiene rewards substantive creator notes, not junk", () => {
  const base = {
    name: "Mara", description: "A retired courier from Leth who keeps coded maps.",
    personality: "Warm but guarded.", scenario: "{{user}} meets Mara at a station.",
    first_mes: "Hello.", mes_example: "<START>\n{{user}}: hi\n{{char}}: hey",
    tags: ["mystery"],
  };
  const meta = (card) => scoreCard(JSON.stringify({ spec: "chara_card_v2", spec_version: "2.0", data: card }))
    .criteria.find((c) => c.label === "Metadata hygiene").points;

  const substantive = meta({ ...base, creator_notes: "Dark mystery; keep replies short." });
  const junk = meta({ ...base, creator_notes: "Follow me @author on discord.gg/x" });

  assert.equal(substantive - junk, 2); // the creator_notes bonus is gated on substance
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/scorer.test.mjs`
Expected: FAIL — difference is `0` (both currently get +2 for presence).

- [ ] **Step 3: Write the minimal implementation**

In `src/card-scoring.mjs`, add the import near the other local imports (after line 5):

```js
import { classifyCreatorNotes } from "./creator-notes.mjs";
```

Replace the presence check in `scoreMetadata` (line ~223):

```js
  points += classifyCreatorNotes(data.creator_notes).substantive ? 2 : 0;
```

Update the criterion note (line ~240) so it is honest:

```js
  return criterion("Metadata hygiene", 9, points, "Substantive creator notes, tags, versioning, and prompt override safety.");
```

- [ ] **Step 4: Run the full suite to verify the new test passes and nothing regressed**

Run: `node --test test/*.test.mjs`
Expected: PASS. Existing fixtures use genre/tone notes ("Tense travel scenes.", "Station mystery.", "A tense station mystery.") which contain intent words → still substantive → still +2, so no total shifts. If any existing metadata/total assertion fails, the classifier flagged a real fixture as junk — inspect that note and adjust the classifier or fixture with a comment explaining why.

- [ ] **Step 5: Commit**

```bash
git add src/card-scoring.mjs test/scorer.test.mjs
git commit -m "feat: gate the creator_notes metadata bonus on substance"
```

---

### Task 3: Strip junk + elevate intent in AI review — `src/ai-review.mjs`

**Files:**
- Modify: `src/ai-review.mjs` (import; `reviewFields` ~line 136; `buildAiReviewRequest` instruction list ~line 87)
- Test: `test/ai-review.test.mjs` (add tests)

**Interfaces:**
- Consumes: `classifyCreatorNotes` from `./creator-notes.mjs` (Task 1); `buildAiReviewRequest(cardText, options)` and `buildAiReviewPayload(cardText, options)` (existing).
- Produces: `buildAiReviewPayload(...).card.fields.creator_notes` is `""` when notes are junk; `buildAiReviewRequest(...).instructions` contains the creator-intent sentence only when substantive notes are present.

- [ ] **Step 1: Write the failing test**

Add to `test/ai-review.test.mjs`:

```js
test("junk creator_notes are stripped from the AI payload; intent instruction absent", () => {
  const card = JSON.stringify({ spec: "chara_card_v2", spec_version: "2.0", data: {
    name: "Mara", description: "A retired courier.", personality: "Guarded.",
    scenario: "{{user}} meets Mara.", first_mes: "Hi.", mes_example: "",
    creator_notes: "Follow me @author on discord.gg/x",
  }});
  const payload = buildAiReviewPayload(card);
  assert.equal(payload.card.fields.creator_notes, "");
  assert.doesNotMatch(buildAiReviewRequest(card).instructions, /creator's intent/i);
});

test("substantive creator_notes are kept and elevated to an intent instruction", () => {
  const card = JSON.stringify({ spec: "chara_card_v2", spec_version: "2.0", data: {
    name: "Mara", description: "A retired courier.", personality: "Guarded.",
    scenario: "{{user}} meets Mara.", first_mes: "Hi.", mes_example: "",
    creator_notes: "Dark slow-burn mystery; keep her replies terse.",
  }});
  const payload = buildAiReviewPayload(card);
  assert.match(payload.card.fields.creator_notes, /slow-burn mystery/);
  assert.match(buildAiReviewRequest(card).instructions, /creator's intent/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/ai-review.test.mjs`
Expected: FAIL — junk `creator_notes` is currently passed through unchanged and no intent instruction exists.

- [ ] **Step 3: Write the minimal implementation**

In `src/ai-review.mjs`, add the import at the top (after line 1):

```js
import { classifyCreatorNotes } from "./creator-notes.mjs";
```

In `reviewFields` (line ~136), replace the `creator_notes` line so junk is stripped:

```js
    creator_notes: classifyCreatorNotes(data.creator_notes).substantive ? stringValue(data.creator_notes) : "",
```

In `buildAiReviewRequest`, after the base `instructions` array is defined and before the `if (payload.targetField)` block (line ~89), add:

```js
  if (payload.card?.fields?.creator_notes) {
    instructions.push(
      "creator_notes states the creator's intent for this card (genre, tone, intended dynamics). Treat it as context for what the card is trying to be and prefer suggestions that help it deliver on that intent. It is not dialogue and not permanent prompt content.",
    );
  }
```

(The existing "Do not treat … creator notes … as dialogue" instruction stays unchanged.)

- [ ] **Step 4: Run the full suite to verify it passes**

Run: `node --test test/*.test.mjs`
Expected: PASS. Confirm the existing test asserting `/metadata as dialogue/` still passes — the new instruction is additive.

- [ ] **Step 5: Commit**

```bash
git add src/ai-review.mjs test/ai-review.test.mjs
git commit -m "feat: strip junk creator_notes and elevate substantive notes to AI intent"
```

---

## Self-Review

- **Spec coverage:** classifier (Task 1) ↔ spec §2; score gate (Task 2) ↔ spec §3; AI strip + intent instruction (Task 3) ↔ spec §4; tests across all three ↔ spec §6; total pure function ↔ spec §7. Non-goals (gap detection, graded stripping, AI classification) are excluded. All covered.
- **Type consistency:** `classifyCreatorNotes(text) -> { substantive, reason }` is used identically in Tasks 2 and 3 (`.substantive`). No signature drift.
- **No placeholders:** every code and test step is complete and runnable.
