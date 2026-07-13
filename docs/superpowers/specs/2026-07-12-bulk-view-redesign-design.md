# Bulk View Redesign — Design

**Status:** approved design, pre-implementation
**Date:** 2026-07-12
**Depends on:** in-flight bulk-evaluation work on `feat/bulk-evaluation`
(`src/bulk-view.mjs`, `src/bulk-store.mjs`, `src/score-report.mjs`, the `#bulk`
section in `index.html`, and the bulk handlers in `src/app.mjs`).

## 1. Goal

The bulk-evaluation view works but looks unfinished: it renders a bare bordered
table that ignores the app's design system entirely — hardcoded colors
(`#6bbf6b` green, `#0002`/`#0001` hairlines at `styles.css:593-608`) that clash
with the warm dark theme and its tokens (`--good:#93cba4`, `--accent:#dfa04f`,
Spectral serif headings). Redesign it so a card creator scanning a batch of
15–60 cards can triage at a glance and the view feels crafted rather than like a
raw data dump.

### Success criteria

- The bulk view uses only the existing design tokens and type system — no
  hardcoded off-palette colors.
- A creator can scan the batch and answer "which do I open and improve?"
  quickly: score, band, top blocker, and the card's weakest rubric areas are all
  legible at a glance.
- Two views behind one toggle: a dense **List** (default) and a **Gallery** of
  tiles, both showing the same signals.
- No new dependencies, no build step. Plain ESM `.mjs` + static HTML/CSS.
- The one new piece of logic (`weakestAreas`) is a pure, tested function.

### Non-goals (YAGNI)

- Portrait thumbnails and card tags/genre in rows or tiles. Explicitly out — the
  view stays about writing quality, and the app never judges the art.
- View-preference persistence across sessions. Default is List every session;
  `reset()` already wipes bulk state per batch, so persistence would fight it.
- Virtualized/windowed rendering. 15–60 is the design target; the grid and table
  degrade gracefully past 100 without special machinery.
- Any change to scoring, `bulk-store` selection/worklist logic, or the
  score-report export.
- Column reordering, resizing, or new sort keys beyond today's Score/Name.

## 2. Design language

Adopt the app tokens throughout. Band → semantic color mapping (reused by pills,
score text, distribution bar, and severity dots):

| Bucket    | Bands              | Token     |
| --------- | ------------------ | --------- |
| ship      | Excellent, Good    | `--good`  |
| fixable   | Mixed              | `--warn`  |
| weak      | Weak, unreadable   | `--bad`   |

- **Score:** IBM Plex Mono, tabular numerals, colored by band; `—` when
  unreadable.
- **Band:** a pill (`.pill`) with a leading severity dot; text/border/tint from
  the bucket color. Unreadable records show a "Unreadable" weak pill.
- **Name:** Spectral serif.
- **Top blocker:** one muted sentence from the existing `topBlocker(r)`.
- **Weakest areas:** compact chips with a calm colored dot (no bars, no
  tooltips).
- **Summary voice:** narrated ("9 ready to ship · 9 a fix away · 5 need real
  work"), not terse labels.

The concrete visual reference is the approved mockup (Direction A for the List;
Direction B's stamp block reused for Gallery tiles).

## 3. Components

### 3.1 `weakestAreas(result, limit = 3)` — new pure function

The only new logic. Lives in `src/bulk-view.mjs` (exported for test) or a small
`src/weakest-areas.mjs` if that reads cleaner during implementation — either is
fine as long as it is pure and tested.

- **Input:** a scored `result` object carrying `result.criteria` — an array of
  `{ label, max, points, ... }` (the shape `criterion()` already produces in
  `card-scoring.mjs`).
- **Output:** an array of at most `limit` `{ label, severity }`, for criteria
  scoring **below 70% of their max**, ordered lowest ratio first.
  - `severity` = `"hi"` when `points / max < 0.4`, else `"mid"`.
  - `label` is the short display name via a fixed map (long rubric label → chip
    label):

    | Rubric label                 | Chip label |
    | ---------------------------- | ---------- |
    | Structure and compatibility  | Structure  |
    | Character substance          | Substance  |
    | Opening message              | Opening    |
    | Voice                        | Voice      |
    | Token efficiency             | Tokens     |
    | Metadata hygiene             | Metadata   |
    | Lorebook support             | Lorebook   |
    | Character depth              | Depth      |

    An unmapped label falls back to itself (forward-compatible if a criterion is
    renamed/added).
- **Totality:** missing/empty `result` or `criteria` → `[]`. Never throws.
- A count of how many criteria were dropped past `limit` is derivable by the
  caller (`weakCount - shown.length`) to render the `+N` overflow chip; the
  function may also return the full filtered length if that reads cleaner.

### 3.2 `renderOverview` split — `src/bulk-view.mjs`

Split today's single `renderOverview` into focused renderers dispatched on the
new `state.view`:

- `renderSummary(store, els)` — count · avg · segmented distribution bar ·
  narrated legend, from `store.summary()`.
- `renderList(rows, els, selected, handlers)` — the table body: score / pill /
  name+blocker / weak-area chips per row, wiring the existing checkbox-toggle
  and name-click handlers unchanged.
- `renderGallery(rows, els, selected, handlers)` — the same rows as grid tiles
  (score stamp, pill, serif name, clamped top blocker, weak chips, checkbox),
  same handlers.

`escapeHtml`, `bandDot`, and the `BUCKET` map stay. Rendering stays DOM-only and
untested (no jsdom in the repo — consistent with the current `bulk-view`); all
new *logic* is in `weakestAreas`.

### 3.3 Markup — `index.html` `#bulk`

- Summary block restructured for count/avg/distribution/legend.
- Toolbar gains a **List/Gallery** segmented toggle (alongside the existing
  search, band filter, Improve, and Report buttons).
- The table keeps its `<thead>` (Score/Name still sortable) and `#bulk-tbody`;
  the gallery reuses `#bulk-tbody`'s container by swapping the table for a grid
  wrapper when `state.view === "gallery"` (implementation may keep two sibling
  containers and toggle `hidden` — whichever is simpler).

### 3.4 Styles — `styles.css`

Replace lines 593–608 with token-based rules for: summary card, distribution
bar + legend, toolbar controls (search, segmented groups, primary/ghost
buttons), the ledger table (mono score, pills, chips, hover), and the gallery
grid (`repeat(auto-fill, minmax(230px, 1fr))`) + tile/stamp. Keep the file's
existing terse, flat CSS style.

### 3.5 State + handler — `src/app.mjs`

- Add `state.view` (`"list"` | `"gallery"`, default `"list"`).
- Wire the toggle button to set `state.view` and re-render.
- No other bulk handler changes; sort, filter, search, selection, Improve, and
  Report keep working across both views.

## 4. Data flow

```
store.view({sort,dir,bands,query}) -> rows
  renderSummary(store.summary())                 -> summary card
  state.view === "gallery"
    ? renderGallery(rows, …)                      -> grid of tiles
    : renderList(rows, …)                         -> ledger table
  per row/tile:
    topBlocker(r)          -> blocker sentence (existing)
    weakestAreas(r.result) -> chips (+N overflow)
```

## 5. Error handling / edge cases

- **Unreadable records** (no `result`): dimmed, `—` score, "Unreadable" weak
  pill, no checkbox — matches current behavior; they bucket as weak so filter
  counts reconcile with `summary()` (the invariant noted in
  `bulk-store.mjs:59-61`).
- **Excellent cards with no criterion below threshold:** empty weak-areas cell /
  tile footer — no filler.
- **Empty batch / single card:** render without special-casing.
- `weakestAreas` is total (see 3.1); a malformed `result` yields no chips rather
  than a throw.

## 6. Testing

- New `test/weakest-areas.test.mjs` (or an added block in an existing suite if
  the function lives in `bulk-view.mjs`): threshold cut at 70%, `hi`/`mid`
  severity split at 40%, ordering lowest-first, `limit` capping, the label map,
  and totality on empty/malformed input.
- `bulk-store` and `score-report` suites must stay green unchanged (no logic
  touched there).
- DOM renderers are not unit-tested (no jsdom), consistent with today; verify
  them by loading a multi-card batch in the running app
  (`PORT=4200 node server.mjs`) and confirming both views render, the toggle
  works, and selection/filter/sort behave.

Run `node --test test/*.test.mjs` (the bare `test/` directory form is broken on
Node 24 — use the glob) and keep every suite green.
