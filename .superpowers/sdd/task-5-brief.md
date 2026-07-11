# Task 5: Document the informational rollout

Modify only `README.md` and `docs/superpowers/specs/2026-07-09-playability-audit-design.md`.

Requirements:

- Add this capability bullet to the README quality-check list: `local Playability Audit: connected causes, behaviour, unresolved tension, and greeting-to-card grounding`.
- Add this paragraph after “Why this rubric”: `The Playability Audit is a local writing-quality heuristic. It shows evidence from the card and recommends repairs, but it does not predict a model's exact behaviour or change the overall score in this release.`
- Append a dated `Implementation verification` section to the design spec. It must state that the suite was run using `node --test`, and list manual browser checks actually performed: sample-panel rendering, invalid-JSON reset, Apply/Undo, JSON export availability, and clean console. Note that PNG verification requires a source PNG and screenshot capture timed out; do not claim either as completed.
- Do not edit application code.
- Run `node --test` and record the result in `task-5-report.md`.
