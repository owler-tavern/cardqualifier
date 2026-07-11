# Playability Audit Checklist

- [x] Create and test `src/playability.mjs`.
- [x] Integrate Playability into `scoreCard` without score changes.
- [x] Run `node --test`; review causal and anti-gaming fixtures. Evidence: 2026-07-10 `node --test` reported 53 tests, 53 pass, 0 fail after the weak fixture was replaced with an 800+ word description and the precondition assertion stayed intact.
- [x] Render the Playability panel and verify Apply, Undo, and JSON workflows; PNG remains source-file dependent.
- [x] Add bounded Playability evidence to optional AI review.
- [x] Run `node --test`; manually verify the complete browser flow. Evidence: 2026-07-10 recorded Edge/Playwright pass against the local server completed the full upload -> review -> export path below.
- [x] Document the local, informational release and calibration boundary.

## Recorded browser pass evidence - 2026-07-10

- [x] Garbage upload: rejected `bad-card.txt` with the visible headline "I couldn't read this card."
- [x] JSON upload: loaded `weak-card.json`, scored 22, and rendered 4 blocker field cards.
- [x] PNG upload: loaded a generated PNG card, preserved the art preview, enabled PNG export, and rendered 4 blocker field cards.
- [x] Apply/Undo: Apply changed the active card state and opened the session ledger; Undo restored the prior score/state.
- [x] AI error path: "Need a stronger draft? Ask the reviewer" surfaced "Add an API key before running OpenAI review." without breaking the card.
- [x] Keyboard/focus: focused Reviewer settings, opened it with Enter, verified the modal was active, and closed it with Escape.
- [x] Responsive at ~800px: viewport width 800px had document scrollWidth 800 and 4 visible blocker cards.
- [x] Gate: after 4 blocker applications, Re-analyze unlocked the improvement queue.
- [x] Export: downloaded PNG preserved all non-text image chunks byte-identical; 3 art chunks compared.
- [x] Browser console: clean except for the expected AI review 501 produced by the configured error-path test.
