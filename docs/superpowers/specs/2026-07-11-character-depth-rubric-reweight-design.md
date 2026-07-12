# Character Depth rubric reweight — design

Date: 2026-07-11
Status: Approved (design), pending implementation plan

## Problem

CardQualifier's deterministic rubric rewards *craft surface* (formatting, example-dialogue
format, word-count thresholds) far more than *character depth* (contradiction, causal
grounding, life independent of the user). Two experienced card creators, sharing advice on
Reddit, named this exact gap:

- **Creator 1 (preset/lorebook specialist):** "ignore the example dialogue section… make a
  bunch of speaking rules posted after the chat history. It won't ever get drowned out." Their
  primary lever is `post_history_instructions` (speaking rules); they consider `mes_example`
  near-useless.
- **Creator 2 (chub.ai author):** "don't just look at formatting or length (a huge trap with
  LLM-generated cards), look at whether the character has **competing motivations, room to make
  bad decisions, and/or anything happening outside the user.**"

The tool already *computes* the right signals — `analyzePlayability()` detects causal
cause→behavior→consequence chains and explicit tensions — but deliberately scores them zero
("advice only, never counted"). Meanwhile `mes_example` formatting is worth a hard 15/100. A
hollow, well-formatted LLM-generated card can out-score a dense, hand-made one. That is
precisely the trap Creator 2 warned about.

## Goal

Reweight the deterministic rubric so the score reflects character depth and no longer punishes
the speaking-rules workflow, while keeping the rubric deterministic, auditable, and summing to
100.

Non-goals: grading tone/taste (still never scored), changing the AI-drafting flow, changing the
playability *advice* UI, or touching portrait art.

## Design

### Weight table (sums to 100)

| Axis | Old | New | Change rationale |
|---|---|---|---|
| Structure and compatibility | 15 | 14 | trim 1 (format-only points) |
| Character substance | 25 | 23 | slight trim; Depth now covers some overlap |
| Opening message | 15 | 12 | trim formatting sub-points |
| Voice (examples **or** speaking rules) | 15 | 8 | biggest cut; renamed and broadened (see below) |
| Token efficiency | 10 | 9 | trim 1 |
| Metadata hygiene | 10 | 9 | trim 1 |
| Lorebook support | 10 | 9 | trim 1 |
| **Character Depth** | 0 | **16** | NEW scored axis |

14 + 23 + 12 + 8 + 9 + 9 + 9 + 16 = **100**.

This deliberately breaks the current invariant that playability never affects the total. That
invariant is encoded in a test and will be rewritten (see Test contract).

### New axis: Character Depth (16 pts)

Four deterministic sub-signals. A long, tidy, everything-points-at-the-user card scores near
zero here automatically — no separate "slop penalty" is needed; the axis simply does not light
up.

| Sub-signal | Pts | Measurement | Source |
|---|---|---|---|
| Coherent motivation | 5 | An explicit cause→behavior→consequence chain in one passage **OR** distributed reinforcement: a salient motivation/theme that recurs across ≥2 fields and is shown in behavior. 0 → 0, one path present → 3, strong/both → 5. | reuse `playability.links` + trait-overlap machinery |
| Tension / contradiction | 5 | Distinct explicit-contrast statements across description + personality ("warm *but* guarded"). 0 → 0, one → 3, two+ → 5. | reuse/strengthen `playability.tensions` |
| Agency outside `{{user}}` | 4 | Action beats with a third-person subject (she/he/they/proper noun + action verb) that do **not** reference `{{user}}`/"you". ≥2 → 4, one → 2, none → 0. Capped low because it is the least reliable heuristic. | NEW detector |
| Trait shown under pressure | 2 | At least one stated personality trait is demonstrated (word overlap) in examples or greeting, not merely asserted. | partial reuse |

**Why "Coherent motivation" and not "explicit causal chain":** widely-shared card-writing craft
(izumikonataa's "Organic Method") holds that the best cards *deliberately do not spell out* the
causal logic — they scatter clues across fields and force the model to deduce the persona
("show, don't tell"). Scoring only explicit `because X so Y` chains would reward spoon-fed cards
and penalize the deliberately-decentralized ideal. Crediting distributed reinforcement as an
equal path keeps the signal format-agnostic.

The agency detector is a rough heuristic and is intentionally capped at 4/100 so noise has low
blast radius. It must not fire on pure scenery ("the lights dimmed"); it requires an animate
third-person subject performing an action.

### Reworked axis: Voice (8 pts, was "Dialogue examples")

Rewards whatever actually teaches voice — example dialogue **or** post-history speaking rules —
and a card can max the axis either way:

- `example_score`: existing `mes_example` measurement (coverage, `<START>` blocks,
  `{{char}}:`/`{{user}}:` lines), rescaled to the smaller budget.
- `speaking_rules_score`: substantive `post_history_instructions` content that states behavior
  or speaking rules (length + imperative/rule phrasing), rescaled.
- Axis contribution = `max(example_score, speaking_rules_score)` + a small bonus when both are
  present.

Effect: a card that follows Creator 1's hack (skip examples, use succinct speaking rules) is no
longer penalized for thin `mes_example`.

**Deliberate neutrality on an expert disagreement.** Creator 1 says ignore example dialogue;
izumikonataa says garbage examples waste a good prompt and examples are essential ("water
temperature"). These are opposite schools. The `max(examples, speaking_rules)` design refuses to
take a side — a card can max Voice either way — and the both-present bonus rewards doing both
well without punishing either choice.

### Metadata (9 pts)

Unchanged in intent. Keeps the `post_history_instructions`/`system_prompt` **`{{original}}`
override-safety** check (prompt hygiene) — this is distinct from the Voice axis's use of the
same field for teaching behavior. Point budget trimmed 10 → 9.

## Data flow

`scoreCard()` continues to build a `criteria` array; the total is the rounded sum of criterion
points (structural invariant preserved). Changes:

- `scoreExamples()` → `scoreVoice()`: reads `mes_example` **and** `post_history_instructions`.
- New `scoreDepth(data, playability, findings)` criterion, inserted into the `criteria` array;
  consumes the already-computed `playability` result plus a new agency detector.
- New agency helper lives in `playability.mjs` (co-located with the other passage analysis) and
  is surfaced on the playability result so the UI can also show it as advice.
- Point-budget constants in the seven existing `scoreX` functions are adjusted per the table.

## Error handling

No new external inputs. All sub-signals operate on already-parsed, normalized card fields and
degrade to 0 on missing/empty fields (existing `text()`/`hasText()` guards). The agency detector
must handle non-string and empty fields without throwing.

## Testing

Rewrite:
- The `"exposes a playability audit without changing the deterministic total"` test — Depth now
  *does* move the total. Keep the structural assertion that `total === round(sum(criteria))`.

Preserve:
- `"stronger cards score higher than sparse cards"` — the chosen numbers keep this true.

Add:
- Hollow-but-tidy card (long, well-formatted, zero contradiction, everything aimed at user)
  scores low on the Depth axis.
- A speaking-rules card (rich `post_history_instructions`, thin `mes_example`) is not out-scored
  on Voice by an examples-only card of comparable voice quality.
- Agency detector fires on ≥2 independent third-person action beats and does **not** fire on
  pure scenery.
- A distributed-clue card (motivation shown across fields, no explicit "because…so") still earns
  Coherent-motivation credit, on par with an explicit-chain card.
- Tension sub-signal counts distinct contrasts, not repeats.
- Full-rubric total still sums to 100 at the ceiling.

## Rollout / compat

Existing cards will re-score. Expect formatting-heavy/LLM-generated cards to drop and
depth-rich hand-made cards (including ensemble cards with life outside the user) to rise — the
intended correction. The score bands (85/70/50) are unchanged, so band copy stays valid.
