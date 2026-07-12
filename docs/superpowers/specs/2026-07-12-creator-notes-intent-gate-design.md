# Creator Notes as Gated AI Intent Context — Design

**Status:** approved design, pre-implementation
**Date:** 2026-07-12
**Depends on:** v1.0.0 (`scoreCard`, `card-scoring.mjs`, `ai-review.mjs`)
**Sequencing:** implement only after the in-flight bulk-evaluation work is
reviewed and verified.

## 1. Goal

Use the `creator_notes` field during evaluation instead of ignoring its
content. Today `creator_notes` is parsed but its text is never read — it only
awards a flat `+2` to Metadata hygiene for being non-empty
(`card-scoring.mjs:223`), and it sits in the AI-review payload only as
noise the model is told *not* to mistake for dialogue (`ai-review.mjs:80`).

Creators frequently put genuinely important intent (genre, tone, intended
dynamics, behavioral guidance) into `creator_notes` and nowhere else — but they
also put junk there (support/social links, "enjoy!", changelog, credits). The
model that runs the roleplay never sees `creator_notes` at all (per the
Character Card V2 spec it is not injected into the prompt), so the useful move
is to feed *substantive* notes to the **AI reviewer** as stated creator intent,
while keeping junk out.

### Success criteria

- A single deterministic classifier decides whether `creator_notes` is
  **substantive** or **junk**.
- Substantive notes are passed to the AI reviewer and explicitly framed as the
  creator's intent; junk notes are stripped from the AI payload.
- The `+2` Metadata-hygiene bonus is awarded only for substantive notes, not
  mere presence.
- Borderline / ambiguous notes lean **substantive** (forgiving default).
- The classifier is a pure function with unit tests; it never throws.

### Non-goals (YAGNI)

- **"Catch the leak"** gap-detection — flagging intent that lives *only* in
  `creator_notes` and is missing from the prompt fields the model reads. Good
  follow-up, separate slice.
- Graded / partial stripping of mixed notes (keep good prose, drop only the
  junky lines). Classification is binary in this slice.
- AI-based classification. The gate is local heuristic only.
- Changing how `creatorDirection` (the user-supplied tone steer) works.

## 2. Component: `src/creator-notes.mjs`

A new, dependency-free module exporting one pure function:

```
classifyCreatorNotes(text) -> { substantive: boolean, reason: string }
```

`reason` is a short human-readable string for auditability/tests (e.g.
`"link-and-handle boilerplate only"`, `"states genre and tone"`,
`"borderline; leaning substance"`).

### Heuristic

1. **Normalize.** Non-string or empty/whitespace → `{ substantive: false,
   reason: "empty" }`. Never throws.
2. **Strip junk material** from a working copy:
   - URLs (`http(s)://…`, bare `domain.tld/…`).
   - Social / support handles and platforms: discord, patreon, ko-fi, twitter,
     x.com, `@handle` tokens, "follow me", "DM me".
   - Boilerplate filler: "enjoy", "have fun", "my first card", "thanks for
     downloading", standalone credits/attribution, changelog-only lines
     (`v2:`, "fixed typos", "updated …").
3. **Assess the remainder:**
   - **Substantive** if the leftover prose contains an *intent signal* — genre /
     tone / setting words, behavioral guidance ("responds", "keep replies",
     "plays as", NSFW/SFW), or model/preset recommendations — **or** clears a
     small meaningful-length threshold of real prose.
   - **Junk** if little or no meaningful prose remains.
4. **Ambiguity default:** anything not clearly junk resolves to **substantive**.

The exact keyword lists and length threshold are implementation details for the
plan; they must be data-driven (arrays/sets at the top of the module) so they
are easy to tune and test.

## 3. Scoring integration — `src/card-scoring.mjs`

Replace the presence check at line ~223:

```
// before
points += hasText(data.creator_notes) ? 2 : 0;
// after
points += classifyCreatorNotes(data.creator_notes).substantive ? 2 : 0;
```

Update the criterion description/evidence wording so it is honest — the bonus is
for *substantive* creator notes, not for the field merely existing. Import
`classifyCreatorNotes` from `./creator-notes.mjs`.

**Score-shift caveat:** cards whose notes are pure junk lose 2 points. Existing
test fixtures (e.g. `"Tense travel scenes."`, `"Station mystery."`) state
genre/tone and remain substantive under the lean-substance default, so they
should keep the `+2`. Every affected test must be checked and, where a fixture
legitimately flips, updated with an explanation.

## 4. AI-review integration — `src/ai-review.mjs`

1. **Strip junk from the payload.** In `reviewFields` (or
   `buildAiReviewPayload`), classify `data.creator_notes`. If junk, emit
   `creator_notes: ""` so junk never reaches the model. If substantive, keep the
   text.
2. **Elevate substantive notes to intent context.** When substantive notes are
   present, add one instruction to the `buildAiReviewRequest` instruction list:

   > "creator_notes states the creator's intent for this card (genre, tone,
   > intended dynamics). Treat it as context for what the card is trying to be
   > and prefer suggestions that help it deliver on that intent. It is not
   > dialogue and not permanent prompt content."

   The existing caveat at line 80 ("Do not treat … creator notes … as dialogue")
   stays. The new line is additive and only present when notes survive the gate.

This flips `creator_notes` from ignored noise into usable intent context — the
actual win of the feature.

## 5. Data flow

```
card text
  -> parseCard -> data.creator_notes
    -> classifyCreatorNotes(text) -> { substantive }
       -> (a) card-scoring: +2 only if substantive
       -> (b) ai-review: strip if junk; if substantive, keep + add intent line
```

## 6. Testing

- `test/creator-notes.test.mjs` — classifier unit tests:
  clear substance (genre/tone/behavior), clear junk (link-heavy, filler,
  credits/changelog), borderline → substantive, empty/non-string.
- `test/scorer.test.mjs` / `test/card-scoring` — update for the honest `+2`;
  confirm existing genre/tone fixtures keep their bonus.
- `test/ai-review.test.mjs` — junk `creator_notes` stripped from the payload;
  substantive notes retained **and** the intent instruction present; absent when
  junk/empty.

Run `node --test test/` and keep every suite green.

## 7. Error handling

- `classifyCreatorNotes` is total: non-string, empty, or whitespace input
  returns `{ substantive: false }`; it never throws.
- No network, no AI call in the classifier — the gate is deterministic and runs
  in the browser and server paths identically.
