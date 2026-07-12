# Bulk Evaluation — Design (v2)

**Status:** approved design, pre-implementation
**Date:** 2026-07-12
**Depends on:** v1.0.0 (deterministic `scoreCard`, single-card review flow)

## 1. Goal

Let a user evaluate many character cards at once: point to a folder or
multi-select cards, score them all, see them together, triage, and pick
which to improve. Improving a card uses the existing v1 review, unchanged.

This is a **v2 layer on top of v1** — client-side, dependency-free, no server
rewrite. `scoreCard` already runs in the browser, so bulk scoring runs there
too.

### Success criteria

- Load 100–500 cards (folder or multi-select) and see every one scored, with a
  progress indicator during scoring.
- A sortable, filterable, searchable table with a score-distribution summary.
- Select any subset and step through improving them; or click one card to
  improve it directly.
- Download a score report (CSV or JSON) of the whole batch.
- Loading a **single** card behaves exactly like v1 (straight to the review).

### Non-goals (YAGNI)

- Batch "export all improved" as a zip (would add a zip dependency). Improved
  cards are exported one at a time via the existing per-card buttons.
- Art thumbnails in the table (deferred; band-color dot instead — see §7).
- Server-side folder scanning / filesystem watching (browser file APIs suffice
  at 100–500).
- Running the AI reviewer across many cards automatically.

## 2. Input

All client-side; no server changes:

- **Folder pick** via `<input type="file" webkitdirectory>` ("point to a folder").
- **Multi-select** via `<input type="file" multiple>`.
- **Drag-drop** of multiple files onto the existing drop zone.

Accept `.json` and `.png`. Files that are not parseable cards are surfaced as an
**"unreadable" row** (name + reason), never aborting the batch. Non-card files
with unrelated extensions are silently skipped.

**Routing rule:** one file loaded → go straight to the Review view (v1
behavior). Two or more → go to the Overview view.

## 3. Architecture

### 3.1 The state refactor (approach A)

Today `app.mjs` holds one card in module-level singletons (`text`, `sourcePng`,
`result`, `applied`, `ledger`, `previous`, `gateOpen`, …). Bulk needs many, so
per-card state is extracted into a **card record**:

```
CardRecord {
  id,          // stable unique id (assigned on load; dedupes filenames)
  fileName,    // original file name, for display + export naming
  name,        // card display name (result.name)
  text,        // current card JSON string (may be edited)
  sourcePng,   // { bytes, name } | null  (for PNG re-export)
  result,      // scoreCard(text) output
  applied,     // applied finding ids
  ledger,      // this-card change log
  previous,    // undo snapshot
  gateOpen,    // review gate state
  edited,      // boolean: has the user applied any change?
}
```

Records live in a small **store** (`src/bulk-store.mjs`), pure state with no DOM:

- `records[]`, `activeId`, `selection` (Set of ids).
- Operations: `add(record)`, `get(id)`, `setActive(id)`, `next()/prev()` over
  the current worklist, `toggleSelect(id)`, `clearSelection()`, `replace(id, record)`
  (after a card is edited/re-scored), and derived views: `summary()` (counts +
  average + band distribution), `sorted(key, dir)`, `filtered(bandSet, query)`.

Both modes share the store: the Overview renders `records`; the Review operates
on `store.get(activeId)`. The v1 review logic is unchanged in behavior — it just
reads/writes the active record's fields instead of module globals.

### 3.2 New modules

- `src/bulk-store.mjs` — records collection, active pointer, selection, derived
  summary/sort/filter. Pure, unit-tested.
- `src/bulk-scan.mjs` — turn a `FileList`/array into records, **scoring in
  yielding chunks** (~20 at a time, `await` a macrotask between chunks) so the UI
  stays responsive and reports `scored N / total`. Parse/score errors are caught
  per file and become "unreadable" records. No art decode here.
- `src/score-report.mjs` — pure `records → CSV` and `records → JSON` (name,
  fileName, score, band, top blocker, edited). CSV values escaped.
- View code — the Overview table renderer + sort/filter/search/select wiring.
  Lives in `src/bulk-view.mjs` (kept separate from the review view code).

### 3.3 Views & mode

Two views toggled by a `mode` flag (`'overview' | 'review'`), no router:

- **Overview** (`#bulk` section, new): summary bar
  (`N cards · avg X · distribution bar · ship / fixable / weak counts`) and a
  table with columns `[☐] score · band · name · top blocker`. Sortable by column
  header, band filter chips, name search box. Actions: **Improve N selected →**
  and **Download report ▾ (CSV / JSON)**.
- **Review** (existing `#review` section): unchanged, plus a slim context bar
  when entered from bulk: `← Overview · Card k/n · ← Prev · Next →`. When
  navigating away (Prev/Next/Overview), the active record is written back to the
  store and re-scored, so the Overview reflects updated scores.

### 3.4 Improve flow (two entries, one screen)

- **Direct:** click a table row → `setActive(id)`, worklist = [that id], enter
  Review. No Prev/Next shown (worklist of one).
- **Selected:** "Improve N selected" → worklist = selected ids in current sort
  order, `setActive(first)`, enter Review with Prev/Next.

Improving always uses the v1 review (blockers, gate, reviewer drafts, apply,
undo, per-card export) operating on the active record.

## 4. Data flow

```
files ──bulk-scan──> records[] (scored, chunked+progress) ──> bulk-store
                                                                  │
                          ┌───────────────────────────────────────┤
                          ▼                                        ▼
                   Overview view                             Review view
             (summary + table, sort/                  (v1 review on active
              filter/search/select)                    record; Prev/Next)
                          │                                        │
                          ├── Improve selected / click row ────────┘
                          │        (setActive, enter review)
                          └── Download report (score-report → CSV/JSON)
                                       ▲
                     edited record written back + re-scored on nav
```

## 5. Error handling & edge cases

- Per-file parse/score failure → isolated "unreadable" record `{ error }`; batch
  continues. Unreadable rows are visually distinct and non-selectable for improve.
- Duplicate file names → distinct record ids; display disambiguates if needed.
- Large batches (≤500): chunked scoring keeps the main thread responsive; PNG
  card extraction parses text chunks only (no full image decode).
- Report export disabled until a batch exists.
- "Back to overview" is always available from Review when in bulk mode; in
  single-card (v1) mode it is not shown.
- Leaving a half-improved card and returning preserves its in-memory edits for
  the session (held in the record).

## 6. Testing

**Unit (node --test):**
- `bulk-store`: add/dedupe, setActive, next/prev bounds, selection toggle,
  summary counts + average + distribution, sort + filter + search.
- `bulk-scan`: mixed good/bad inputs → correct record count, errors isolated,
  progress callback invoked; single-file vs multi routing signal.
- `score-report`: CSV escaping and column order; JSON shape.

**In-browser verification (as with v1):** load a folder, watch progress, sort/
filter/search, drill in directly, select-and-step with Prev/Next, confirm
return-refresh updates scores, download CSV and JSON.

## 7. Deferred enhancements (post-v2)

- Lazy art thumbnails in the table (IntersectionObserver-decoded).
- Batch "export all improved" (needs a client-side zip lib).
- Persisting a batch/report across sessions.
