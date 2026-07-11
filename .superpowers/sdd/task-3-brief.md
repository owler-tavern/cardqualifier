# Task 3: Render the Playability panel

Modify only `index.html`, `styles.css`, and `src/app.mjs`.

Use `result.playability` already returned by `scoreCard` to add a compact panel below the existing decision panel and before Repair Queue.

Required markup:

```html
<section class="playability-panel" id="playability-panel" aria-labelledby="playability-title" hidden>
  <div class="section-heading">
    <h3 id="playability-title">Playability</h3>
    <span id="playability-band" class="playability-band"></span>
  </div>
  <p id="playability-summary" class="playability-summary"></p>
  <ul id="playability-findings" class="playability-findings"></ul>
</section>
```

Requirements:

- Add DOM references and `renderPlayability(playability)`.
- It hides and clears before analysis and on invalid JSON; otherwise shows the band, a concise text summary, and at most three findings.
- Render all card-derived content with `textContent`, not `innerHTML`.
- Use existing CSS variables, spacing, layout, and typography; do not add a new visual system.
- Preserve existing Repair Queue, Apply, Undo, AI Review, JSON export, and PNG export behaviours.
- Do not add interactive controls or new state.
- Follow TDD as applicable: add a lightweight test for a pure `playabilitySummaryFor` helper if one is introduced; record all test evidence. Do not introduce browser-test infrastructure for this small static rendering change.
- Run `node --test` and use a local browser/manual check: sample renders, invalid JSON clears the panel, Apply/Undo work, and JSON export works; PNG export if a PNG source is available.

Report all commands/results and self-review to `F:\Docker\Projects\CardQualifier\.superpowers\sdd\task-3-report.md`.
