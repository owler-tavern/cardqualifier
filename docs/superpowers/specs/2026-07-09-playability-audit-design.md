# Playability Audit Design

## Status

Approved for specification. Implementation requires a separate implementation plan.

## Goal

Improve CardQualifier's ability to identify whether a character card provides a model with connected, playable context: causes, behavioural consequences, emotional hooks, unresolved tensions, and an opening that activates those elements.

The feature extends the existing local analysis and repair workflow. It does not turn CardQualifier into an AI card authoring agent.

## Context

CardQualifier currently validates card formats, calculates an explainable quality score, produces deterministic repair suggestions, supports optional evidence-grounded AI suggestions, and exports edited JSON or source PNG cards.

Its current substance checks reward completeness, specificity, contrasting traits, and usable openings. They do not explicitly distinguish a list of character attributes from interconnected material that can sustain roleplay.

The design is informed by the principle that cards work better when an established cause influences a visible behaviour and emotional response, while unresolved tensions leave room for future interaction. This is a content-quality heuristic, not a claim that local text analysis can predict LLM output.

## Decision

Add a local-only Playability Audit. The audit is informational in its first release: it adds evidence-backed findings and repair suggestions but does not alter the existing 0-100 score.

Keep it separate from the current scorer module so the scoring contract remains stable and the new logic can be calibrated against fixtures before any score weighting is considered.

## Alternatives considered

### More generic scoring rules

Adding further word-count, adjective, or keyword checks would be inexpensive but would reward verbose trait lists and be easy to game. Rejected.

### Local Playability Audit

Use bounded text patterns and exact source evidence to find causal links, tension, and greeting coverage. It preserves local-first behaviour and can generate targeted repairs. Chosen.

### Full agentic authoring studio

An ideation workflow, session memory, tool loop, lore graph, and prompt inspector would duplicate a separate product category, introduce fragile state, and weaken CardQualifier's focused repair workflow. Rejected.

## Architecture

Introduce `src/playability.mjs` with one public entry point:

```js
analyzePlayability(data) => {
  band,
  links,
  tensions,
  greetingCoverage,
  findings,
  suggestions,
}
```

`scoreCard` will call the analyzer and return the result as `playability`. It will not use it to calculate `total` or alter existing criterion points in the first release.

The UI will render a compact Playability panel below the decision summary. Its repair suggestions are merged into the existing repair queue and use the same explicit Apply and one-step Undo flow.

The optional AI-review payload will include playability findings and evidence. AI instructions will limit suggestions to the identified gap and require that named facts and uncertainty remain intact.

## Analysis rules

### Interaction links

The analyzer looks for locally evidenced connected statements:

- cause or history: `because`, `after`, `due to`, or a concrete past event;
- behaviour or boundary: `refuses`, `keeps`, `avoids`, `jokes`, `helps`, `does not`;
- consequence or emotion: `so`, `which makes`, `therefore`, `fears`, `regrets`, `becomes`, or an observable reaction.

It reports a link only when source text supplies at least two connected parts. It must retain the exact supporting sentence or phrase as evidence.

### Playable tension

The analyzer detects unresolved pressures such as an explicit contradiction, goal blocked by a limitation, secret, debt, risk, refusal, or ongoing conflict. It treats this as a positive signal only when it can show the source text.

### Opening trajectory

The analyzer compares meaningful normalized terms in `first_mes` with anchors from description, personality, scenario, and enabled lore entries. Common words, character names, `{{char}}`, `{{user}}`, and formatting tokens do not count as links.

An opening does not fail merely because it lacks overlap; it receives a repair only when the card contains strong unused anchors and the greeting is generic or weakly grounded.

### Anti-gaming rules

- Repeated terms do not create additional links.
- A single keyword by itself is not a causal link.
- Metadata, headings, dates, and public-person biographies are ignored.
- The audit does not infer a missing cause, trauma, relationship, or goal.

## User experience

The Playability panel displays:

- a band: `Strong`, `Developing`, or `Thin`;
- no more than three evidence-backed observations;
- the strongest available local repair action.

Repair suggestions can include:

- Connect a defining trait to a cause and visible response.
- Keep one current goal or conflict unresolved.
- Have the opening activate an existing relationship, history, setting pressure, or lore anchor.

Drafts that need new canon use explicit editable brackets. They do not present invented facts as established card content.

Structural errors and missing required fields continue to rank above Playability repairs. The combined repair queue shows at most five entries.

## AI review behaviour

The AI receives local playability findings as context, alongside current score evidence. It must:

- target one identified weak link rather than rewrite the entire character;
- cite supplied evidence;
- preserve named facts and unresolved states;
- phrase required new canon as a candidate draft;
- avoid generic praise and unsupported character psychology.

No new providers, storage, endpoints, or secret-handling behaviour are added.

## Testing and calibration

Add test fixtures for:

1. a flat trait-list card;
2. a compact causal card;
3. a richly interconnected card;
4. a lore-heavy card with an unrelated greeting;
5. a strong definition with a generic greeting;
6. metadata and heading false positives;
7. short but intentionally minimal cards.

Unit tests must confirm returned evidence is sourced from the card, repeated keywords are not rewarded, and existing scores are unchanged. Existing scorer, AI-review, provider-config, and UX-guidance tests must continue to pass.

Manual verification must cover JSON input, PNG input and re-export, Apply, Undo, and optional AI review.

## Rollout

### Release 1: Informational audit

Ship the analyzer, panel, repairs, tests, and AI payload grounding. Do not alter the existing score bands.

### Release 2: Calibrate

Evaluate the audit on a reviewed card corpus. Record false positives and false negatives. Only if it reliably distinguishes flat cards from compact but playable cards, consider adding a score criterion by reallocating existing points rather than raising the total above 100.

## Non-goals

- No multi-phase authoring agent.
- No persistent sessions or chat history.
- No agentic tools, tool-call fallback parser, lore graph, or prompt inspector.
- No automatic card mutation.
- No LLM requirement for analysis.
- No score recalibration in the first release.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Verbose cards game patterns | Require connected evidence and cap repeat signals. |
| Minimal cards are unfairly penalized | Keep release 1 informational and test compact positive fixtures. |
| AI invents canon | Use evidence-grounded instructions and explicit candidate drafting. |
| Scorer complexity grows | Isolate new logic in `src/playability.mjs`. |
| Repair queue becomes noisy | Preserve priority ordering and show at most five repairs. |

## Implementation verification (2026-07-09)

The complete automated suite was run using `node --test`.

Manual browser checks performed:

- sample-panel rendering;
- invalid-JSON reset;
- Apply and Undo;
- JSON export availability; and
- clean console.

PNG verification remains incomplete because it requires a source PNG. Screenshot capture also timed out, so neither is claimed as completed.

## Acceptance criteria

- The audit is entirely local unless the user explicitly runs AI review.
- Every displayed finding and repair has card-derived evidence.
- A card cannot receive extra Playability signals merely by repeating terms.
- Existing total score calculation is unchanged in the first release.
- Existing explicit Apply, Undo, JSON export, and PNG export continue to work.
- The implementation is covered by focused unit tests and the complete test suite.
