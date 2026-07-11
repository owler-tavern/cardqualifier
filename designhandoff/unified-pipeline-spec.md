# Spec: Unified Review Pipeline

Status: proposed · Companion design: `Unified Final.dc.html` (option 5a)

## Problem

Four modules produce user-facing suggestions independently — rubric suggestions and
essence suggestions in `scorer.mjs`, findings + suggestions in `playability.mjs`, and
model suggestions in `ai-review.mjs`. The UI renders them as competing panels; on weak
cards this yields 15+ overlapping items.

## Architecture: detectors → merger → drafter

### 1. Detectors (find problems)

All local, deterministic. Each emits `Finding`s in one shared shape:

```js
Finding = {
  id: string,              // stable, e.g. "rubric.examples.empty"
  field: string,           // card field it targets: "mes_example", "description", ...
  source: "rubric" | "playability" | "style",
  severity: "blocker" | "improvement" | "advisory",
  summary: string,         // one sentence, plain language
  evidence: string[],      // verbatim quotes / stats from the card
  estimatedDelta: number,  // rubric points; 0 for advisories
  fixTemplate: string|null // deterministic paste-ready fix, if one exists
}
```

- **Rubric** (`scorer.mjs`): keeps scoring exactly as today; its suggestions become
  Findings. Point weights unchanged. Only the rubric sets `estimatedDelta > 0`.
- **Playability** (`playability.mjs`): emits advisories only (`estimatedDelta: 0`).
  Never scores. Unchanged heuristics; output reshaped to `Finding`.
- **Style** (new, in `scorer.mjs` or `style-checks.mjs`): three research-backed lints,
  all advisories:
  - `style.perspective` — person/format mixing across description/greeting/examples
  - `style.positive-framing` — negation-heavy rules ("don't be X" density)
  - `style.trait-anchoring` — stated personality traits with no dialogue anchor in
    `mes_example` (reuses playability's anchor matching)
- **Essence** (`extractEssence`): demoted from suggestion producer to shared evidence
  utility. `buildEssenceSuggestions` is deleted; its useful drafts move into rubric
  `fixTemplate`s. The essence chips UI goes away.

### 2. Merger (decide what to show) — new module `merge-findings.mjs`

Pure function: `mergeFindings(findings, { targetModel }) → ReviewPlan`

```js
ReviewPlan = {
  blockers:     FieldCard[],  // severity blocker, always shown
  improvements: FieldCard[],  // shown only when gate is open
  advisories:   Finding[],    // "polish notes" drawer, never counted
  gate: { open: boolean, reason: string }
}
FieldCard = {
  field, title, findings: Finding[],   // all findings for that field
  leverage: number,                    // sum of estimatedDelta
  fixTemplate: string|null             // one combined fix
}
```

Rules (from designs 4a/4b):
1. **Merge by field.** One card per card-field. All sources' findings nest inside.
2. **Rank by leverage.** Cards sorted by summed `estimatedDelta` desc.
3. **Gate by sequence.** `blocker` = structural failures (missing required field,
   placeholder text, unparseable) or leverage ≥ 8. While any blocker is unresolved,
   `improvements` render locked (visible titles + deltas, no actions) until the user
   re-analyzes with blockers cleared.
4. **Advisories never count.** Style + playability findings with `estimatedDelta: 0`
   go to the polish drawer and are excluded from all counts shown to the user.
5. **Deltas are estimates.** Always rendered `~+N`; UI must not promise exact gains.
6. **Model lens.** `targetModel ∈ {any, claude, gpt, small-local}` re-weights only:
   - which advisories surface (e.g. token-weight advisory promoted for small-local)
   - which `fixTemplate` variant is chosen (see template variants below)
   - never `estimatedDelta`, never the score.

Template variants: a `fixTemplate` may be `{ any, claude?, gpt?, small?: string }`;
merger picks by lens (fallback `any`). Known variants: lorebook fixes gain secondary
keys under `gpt`, compress to ≤ ~15 words/entry under `small`.

### 3. Drafter (write the fix) — `ai-review.mjs`, breaking change

The AI stops being a detector. It receives the merged plan and drafts **for named
findings only**.

Request payload changes:
- add `creatorDirection: "true"|"quirky"|"dark"|"warm"` (from the "Take him/her" steer)
- add `targetModel` (same values as merger)
- add `findings: FieldCard[]` (the merged plan) — replaces `deterministicSuggestions`,
  `essenceSuggestions`, `playability` blobs
- `mode` gains `"create"` (future: drafting a new card from a brief; same schema)

Schema changes (`AI_REVIEW_SCHEMA`):
- each suggestion gains required `resolvesFindingIds: string[]` (must reference ids
  from the supplied plan; client drops suggestions with unknown ids — this is the
  anti-invention enforcement)
- each suggestion gains `directionUsed: boolean` (drives the "AI draft · leans into
  her humor" label)
- `warranted` is removed — the merger decides what needs work, not the model

Instruction additions (append to existing anti-invention lines, which stay):
- "Draft only for the findings supplied. Never introduce new issues."
- "If creatorDirection is set, steer tone accordingly; evidence-grounding rules
  still apply."
- Per-target constraints: small-local → short lorebook entries, prefer examples over
  description edits; gpt → include secondary keys in character_book drafts; claude →
  preserve <START> separators in mes_example.

### UI contract (see `Unified Final.dc.html`)

- Verdict prose + stamp; assessment collapsed ("rubric scores, playability and style
  advise, AI only drafts — nothing decided by a model").
- One "Steer this review" panel: model lens + creator direction, side by side.
- Blocker FieldCards: per-source finding rows, one editable combined fix,
  "Need a stronger draft? → drafter" inline.
- Locked improvements list with Re-analyze; polish drawer; session ledger showing
  only user-caused entries; export footer with "art untouched" reassurance.
- Accent hue sampled from card art (fixed lightness/sat; default amber; optional
  "calm" toggle).

### Migration order

1. Extract `Finding` shape + reshape rubric/playability outputs (tests: existing
   suggestion content preserved as findings).
2. Add style detectors (pure functions, unit-testable).
3. Add `merge-findings.mjs` + gate logic (golden tests: Mara card → 2 cards +
   1 advisory; weak sample → 2 blockers / N locked / advisories).
4. Rewire UI to `ReviewPlan`.
5. Change AI schema + payload; enforce `resolvesFindingIds` client-side.
6. Delete `buildEssenceSuggestions` and the essence UI.

### Non-goals

- No change to rubric point weights or score bands.
- No telemetry, no network beyond the existing provider call.
- Playability never gains scoring power.
