# Bulk View Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the bulk-evaluation view so it uses the app's design tokens and lets a creator triage a batch at a glance — a polished List (default) plus a Gallery toggle, mono scores, band pills, a narrated summary, and per-card weakest-area chips.

**Architecture:** One new pure helper (`weakestAreas`) computes each card's weakest rubric areas from `result.criteria`. `src/bulk-view.mjs` splits its single `renderOverview` into `renderSummary` + `renderList` + `renderGallery`, dispatched on a new `bulkState.view`. `index.html` restructures the `#bulk` markup and `styles.css` replaces the bulk block with token-based rules. `src/bulk-store.mjs` is untouched.

**Tech Stack:** Node.js ESM (`.mjs`), `node --test`, plain static HTML/CSS, zero third-party dependencies, no build step.

**Design spec:** `docs/superpowers/specs/2026-07-12-bulk-view-redesign-design.md`

## Global Constraints

- ESM only (`.mjs`); no `package.json`, no third-party dependencies, no build step.
- Run tests with `node --test test/*.test.mjs` (the bare `node --test test/` directory form is broken on Node 24). Keep every suite green.
- Use only the existing design tokens (`--good` `#93cba4`, `--warn` `#e0a463`, `--bad` `#e2897d`, `--accent` `#dfa04f`, `--bright`, `--text`, `--body`, `--muted`, `--faint`, `--card`, `--raised`, `--inset`, `--line`) and the existing type system (Spectral serif headings, Instrument Sans body, IBM Plex Mono for numerals). No new off-palette colors.
- Band → bucket → color: Excellent/Good → `ship` → `--good`; Mixed → `fixable` → `--warn`; Weak/unreadable → `weak` → `--bad`.
- `weakestAreas` must be a total pure function — never throws; malformed/empty input returns `{ areas: [], more: 0 }`.
- One logical change per commit; commit at the end of each task.
- Follow existing code style: small focused modules, terse flat CSS, `escapeHtml`-style helpers, no comments restating the obvious.
- Reuse the existing `.segmented`, `.grow`, and `.ghost` classes for toolbar controls; do not invent parallel ones.

---

### Task 1: The `weakestAreas` helper — `src/weakest-areas.mjs`

**Files:**
- Create: `src/weakest-areas.mjs`
- Test: `test/weakest-areas.test.mjs`

**Interfaces:**
- Consumes: a scored `result` object with `result.criteria` — an array of `{ label, max, points, note }` (the exact shape `criterion()` produces in `src/card-scoring.mjs:301`).
- Produces: `weakestAreas(result, limit = 3) -> { areas: Array<{ label: string, severity: "hi" | "mid" }>, more: number }`. `areas` holds the weakest criteria (those below 70% of their max), lowest ratio first, capped at `limit`; `more` is how many additional weak criteria were dropped past the cap.

- [ ] **Step 1: Write the failing test**

Create `test/weakest-areas.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { weakestAreas } from "../src/weakest-areas.mjs";

const crit = (label, max, points) => ({ label, max, points, note: "" });

test("empty / malformed input yields no areas and never throws", () => {
  for (const v of [null, undefined, {}, { criteria: null }, { criteria: [] }, 42]) {
    assert.deepEqual(weakestAreas(v), { areas: [], more: 0 });
  }
});

test("only criteria below 70% of max are weak, lowest ratio first", () => {
  const result = { criteria: [
    crit("Character substance", 23, 23), // 100% — strong, excluded
    crit("Voice", 8, 5),                 // 62.5% — weak, mid
    crit("Character depth", 16, 4),      // 25% — weak, hi
  ] };
  const { areas, more } = weakestAreas(result);
  assert.deepEqual(areas.map((a) => a.label), ["Depth", "Voice"]);
  assert.equal(areas[0].severity, "hi");
  assert.equal(areas[1].severity, "mid");
  assert.equal(more, 0);
});

test("severity splits hi/mid at 40% of max", () => {
  const result = { criteria: [
    crit("Voice", 10, 3),           // 30% -> hi
    crit("Opening message", 10, 5), // 50% -> mid
  ] };
  const byLabel = Object.fromEntries(weakestAreas(result).areas.map((a) => [a.label, a.severity]));
  assert.equal(byLabel.Voice, "hi");
  assert.equal(byLabel.Opening, "mid");
});

test("caps at limit and reports the overflow count", () => {
  const result = { criteria: [
    crit("Structure and compatibility", 14, 1),
    crit("Character substance", 23, 2),
    crit("Opening message", 12, 1),
    crit("Voice", 8, 1),
    crit("Character depth", 16, 1),
  ] };
  const { areas, more } = weakestAreas(result, 3);
  assert.equal(areas.length, 3);
  assert.equal(more, 2);
});

test("unmapped criterion labels fall back to themselves", () => {
  const { areas } = weakestAreas({ criteria: [crit("New Rubric Axis", 10, 1)] });
  assert.equal(areas[0].label, "New Rubric Axis");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/weakest-areas.test.mjs`
Expected: FAIL — `Cannot find module '../src/weakest-areas.mjs'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/weakest-areas.mjs`:

```js
// Long rubric labels -> short chip labels. An unmapped label falls back to
// itself so a renamed/added criterion still renders.
const SHORT_LABELS = {
  "Structure and compatibility": "Structure",
  "Character substance": "Substance",
  "Opening message": "Opening",
  "Voice": "Voice",
  "Token efficiency": "Tokens",
  "Metadata hygiene": "Metadata",
  "Lorebook support": "Lorebook",
  "Character depth": "Depth",
};

const WEAK_RATIO = 0.7;   // below this fraction of max, an area counts as weak
const SEVERE_RATIO = 0.4; // below this, the shortfall is severe ("hi")

export function weakestAreas(result, limit = 3) {
  const criteria = result && Array.isArray(result.criteria) ? result.criteria : [];
  const weak = criteria
    .filter((c) => c && c.max > 0 && c.points / c.max < WEAK_RATIO)
    .map((c) => ({
      label: SHORT_LABELS[c.label] ?? c.label,
      severity: c.points / c.max < SEVERE_RATIO ? "hi" : "mid",
      ratio: c.points / c.max,
    }))
    .sort((a, b) => a.ratio - b.ratio);
  const areas = weak.slice(0, limit).map(({ label, severity }) => ({ label, severity }));
  return { areas, more: Math.max(0, weak.length - areas.length) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/weakest-areas.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/weakest-areas.mjs test/weakest-areas.test.mjs
git commit -m "feat: weakestAreas derives a card's weakest rubric areas"
```

---

### Task 2: Redesign the List view — markup, styles, and renderers

This task delivers the polished default **List**: token-based summary card, restyled toolbar, and a crafted table with mono scores, band pills, name + top-blocker, and weakest-area chips. No unit test — `bulk-view.mjs` renders DOM directly and the repo has no jsdom; verify in the running app (consistent with the current, untested `bulk-view`). All new *logic* is already tested in Task 1.

**Files:**
- Modify: `index.html` (the `#bulk` section, currently line 4)
- Modify: `styles.css` (replace the bulk block, currently lines 593–608)
- Modify: `src/bulk-view.mjs` (rewrite; currently 37 lines)

**Interfaces:**
- Consumes: `weakestAreas` from `./weakest-areas.mjs` (Task 1); `topBlocker` from `./score-report.mjs` (existing); `store.summary()` → `{ count, scored, avg, buckets: { ship, fixable, weak } }`; `store.view({ sort, dir, bands, query })` → rows; `store.selectedIds()` → `Set`.
- Produces: `renderOverview(store, els, state, handlers)` unchanged in signature. `els` = `{ summary, tbody, count }` (same as today). `handlers` = `{ onRowClick, onToggle }` (same as today). Internal helpers `renderSummary`, `renderList`, `weakChipsHtml`, `pillHtml`, `scoreCellHtml`, `bucketClass`, `escapeHtml` are added for reuse by Task 3.

- [ ] **Step 1: Restructure the `#bulk` markup in `index.html`**

Replace the entire `<section id="bulk" …>…</section>` (line 4) with:

```html
<section id="bulk" hidden><div class="bulk-summary" id="bulk-summary"></div><div class="bulk-toolbar"><input id="bulk-search" type="search" placeholder="Search by name…"><div id="bulk-filters" class="segmented"><button data-band="all" class="active">All</button><button data-band="ship">Ship</button><button data-band="fixable">Fixable</button><button data-band="weak">Weak</button></div><span class="grow"></span><button id="bulk-improve" class="ghost" disabled>Improve 0 selected →</button><button id="bulk-report-csv" class="ghost">CSV</button><button id="bulk-report-json" class="ghost">JSON</button></div><div class="bulk-table-wrap"><table class="bulk-table"><thead><tr><th class="c-check"></th><th class="c-score" data-sort="score">Score</th><th>Band</th><th data-sort="name">Card</th><th class="c-weak">Weakest areas</th></tr></thead><tbody id="bulk-tbody"></tbody></table></div></section>
```

(The Gallery toggle and grid container are added in Task 3.)

- [ ] **Step 2: Replace the bulk CSS block in `styles.css`**

Delete the current bulk rules (lines 593–608, from `#bulk{…}` through `.review-context` — keep `.review-context` and `.dot` only if they appear; re-add `.dot` below) and insert:

```css
#bulk{padding:1.5rem 0;max-width:1080px;margin:0 auto}
.bulk-summary{display:flex;align-items:center;gap:26px;flex-wrap:wrap;background:var(--raised);border:1px solid var(--line);border-radius:14px;padding:16px 22px;margin-bottom:14px}
.bulk-summary .headline{display:flex;align-items:baseline;gap:10px}
.bulk-summary .headline b{font-family:'IBM Plex Mono',monospace;font-size:30px;font-weight:600;line-height:1}
.bulk-summary .headline small{color:var(--muted);font-size:13px}
.bulk-summary .avg{font-family:'IBM Plex Mono',monospace;color:var(--bright)}
.bulk-summary .avg em{color:var(--faint);font-style:normal;font-size:12px;margin-right:4px}
.bulk-summary .dist{flex:1;min-width:200px;display:flex;flex-direction:column;gap:7px}
.bulk-summary .bar{display:flex;height:11px;border-radius:6px;overflow:hidden;background:var(--inset)}
.bulk-summary .bar i{display:block;height:100%}
.bulk-summary .bar i.ship{background:var(--good)}.bulk-summary .bar i.fixable{background:var(--warn)}.bulk-summary .bar i.weak{background:var(--bad)}
.bulk-summary .legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--muted)}
.bulk-summary .legend b{color:var(--text)}
.bulk-summary .legend .k{display:inline-flex;align-items:center;gap:6px}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block;background:var(--faint)}
.dot.ship{background:var(--good)}.dot.fixable{background:var(--warn)}.dot.weak{background:var(--bad)}
.bulk-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.bulk-toolbar .grow{flex:1}
.bulk-toolbar input[type=search]{background:var(--inset);border:1px solid var(--line);color:var(--text);border-radius:9px;padding:8px 12px;font:inherit;font-size:14px;min-width:180px}
.bulk-toolbar input[type=search]::placeholder{color:var(--faint)}
.bulk-table-wrap{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.bulk-table{width:100%;border-collapse:collapse}
.bulk-table thead th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);font-weight:600;padding:11px 16px;background:var(--raised);border-bottom:1px solid var(--line)}
.bulk-table th[data-sort]{cursor:pointer}
.bulk-table th.c-weak,.bulk-table td.c-weak{text-align:right}
.bulk-table tbody td{padding:13px 16px;border-bottom:1px solid var(--line);vertical-align:middle}
.bulk-table tbody tr:last-child td{border-bottom:0}
.bulk-table tbody tr:hover{background:var(--raised)}
.bulk-table td.c-check{width:34px}
.bulk-table td.c-score{width:78px}
.bulk-table input[type=checkbox]{accent-color:var(--accent);width:15px;height:15px}
.score{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:21px;font-variant-numeric:tabular-nums;color:var(--faint)}
.score small{color:var(--faint);font-size:11px;font-weight:400}
.score.ship{color:var(--good)}.score.fixable{color:var(--warn)}.score.weak{color:var(--bad)}
.bulk-table .name{font-family:Spectral,serif;font-size:16px;cursor:pointer}
.bulk-table .blocker{color:var(--muted);font-size:13px;margin-top:2px}
.bulk-table tr.unreadable{opacity:.5}
.pill{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;padding:3px 10px 3px 8px;border-radius:20px}
.pill.ship{color:var(--good);background:#93cba41a;border:1px solid #93cba43a}
.pill.fixable{color:var(--warn);background:#e0a4631a;border:1px solid #e0a4633a}
.pill.weak{color:var(--bad);background:#e2897d1a;border:1px solid #e2897d3a}
.weak-areas{display:inline-flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.chip{display:inline-flex;align-items:center;gap:6px;background:var(--inset);border:1px solid var(--line);border-radius:7px;padding:3px 8px;font-size:11.5px;color:var(--body);white-space:nowrap}
.chip .sev{width:6px;height:6px;border-radius:50%}
.chip .sev.hi{background:var(--bad)}.chip .sev.mid{background:var(--warn)}
.chip.more{color:var(--faint);border-style:dashed}
.review-context{display:flex;gap:.75rem;align-items:center;padding:.5rem 1rem;background:#0001;border-radius:8px;margin-bottom:1rem}
.review-context .link{margin-right:auto}
```

Note: the old `.dist .ship,.dot.ship{background:#6bbf6b}…` off-palette rule and the old `.bulk-table`/`.bulk-summary` rules are removed by this replacement. Keep `.review-context` (shown above) since it lived in the same block.

- [ ] **Step 3: Rewrite `src/bulk-view.mjs`**

Replace the whole file with:

```js
import { topBlocker } from "./score-report.mjs";
import { weakestAreas } from "./weakest-areas.mjs";

const BUCKET = { Excellent: "ship", Good: "ship", Mixed: "fixable", Weak: "weak" };
function bucketClass(band) { return BUCKET[band] || "weak"; }

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function scoreCellHtml(r) {
  if (r.error || !r.result) return `<span class="score">—</span>`;
  return `<span class="score ${bucketClass(r.result.band)}">${r.result.total}<small>/100</small></span>`;
}

function pillHtml(band, unreadable) {
  const label = unreadable ? "Unreadable" : band;
  return `<span class="pill ${bucketClass(band)}"><span class="dot ${bucketClass(band)}"></span>${escapeHtml(label)}</span>`;
}

function weakChipsHtml(result) {
  const { areas, more } = weakestAreas(result);
  if (!areas.length && !more) return "";
  const chips = areas.map((a) => `<span class="chip"><span class="sev ${a.severity}"></span>${escapeHtml(a.label)}</span>`);
  if (more) chips.push(`<span class="chip more">+${more}</span>`);
  return `<div class="weak-areas">${chips.join("")}</div>`;
}

function renderSummary(store, summaryEl) {
  const sum = store.summary();
  const total = sum.count || 1;
  const pct = (n) => Math.round((n / total) * 100);
  const b = sum.buckets;
  summaryEl.innerHTML =
    `<div class="headline"><b>${sum.count}</b><small>cards scored</small></div>` +
    `<div class="avg"><em>avg</em>${sum.avg}</div>` +
    `<div class="dist"><div class="bar">` +
      `<i class="ship" style="width:${pct(b.ship)}%"></i>` +
      `<i class="fixable" style="width:${pct(b.fixable)}%"></i>` +
      `<i class="weak" style="width:${pct(b.weak)}%"></i></div>` +
    `<div class="legend">` +
      `<span class="k"><span class="dot ship"></span><b>${b.ship}</b> ready to ship</span>` +
      `<span class="k"><span class="dot fixable"></span><b>${b.fixable}</b> a fix away</span>` +
      `<span class="k"><span class="dot weak"></span><b>${b.weak}</b> need real work</span>` +
    `</div></div>`;
}

function renderList(rows, els, selected, handlers) {
  els.tbody.replaceChildren(...rows.map((r) => {
    const tr = document.createElement("tr");
    tr.className = r.error ? "unreadable" : "";
    const band = r.result ? r.result.band : "unreadable";
    const check = r.error ? "" : `<input type="checkbox" ${selected.has(r.id) ? "checked" : ""}>`;
    const weak = r.error ? "" : weakChipsHtml(r.result);
    tr.innerHTML =
      `<td class="c-check">${check}</td>` +
      `<td class="c-score">${scoreCellHtml(r)}</td>` +
      `<td>${pillHtml(band, r.error)}</td>` +
      `<td><div class="name">${escapeHtml(r.name || r.fileName)}</div><div class="blocker">${escapeHtml(topBlocker(r))}</div></td>` +
      `<td class="c-weak">${weak}</td>`;
    const box = tr.querySelector("input");
    if (box) box.onclick = (e) => { e.stopPropagation(); handlers.onToggle(r.id); };
    if (!r.error) tr.querySelector(".name").onclick = () => handlers.onRowClick(r.id);
    return tr;
  }));
}

export function renderOverview(store, els, state, handlers) {
  renderSummary(store, els.summary);
  const rows = store.view({ sort: state.sort, dir: state.dir, bands: state.bands, query: state.query });
  const selected = store.selectedIds();
  renderList(rows, els, selected, handlers);
  els.count.textContent = `Improve ${selected.size} selected →`;
  els.count.disabled = selected.size === 0;
}
```

- [ ] **Step 4: Syntax-check and run the full suite**

Run: `node --check src/bulk-view.mjs && node --test test/*.test.mjs`
Expected: no syntax error; all suites PASS (no test imports `bandDot`, which was removed — if any does, it is stale; grep `git grep bandDot` should show no importers).

- [ ] **Step 5: Verify in the running app**

Start the dev server: `PORT=4200 node server.mjs` (health at `http://127.0.0.1:4200/api/health`). In the browser, use the "pick several cards" input to load 3+ local cards (or duplicate the sample card file a few times). Confirm:
- The summary card shows count / avg / a colored distribution bar / the narrated legend.
- Each row shows a mono score colored by band, a band pill, the name in serif with the top blocker beneath, and weakest-area chips right-aligned (with `+N` overflow where applicable).
- Search, the band filter, and clicking the Score/Card headers to sort all still work.
- Clicking a name opens that card's review; the checkbox toggles selection and updates "Improve N selected".
- An unreadable file renders dimmed with `—` and an "Unreadable" pill.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css src/bulk-view.mjs
git commit -m "feat: redesign the bulk List view with tokens, pills, and weak-area chips"
```

---

### Task 3: Add the Gallery view and the List/Gallery toggle

Adds the tile grid, the toolbar toggle, and the `state.view` dispatch. Same signals as the List, reflowed into tiles. No unit test (DOM/CSS); verify in-app.

**Files:**
- Modify: `index.html` (add the toggle to the toolbar and the grid container to `#bulk`)
- Modify: `styles.css` (add `.bulk-grid` and `.tile` rules)
- Modify: `src/bulk-view.mjs` (add `renderGallery`; dispatch in `renderOverview`)
- Modify: `src/app.mjs` (add `bulkState.view`, pass `grid`/`tableWrap` els, wire the toggle)

**Interfaces:**
- Consumes: the Task 2 helpers (`bucketClass`, `escapeHtml`, `weakChipsHtml`, `topBlocker`); `state.view` (`"list" | "gallery"`); `els.grid` and `els.tableWrap` DOM nodes.
- Produces: `renderOverview` now toggles `els.tableWrap.hidden` / `els.grid.hidden` on `state.view` and calls `renderGallery` when `state.view === "gallery"`.

- [ ] **Step 1: Add the toggle and grid to `index.html`**

In the `#bulk` toolbar, insert the view toggle immediately after `<span class="grow"></span>` and before the `#bulk-improve` button:

```html
<div id="bulk-view-toggle" class="segmented"><button data-view="list" class="active">☰ List</button><button data-view="gallery">▦ Gallery</button></div>
```

Immediately after the `<div class="bulk-table-wrap">…</div>` and before `</section>`, add:

```html
<div id="bulk-grid" class="bulk-grid" hidden></div>
```

- [ ] **Step 2: Add the gallery CSS to `styles.css`**

Append after the `.chip.more` rule from Task 2:

```css
.bulk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.tile:hover{border-color:#4a3f2e}
.tile.unreadable{opacity:.5}
.tile-top{display:flex;align-items:flex-start;justify-content:space-between}
.tile .stamp{width:60px;height:60px;border-radius:11px;background:var(--inset);border:1px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center}
.tile .stamp b{font-family:'IBM Plex Mono',monospace;font-size:23px;font-weight:600;line-height:1}
.tile .stamp span{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--faint)}
.tile .stamp.ship{border-color:#93cba43a}.tile .stamp.ship b{color:var(--good)}
.tile .stamp.fixable{border-color:#e0a4633a}.tile .stamp.fixable b{color:var(--warn)}
.tile .stamp.weak{border-color:#e2897d3a}.tile .stamp.weak b{color:var(--bad)}
.tile input[type=checkbox]{accent-color:var(--accent);width:16px;height:16px}
.tile-name{font-family:Spectral,serif;font-size:17px;cursor:pointer}
.tile-blocker{color:var(--muted);font-size:13px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tile .weak-areas{justify-content:flex-start;margin-top:auto}
```

- [ ] **Step 3: Add `renderGallery` and dispatch in `src/bulk-view.mjs`**

Add this function above `renderOverview`:

```js
function renderGallery(rows, els, selected, handlers) {
  els.grid.replaceChildren(...rows.map((r) => {
    const tile = document.createElement("div");
    tile.className = r.error ? "tile unreadable" : "tile";
    const band = r.result ? r.result.band : "unreadable";
    const check = r.error ? "" : `<input type="checkbox" ${selected.has(r.id) ? "checked" : ""}>`;
    const stampScore = r.error || !r.result ? "—" : r.result.total;
    const bandLabel = r.error ? "Unreadable" : band;
    const weak = r.error ? "" : weakChipsHtml(r.result);
    tile.innerHTML =
      `<div class="tile-top">` +
        `<div class="stamp ${bucketClass(band)}"><b>${stampScore}</b><span>${escapeHtml(bandLabel)}</span></div>` +
        `${check}` +
      `</div>` +
      `<div class="tile-name">${escapeHtml(r.name || r.fileName)}</div>` +
      `<div class="tile-blocker">${escapeHtml(topBlocker(r))}</div>` +
      `${weak}`;
    const box = tile.querySelector("input");
    if (box) box.onclick = (e) => { e.stopPropagation(); handlers.onToggle(r.id); };
    if (!r.error) tile.querySelector(".tile-name").onclick = () => handlers.onRowClick(r.id);
    return tile;
  }));
}
```

Then replace the body of `renderOverview` with:

```js
export function renderOverview(store, els, state, handlers) {
  renderSummary(store, els.summary);
  const rows = store.view({ sort: state.sort, dir: state.dir, bands: state.bands, query: state.query });
  const selected = store.selectedIds();
  const gallery = state.view === "gallery";
  els.tableWrap.hidden = gallery;
  els.grid.hidden = !gallery;
  if (gallery) renderGallery(rows, els, selected, handlers);
  else renderList(rows, els, selected, handlers);
  els.count.textContent = `Improve ${selected.size} selected →`;
  els.count.disabled = selected.size === 0;
}
```

- [ ] **Step 4: Wire `state.view`, els, and the toggle in `src/app.mjs`**

Change the `bulkState` initializer (line 15) to add `view`:

```js
const bulkState={sort:'score',dir:'desc',bands:null,query:'',view:'list'};
```

Change `renderBulk` (line 57) to pass the new els:

```js
function renderBulk(){renderOverview(store,{summary:$('#bulk-summary'),tbody:$('#bulk-tbody'),count:$('#bulk-improve'),grid:$('#bulk-grid'),tableWrap:$('.bulk-table-wrap')},bulkState,bulkHandlers);}
```

Add the toggle handler next to the other bulk handlers (after the filter `for` loop at line 38):

```js
for(const b of $('#bulk-view-toggle').children)b.onclick=()=>{for(const x of $('#bulk-view-toggle').children)x.classList.toggle('active',x===b);bulkState.view=b.dataset.view;renderBulk();};
```

- [ ] **Step 5: Syntax-check and run the full suite**

Run: `node --check src/bulk-view.mjs && node --check src/app.mjs && node --test test/*.test.mjs`
Expected: no syntax error; all suites PASS.

- [ ] **Step 6: Verify the toggle in the running app**

With `PORT=4200 node server.mjs` running and a 3+ card batch loaded:
- Click **▦ Gallery** — the table hides and a responsive grid of tiles appears, each with the score stamp, band pill color, serif name, a 2-line-clamped top blocker, and left-aligned weak-area chips.
- Selection made in one view is reflected in the other (check a tile, switch to List, the row is checked).
- Click **☰ List** — returns to the table. Search / filter / sort still work in List; the toggle stays highlighted correctly.
- An unreadable card shows a dimmed tile with `—` and an "Unreadable" stamp label and no checkbox.

- [ ] **Step 7: Commit**

```bash
git add index.html styles.css src/bulk-view.mjs src/app.mjs
git commit -m "feat: add bulk Gallery tile view with a List/Gallery toggle"
```

---

## Self-Review

- **Spec coverage:** design tokens/type system ↔ Task 2 CSS + Task 3 CSS (Global Constraints); List (Direction A) ↔ Task 2; Gallery + toggle ↔ Task 3; `weakestAreas` pure/tested ↔ Task 1; band→color table ↔ Global Constraints + `bucketClass`; narrated summary ↔ `renderSummary`; unreadable/empty edge cases ↔ Task 2 Step 5 + Task 3 Step 6 + `scoreCellHtml`/`pillHtml`; no thumbnails/tags, no persistence, no virtualization ↔ honored (not built). All spec sections covered.
- **Type consistency:** `weakestAreas(result, limit) -> { areas: [{label, severity}], more }` is produced in Task 1 and consumed identically in `weakChipsHtml` (Tasks 2/3). `renderOverview(store, els, state, handlers)` signature is stable across Tasks 2 and 3; `els` grows from `{summary,tbody,count}` (Task 2) to also include `{grid,tableWrap}` (Task 3), and Task 3 updates the single call site in `app.mjs` in the same task. `bucketClass`/`escapeHtml`/`weakChipsHtml` are defined in Task 2 and reused in Task 3. Bucket keys (`ship`/`fixable`/`weak`) match `store.summary().buckets`.
- **No placeholders:** every code and CSS block is complete and runnable; no TBD/TODO.
