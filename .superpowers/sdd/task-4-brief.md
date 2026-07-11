# Task 4: Ground optional AI review in local Playability evidence

Modify only `src/ai-review.mjs` and `test/ai-review.test.mjs`.

Add bounded Playability data to `buildAiReviewPayload(cardText, options)` under the existing `score` object:

```js
playability: {
  band: score.playability.band,
  findings: score.playability.findings.slice(0, 3),
  greetingCoverage: score.playability.greetingCoverage,
}
```

Add this exact instruction to the existing AI review instruction text:

> When Playability evidence identifies a gap, improve one named link only. Preserve all named facts and unresolved states. Do not invent canon; mark any necessary new decision as an editable candidate.

Requirements:

- Preserve the current response schema, response parsing, provider configuration, endpoint behaviour, API-key handling, and request format.
- Send bounded local evidence only; do not expose extra raw card fields.
- Add tests proving the payload contains Playability findings with evidence and the instruction is present.
- Follow TDD; record RED/GREEN and focused/full test evidence in `task-4-report.md`.
