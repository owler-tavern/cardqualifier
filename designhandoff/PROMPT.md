# Prompt for Claude Code / ChatGPT

Copy everything below the line into the coding agent, with this bundle's folder
placed inside (or next to) the CardQualifier repo.

---

You are implementing a full redesign of **CardQualifier**, a local, no-build,
vanilla-JS web app that quality-checks AI character cards (SillyTavern / Tavern
V1–V2 PNG/JSON). The repo you're working in contains the current app:
`index.html`, `styles.css`, `server.mjs`, and `src/*.mjs` (scorer, playability,
ai-review, cx-guidance, provider-config) with tests in `test/`.

A design bundle is provided in `designhandoff/`. Read, in
this order:

1. `README.md` — the complete UI spec: layout, tokens, copy, interactions,
   states, and six known gaps you must fill using the documented guidance.
2. `unified-pipeline-spec.md` — the engine refactor: detectors → merger → drafter,
   the shared `Finding` shape, merger/gating rules, and AI schema changes.
3. `screenshots/` — visual ground truth: `01/02/03-unified-final.png` (weak card:
   initial → blockers applied → gate unlocked), `strong-card.png` (score-89 state
   with steering + ledger), `weak-card-gate.png`, `weak-card-merged.png`
   (mechanic details), `settings-modal.png` (provider settings modal to port).
4. The `.dc.html` files — interactive HTML prototypes (open in a browser; they are
   design references, NOT production code — do not copy their code or their
   `support.js`/`image-slot.js` runtime).

## Ground rules

- Keep the app's architecture: plain ES modules, no framework, no build step, one
  stylesheet, works by opening `index.html` (analysis) with optional `node
  server.mjs` (AI review). Do not add dependencies.
- **The score must remain 100% deterministic and auditable.** The rubric weights
  and bands do not change. Playability and style checks advise; they never move
  points. The AI never detects or judges — it only drafts fixes for findings the
  local engine produced (enforce `resolvesFindingIds` client-side, dropping any
  draft that references unknown ids).
- Follow the spec's migration order (steps 1–6), but land step 5 (AI request/schema
  change) together with step 4 (UI rewire) — the schema change breaks the current
  server flow.
- Extend the existing test suite as you go: reshape tests for findings, golden
  tests for the merger (strong sample → 2 improvement cards + advisories; weak
  card → 2 blockers, gated rest), unit tests for the three new style lints, and
  a test that AI suggestions with unknown finding ids are dropped.
- Preserve existing behaviors that already work: PNG chunk read/write (art must
  remain byte-identical except text chunks), one-level undo, provider settings
  persistence (never persist API keys), sample card, `node --test` passing.
- Accessibility: keep focus-visible outlines; gated items get `aria-disabled`;
  announce unlock/rescore via a live region; the art-sampled accent must be
  clamped to ≥4.5:1 contrast on `#1a1511`; include the "calm" toggle to disable
  per-card theming.
- Fonts: Spectral, Instrument Sans, IBM Plex Mono via Google Fonts `<link>` (the
  app is local-first — if offline, fall back to Georgia/system-ui/monospace
  gracefully).

## Order of work

1. Engine: `Finding` shape + reshape rubric/playability outputs (tests green).
2. Style detectors (perspective, positive framing, trait anchoring).
3. `merge-findings.mjs` + gate logic (golden tests).
4. UI rebuild per README + screenshots, including the six documented gaps
   (empty, error, AI-loading states; settings modal port; responsive; a11y).
5. AI drafter changes (payload: findings + creatorDirection + targetModel; schema:
   `resolvesFindingIds`, `directionUsed`, remove `warranted`).
6. Delete essence suggestions + old panels; update README score-band docs if copy
   changed.

Work incrementally and keep `node --test` passing after each step. When a visual
call isn't covered by the README, match the screenshots; when neither covers it,
prefer the quietest option consistent with the token table.
