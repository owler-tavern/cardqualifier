# Bulk Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bulk mode that loads many character cards (folder or multi-select), scores them all in the browser, shows them in a sortable/filterable table with a distribution summary, lets the user triage and improve selected cards using the existing v1 review, and exports a CSV/JSON score report.

**Architecture:** Pure, dependency-free ES modules. New pure modules (`bulk-store`, `bulk-scan`, `score-report`) hold all logic and are unit-tested with `node --test`. `app.mjs` is refactored so per-card state lives in a **card record** owned by a store (approach A); the v1 review operates on the active record. A `mode` flag toggles the Overview and Review views. No server changes, no new dependencies.

**Tech Stack:** Vanilla JavaScript ES modules, Node.js built-in test runner (`node --test`), plain HTML/CSS. No frameworks, no npm dependencies.

## Global Constraints

- **Zero runtime dependencies.** Do not add any npm package or external script. The app has no `package.json` and must stay that way.
- **ES modules only** (`.mjs`, `import`/`export`). Match the existing style.
- **All tests must stay green.** Run `node --test test/*.test.mjs` (from the repo root, in a bash/Git-Bash shell) after every task. The baseline is **100 passing tests**; never let the count regress or any test fail.
- **Preserve v1 behavior exactly.** Loading a single card must still go straight to the review and behave as it does today. `app.mjs` has no unit tests, so its behavior is verified in the browser — do not skip the browser verification steps.
- **Client-side only.** Scoring runs in the browser via `scoreCard`. Do not add server routes.
- **Score bands (from `card-scoring.mjs`):** `>=85` = `Excellent`, `>=70` = `Good`, `>=50` = `Mixed`, else `Weak`. Ship-ready = `Good` or `Excellent`.
- **Commit after every task** with a conventional-commit message. End commit messages with the two trailer lines the repo uses (`Co-Authored-By:` and `Claude-Session:` — copy them from a recent commit, e.g. `git log -1 --format=%B` on a prior commit).
- **Spec:** `docs/superpowers/specs/2026-07-12-bulk-evaluation-design.md` is the source of truth for scope. Read it first.

---

## File Structure

- `src/bulk-store.mjs` (new) — records collection, active pointer, worklist, selection, derived summary/view. Pure, no DOM.
- `src/bulk-scan.mjs` (new) — read a File into card text, build scored records, orchestrate chunked scanning with progress and per-file error isolation. Pure core (injected read/score), no DOM.
- `src/score-report.mjs` (new) — records → CSV / JSON report. Pure.
- `src/bulk-view.mjs` (new) — Overview table + summary rendering and sort/filter/search/select wiring. DOM.
- `src/app.mjs` (modify) — refactor per-card state into the store's active record; add mode toggle and improve-flow wiring.
- `index.html` (modify) — add the Overview section, folder/multi inputs, and the review context bar.
- `styles.css` (modify) — styles for the overview table, summary bar, and context bar.
- `test/bulk-store.test.mjs`, `test/bulk-scan.test.mjs`, `test/score-report.test.mjs` (new) — unit tests.

---

## Task 1: `bulk-store.mjs` — records, active pointer, worklist, selection, summary, view

**Files:**
- Create: `src/bulk-store.mjs`
- Test: `test/bulk-store.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `createBulkStore()` returning an object with:
  - `add(rec) -> stored` (assigns a unique `id` if absent)
  - `get(id) -> record | null`
  - `replace(id, rec) -> record | null`
  - `all() -> record[]`
  - `setActive(id) -> record | null`, `active() -> record | null`
  - `setWorklist(ids)`, `worklistPos() -> { index, total }`, `next() -> record | null`, `prev() -> record | null`
  - `toggleSelect(id) -> Set<id>`, `clearSelection()`, `selectedIds() -> Set<id>`, `selected() -> record[]`
  - `summary() -> { count, scored, avg, buckets: { ship, fixable, weak } }`
  - `view({ sort, dir, bands, query }) -> record[]`
  - A `record` is `{ id, fileName, name, text, sourcePng, result, applied, ledger, previous, gateOpen, edited, error? }`.

- [ ] **Step 1: Write the failing test**

Create `test/bulk-store.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createBulkStore } from "../src/bulk-store.mjs";

function rec(name, total, band) {
  return { fileName: `${name}.json`, name, text: "{}", sourcePng: null,
    result: { total, band, name, reviewPlan: { blockers: [] } },
    applied: [], ledger: [], previous: null, gateOpen: false, edited: false };
}

test("add assigns unique ids and get/all return records", () => {
  const s = createBulkStore();
  const a = s.add(rec("A", 90, "Excellent"));
  const b = s.add(rec("B", 40, "Weak"));
  assert.notEqual(a.id, b.id);
  assert.equal(s.get(a.id).name, "A");
  assert.equal(s.all().length, 2);
});

test("summary computes count, average, and triage buckets from bands", () => {
  const s = createBulkStore();
  s.add(rec("A", 90, "Excellent")); // ship
  s.add(rec("B", 75, "Good"));      // ship
  s.add(rec("C", 60, "Mixed"));     // fixable
  s.add(rec("D", 30, "Weak"));      // weak
  const sum = s.summary();
  assert.equal(sum.count, 4);
  assert.equal(sum.avg, Math.round((90 + 75 + 60 + 30) / 4)); // 64
  assert.deepEqual(sum.buckets, { ship: 2, fixable: 1, weak: 1 });
});

test("view sorts by score desc by default and filters by band + query", () => {
  const s = createBulkStore();
  s.add(rec("Alpha", 90, "Excellent"));
  s.add(rec("Beta", 40, "Weak"));
  s.add(rec("Gamma", 60, "Mixed"));
  const byScore = s.view({}).map((r) => r.name);
  assert.deepEqual(byScore, ["Alpha", "Gamma", "Beta"]);
  const onlyWeak = s.view({ bands: new Set(["Weak"]) }).map((r) => r.name);
  assert.deepEqual(onlyWeak, ["Beta"]);
  const search = s.view({ query: "alph" }).map((r) => r.name);
  assert.deepEqual(search, ["Alpha"]);
});

test("worklist next/prev walk the list and stop at the ends", () => {
  const s = createBulkStore();
  const a = s.add(rec("A", 90, "Excellent"));
  const b = s.add(rec("B", 40, "Weak"));
  const c = s.add(rec("C", 60, "Mixed"));
  s.setWorklist([a.id, b.id, c.id]);
  s.setActive(a.id);
  assert.equal(s.worklistPos().total, 3);
  assert.equal(s.next().name, "B");
  assert.equal(s.next().name, "C");
  assert.equal(s.next().name, "C"); // clamped at end
  assert.equal(s.prev().name, "B");
});

test("selection toggles and unreadable records are excluded from select", () => {
  const s = createBulkStore();
  const a = s.add(rec("A", 90, "Excellent"));
  s.toggleSelect(a.id);
  assert.deepEqual([...s.selectedIds()], [a.id]);
  s.toggleSelect(a.id);
  assert.equal(s.selectedIds().size, 0);
});

test("replace swaps a record in place, preserving id and order", () => {
  const s = createBulkStore();
  const a = s.add(rec("A", 40, "Weak"));
  s.add(rec("B", 90, "Excellent"));
  const improved = { ...a, result: { total: 80, band: "Good", name: "A", reviewPlan: { blockers: [] } }, edited: true };
  s.replace(a.id, improved);
  assert.equal(s.get(a.id).result.total, 80);
  assert.equal(s.all()[0].id, a.id); // order preserved
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bulk-store.test.mjs`
Expected: FAIL with "Cannot find module '../src/bulk-store.mjs'".

- [ ] **Step 3: Write minimal implementation**

Create `src/bulk-store.mjs`:

```js
let nextId = 1;

function bucketOf(band) {
  if (band === "Good" || band === "Excellent") return "ship";
  if (band === "Mixed") return "fixable";
  return "weak"; // Weak or unreadable
}

export function createBulkStore() {
  const records = [];
  const byId = new Map();
  const selection = new Set();
  let activeId = null;
  let worklist = [];

  function add(rec) {
    const id = rec.id ?? `c${nextId++}`;
    const stored = { ...rec, id };
    records.push(stored);
    byId.set(id, stored);
    return stored;
  }
  function get(id) { return byId.get(id) ?? null; }
  function replace(id, rec) {
    const idx = records.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const updated = { ...rec, id };
    records[idx] = updated;
    byId.set(id, updated);
    return updated;
  }
  function all() { return records.slice(); }
  function setActive(id) { activeId = byId.has(id) ? id : null; return get(activeId); }
  function active() { return get(activeId); }
  function setWorklist(ids) { worklist = ids.filter((id) => byId.has(id)); }
  function worklistPos() { return { index: worklist.indexOf(activeId), total: worklist.length }; }
  function next() { const i = worklist.indexOf(activeId); if (i >= 0 && i < worklist.length - 1) activeId = worklist[i + 1]; return active(); }
  function prev() { const i = worklist.indexOf(activeId); if (i > 0) activeId = worklist[i - 1]; return active(); }
  function toggleSelect(id) {
    if (selection.has(id)) selection.delete(id);
    else if (byId.has(id) && get(id).result) selection.add(id); // unreadable records have no result
    return new Set(selection);
  }
  function clearSelection() { selection.clear(); }
  function selectedIds() { return new Set(selection); }
  function selected() { return records.filter((r) => selection.has(r.id)); }
  function summary() {
    const scored = records.filter((r) => r.result);
    const avg = scored.length ? Math.round(scored.reduce((s, r) => s + r.result.total, 0) / scored.length) : 0;
    const buckets = { ship: 0, fixable: 0, weak: 0 };
    for (const r of records) buckets[r.result ? bucketOf(r.result.band) : "weak"]++;
    return { count: records.length, scored: scored.length, avg, buckets };
  }
  function view({ sort = "score", dir = "desc", bands = null, query = "" } = {}) {
    let rows = records.slice();
    if (bands && bands.size) rows = rows.filter((r) => r.result && bands.has(r.result.band));
    if (query) { const q = query.toLowerCase(); rows = rows.filter((r) => (r.name || r.fileName).toLowerCase().includes(q)); }
    const key = sort === "name" ? (r) => (r.name || r.fileName).toLowerCase() : (r) => (r.result ? r.result.total : -1);
    rows.sort((a, b) => { const ka = key(a), kb = key(b); if (ka < kb) return dir === "asc" ? -1 : 1; if (ka > kb) return dir === "asc" ? 1 : -1; return 0; });
    return rows;
  }

  return { add, get, replace, all, setActive, active, setWorklist, worklistPos, next, prev,
    toggleSelect, clearSelection, selectedIds, selected, summary, view };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bulk-store.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite**

Run: `node --test test/*.test.mjs`
Expected: PASS, total = 106 (100 baseline + 6 new).

- [ ] **Step 6: Commit**

```bash
git add src/bulk-store.mjs test/bulk-store.test.mjs
git commit -m "feat: bulk-store for multi-card records, worklist, selection, summary"
```

---

## Task 2: `score-report.mjs` — CSV/JSON score report

**Files:**
- Create: `src/score-report.mjs`
- Test: `test/score-report.test.mjs`

**Interfaces:**
- Consumes: `record` shape from Task 1 (needs `name`, `fileName`, `result.total`, `result.band`, `result.reviewPlan.blockers`, `edited`, optional `error`).
- Produces: `topBlocker(record) -> string`, `reportRows(records) -> row[]`, `toCsv(records) -> string`, `toJson(records) -> string`. Row keys: `name, fileName, score, band, topBlocker, edited`.

- [ ] **Step 1: Write the failing test**

Create `test/score-report.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { topBlocker, reportRows, toCsv, toJson } from "../src/score-report.mjs";

function rec(over = {}) {
  return { fileName: "a.json", name: "A", edited: false,
    result: { total: 61, band: "Mixed", reviewPlan: { blockers: [{ title: "Add example dialogues" }] } },
    ...over };
}

test("topBlocker returns the first blocker title, or a dash, or the error", () => {
  assert.equal(topBlocker(rec()), "Add example dialogues");
  assert.equal(topBlocker(rec({ result: { total: 90, band: "Excellent", reviewPlan: { blockers: [] } } })), "—");
  assert.equal(topBlocker({ fileName: "bad.png", error: "not a card", result: null }), "unreadable: not a card");
});

test("reportRows maps records to flat rows including unreadable ones", () => {
  const rows = reportRows([rec({ name: "Comma, Name", edited: true }), { fileName: "bad.png", error: "boom", result: null }]);
  assert.deepEqual(rows[0], { name: "Comma, Name", fileName: "a.json", score: 61, band: "Mixed", topBlocker: "Add example dialogues", edited: "yes" });
  assert.deepEqual(rows[1], { name: "bad.png", fileName: "bad.png", score: "", band: "unreadable", topBlocker: "unreadable: boom", edited: "no" });
});

test("toCsv quotes values containing commas, quotes, or newlines", () => {
  const csv = toCsv([rec({ name: 'He said "hi", loudly' })]);
  const lines = csv.split("\n");
  assert.equal(lines[0], "name,fileName,score,band,topBlocker,edited");
  assert.match(lines[1], /^"He said ""hi"", loudly",a\.json,61,Mixed,Add example dialogues,no$/);
});

test("toJson is valid JSON of the rows", () => {
  const parsed = JSON.parse(toJson([rec()]));
  assert.equal(parsed[0].score, 61);
  assert.equal(parsed[0].band, "Mixed");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/score-report.test.mjs`
Expected: FAIL with "Cannot find module '../src/score-report.mjs'".

- [ ] **Step 3: Write minimal implementation**

Create `src/score-report.mjs`:

```js
const HEADERS = ["name", "fileName", "score", "band", "topBlocker", "edited"];

export function topBlocker(record) {
  if (record?.error) return `unreadable: ${record.error}`;
  const blockers = record?.result?.reviewPlan?.blockers ?? [];
  return blockers.length ? blockers[0].title : "—";
}

export function reportRows(records) {
  return records.map((r) => ({
    name: r.name ?? r.fileName,
    fileName: r.fileName,
    score: r.result ? r.result.total : "",
    band: r.result ? r.result.band : "unreadable",
    topBlocker: topBlocker(r),
    edited: r.edited ? "yes" : "no",
  }));
}

function esc(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(records) {
  const rows = reportRows(records);
  return [HEADERS.join(","), ...rows.map((row) => HEADERS.map((h) => esc(row[h])).join(","))].join("\n");
}

export function toJson(records) {
  return JSON.stringify(reportRows(records), null, 2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/score-report.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite**

Run: `node --test test/*.test.mjs`
Expected: PASS, total = 110.

- [ ] **Step 6: Commit**

```bash
git add src/score-report.mjs test/score-report.test.mjs
git commit -m "feat: score-report CSV/JSON export for bulk batches"
```

---

## Task 3: `bulk-scan.mjs` — read files into scored records with progress and error isolation

**Files:**
- Create: `src/bulk-scan.mjs`
- Test: `test/bulk-scan.test.mjs`

**Interfaces:**
- Consumes: `scoreCard` and `extractCardJsonFromPng` from `./scorer.mjs`; `record` shape from Task 1.
- Produces:
  - `buildRecord({ fileName, text, sourcePng }, score = scoreCard) -> record`
  - `errorRecord(fileName, error) -> record` (with `error`, `result: null`)
  - `readCardFile(file) -> Promise<{ text, sourcePng }>` (browser File API; PNG → extract, else `.text()`)
  - `scanFiles(files, { onProgress, chunkSize, read, score }) -> Promise<record[]>` — filters to `.json`/`.png`, builds records, isolates per-file errors, calls `onProgress(done, total)` per chunk, yields between chunks.

- [ ] **Step 1: Write the failing test**

Create `test/bulk-scan.test.mjs` (injects fake `read`/`score`, uses plain objects for files — no browser needed):

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildRecord, errorRecord, scanFiles } from "../src/bulk-scan.mjs";

const fakeScore = (text) => ({ total: 70, band: "Good", name: JSON.parse(text).name, reviewPlan: { blockers: [] } });

test("buildRecord scores text and seeds record fields", () => {
  const r = buildRecord({ fileName: "mara.json", text: '{"name":"Mara"}', sourcePng: null }, fakeScore);
  assert.equal(r.name, "Mara");
  assert.equal(r.result.total, 70);
  assert.deepEqual(r.applied, []);
  assert.equal(r.edited, false);
  assert.equal(r.error, undefined);
});

test("buildRecord falls back to fileName when the card has no name", () => {
  const r = buildRecord({ fileName: "nameless.json", text: '{"name":""}', sourcePng: null }, fakeScore);
  assert.equal(r.name, "nameless.json");
});

test("errorRecord carries the message and no result", () => {
  const r = errorRecord("bad.png", new Error("not a card"));
  assert.equal(r.error, "not a card");
  assert.equal(r.result, null);
});

test("scanFiles builds one record per card file and reports progress", async () => {
  const files = [{ name: "a.json" }, { name: "b.json" }, { name: "notes.txt" }];
  const read = async (f) => ({ text: `{"name":"${f.name}"}`, sourcePng: null });
  const progress = [];
  const records = await scanFiles(files, { read, score: fakeScore, chunkSize: 1, onProgress: (d, t) => progress.push([d, t]) });
  assert.equal(records.length, 2); // .txt skipped
  assert.deepEqual(progress.at(-1), [2, 2]);
});

test("scanFiles isolates a failing file as an error record and keeps going", async () => {
  const files = [{ name: "ok.json" }, { name: "broken.png" }];
  const read = async (f) => { if (f.name === "broken.png") throw new Error("bad chunk"); return { text: '{"name":"OK"}', sourcePng: null }; };
  const records = await scanFiles(files, { read, score: fakeScore });
  assert.equal(records.length, 2);
  assert.equal(records[0].name, "OK");
  assert.equal(records[1].error, "bad chunk");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/bulk-scan.test.mjs`
Expected: FAIL with "Cannot find module '../src/bulk-scan.mjs'".

- [ ] **Step 3: Write minimal implementation**

Create `src/bulk-scan.mjs`:

```js
import { scoreCard, extractCardJsonFromPng } from "./scorer.mjs";

export function buildRecord({ fileName, text, sourcePng }, score = scoreCard) {
  const result = score(text);
  return {
    fileName,
    name: (result.name || "").trim() || fileName,
    text,
    sourcePng,
    result,
    applied: [],
    ledger: [`${result.total} · loaded`],
    previous: null,
    gateOpen: false,
    edited: false,
  };
}

export function errorRecord(fileName, error) {
  return {
    fileName,
    name: fileName,
    text: null,
    sourcePng: null,
    result: null,
    error: String(error?.message ?? error),
    applied: [],
    ledger: [],
    previous: null,
    gateOpen: false,
    edited: false,
  };
}

export async function readCardFile(file) {
  const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
  if (isPng) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { text: extractCardJsonFromPng(bytes), sourcePng: { bytes, name: file.name } };
  }
  return { text: await file.text(), sourcePng: null };
}

export async function scanFiles(files, { onProgress, chunkSize = 20, read = readCardFile, score = scoreCard } = {}) {
  const list = [...files].filter((f) => /\.(json|png)$/i.test(f.name));
  const records = [];
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    try {
      const { text, sourcePng } = await read(file);
      records.push(buildRecord({ fileName: file.name, text, sourcePng }, score));
    } catch (e) {
      records.push(errorRecord(file.name, e));
    }
    if ((i + 1) % chunkSize === 0 || i === list.length - 1) {
      onProgress?.(i + 1, list.length);
      await new Promise((r) => setTimeout(r, 0)); // yield so the UI stays responsive
    }
  }
  return records;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/bulk-scan.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite**

Run: `node --test test/*.test.mjs`
Expected: PASS, total = 115.

- [ ] **Step 6: Commit**

```bash
git add src/bulk-scan.mjs test/bulk-scan.test.mjs
git commit -m "feat: bulk-scan reads files into scored records with progress and error isolation"
```

---

## Task 4: Refactor `app.mjs` per-card state into the store's active record (approach A)

**Goal:** Make the store the container for per-card state, without changing v1 behavior. The existing working variables (`text`, `sourcePng`, `result`, `applied`, `gateOpen`, `previous`, `ledger`) become the **live fields of the active record**, synced at navigation boundaries via `saveActive()` / `hydrate(record)`. This task adds the store and sync but keeps the app single-card end-to-end (bulk UI comes in Tasks 5–6). No behavior change is visible yet.

**Files:**
- Modify: `src/app.mjs`

**Interfaces:**
- Consumes: `createBulkStore` (Task 1), `buildRecord`/`readCardFile` (Task 3).
- Produces: module-level `store`; functions `saveActive()`, `hydrate(record)`, and a modified `load()`/`analyze()` that add a record to the store and set it active. Later tasks (5–6) rely on `store`, `saveActive`, `hydrate`, and a `showOverview()`/`showReview()` pair added in Task 6.

**Note:** `app.mjs` has no unit harness. Verify in the browser (Step 4). The `node --test` suite must still show 115 passing (unchanged) since this task touches only browser code.

- [ ] **Step 1: Add imports and the store**

At the top of `src/app.mjs`, add to the existing import block:

```js
import { createBulkStore } from "./bulk-store.mjs";
import { buildRecord, readCardFile, scanFiles } from "./bulk-scan.mjs";
```

Immediately after the existing `const $ = ...; let text = '', ...;` state line, add:

```js
const store = createBulkStore();
// Write the live working vars into the active record (call before switching cards).
function saveActive(){const rec=store.active();if(!rec)return;Object.assign(rec,{text,sourcePng,result,applied:[...applied],gateOpen,previous,ledger:[...ledger],name:result?result.name:rec.name,edited:rec.edited||applied.length>0});}
// Load a record's fields into the live working vars (call after switching cards).
function hydrate(rec){text=rec.text;sourcePng=rec.sourcePng;result=rec.result;applied=[...rec.applied];gateOpen=rec.gateOpen;previous=rec.previous;ledger=[...rec.ledger];}
```

- [ ] **Step 2: Route single-card load through the store**

Find `load(input)` (the function that reads a File and calls `analyze()`). Replace its body so a successfully read single file becomes a store record set active, preserving current behavior. Current `load` roughly does: set `sourcePng`, read PNG or `.text()`, set `text`, then `analyze()`. Rewrite it as:

```js
async function load(input){try{const {text:t,sourcePng:png}=await readCardFile(input);const rec=store.add(buildRecord({fileName:input.name,text:t,sourcePng:png}));store.setActive(rec.id);store.setWorklist([rec.id]);hydrate(rec);if(png){const image=$('#card-art');image.src=URL.createObjectURL(new Blob([png.bytes],{type:'image/png'}));image.onload=()=>{const colors=accentFromImage(image);accent=colors.accent;if(!$('#calm').checked)document.documentElement.style.setProperty('--accent',colors.accent);document.documentElement.style.setProperty('--bright',colors.bright)};image.hidden=false;$('#art-placeholder').hidden=true}else{$('#card-art').hidden=true;$('#art-placeholder').hidden=false}showReview();afterAnalyze()}catch(e){showError(e)}}
```

Add a helper `afterAnalyze()` that contains what `analyze()` did *after* scoring (set journey, render, announce), and change `analyze()` to re-score the active card in place. Replace the existing `analyze()` with:

```js
function analyze(){try{result=scoreCard(text);applied=[];gateOpen=false;ledger=[`${result.total} · loaded`];afterAnalyze()}catch(e){showError(e)}}
function afterAnalyze(){empty.hidden=true;review.hidden=false;$('#gate').hidden=false;setJourney('review');render();announce(`Scored ${result.total}.`);saveActive()}
```

The `#sample-button` handler currently sets `text` then calls `analyze()`. Change it to create a record instead:

```js
$('#sample-button').onclick=()=>{const rec=store.add(buildRecord({fileName:'mara-sample.json',text:JSON.stringify(sample),sourcePng:null}));store.setActive(rec.id);store.setWorklist([rec.id]);hydrate(rec);$('#card-art').hidden=true;$('#art-placeholder').hidden=false;showReview();afterAnalyze()};
```

`showReview()` is added in Task 6; for now add a temporary stub near the other helpers so this task runs standalone:

```js
function showReview(){}  // replaced in Task 6
```

- [ ] **Step 3: Persist edits back into the record**

In `applyCard(card,draft)` and `undo()`, after they recompute `result` and call `render()`, append `saveActive()` as the last statement (before or after `announce(...)`), so the active record reflects the edit. Also set `store.active().edited = true;` inside `applyCard` right after `result=scoreCard(text);`.

- [ ] **Step 4: Verify v1 behavior in the browser**

Start a server on a scratch port and load a card:

```bash
PORT=4174 node server.mjs &
```

In the browser: open `http://127.0.0.1:4174/`, click "Or load Mara, the sample card". Confirm the review renders with the card-specific headline (`Mara Venn — …`), apply a fix, confirm the score updates and Undo works, and the JSON export downloads as `mara-venn.json`. This must match v1 exactly. Then stop the server (`kill %1` or by PID).

- [ ] **Step 5: Run the full suite**

Run: `node --test test/*.test.mjs`
Expected: PASS, total = 115 (unchanged — no test touches `app.mjs`).

- [ ] **Step 6: Commit**

```bash
git add src/app.mjs
git commit -m "refactor: hold per-card review state in the bulk store's active record"
```

---

## Task 5: Overview view — `bulk-view.mjs`, HTML section, and styles

**Goal:** Render the Overview (summary bar + sortable/filterable/searchable table with selection). Pure rendering + event wiring; the mode toggle and improve-flow come in Task 6. After this task the table renders but "Improve"/row-click are wired in Task 6.

**Files:**
- Create: `src/bulk-view.mjs`
- Modify: `index.html` (add the Overview section + folder/multi inputs)
- Modify: `styles.css` (table, summary bar, band dots)

**Interfaces:**
- Consumes: `store` (Task 1) via parameters; `topBlocker` (Task 2).
- Produces: `renderOverview(store, els, state, handlers)` where `els = { summary, tbody, count }`, `state = { sort, dir, bands, query }`, and `handlers = { onRowClick(id), onToggle(id), onImprove() }`. Also `bandDot(band) -> string` (CSS class name).

- [ ] **Step 1: Add the Overview HTML**

In `index.html`, immediately after the `#empty-state` section, add a new hidden section:

```html
<section id="bulk" hidden><div class="bulk-summary" id="bulk-summary"></div><div class="bulk-toolbar"><input id="bulk-search" type="search" placeholder="Search by name…"><div id="bulk-filters" class="segmented"><button data-band="all" class="active">All</button><button data-band="ship">Ship</button><button data-band="fixable">Fixable</button><button data-band="weak">Weak</button></div><span class="grow"></span><button id="bulk-improve" class="ghost" disabled>Improve 0 selected →</button><button id="bulk-report-csv" class="ghost">Report CSV</button><button id="bulk-report-json" class="ghost">Report JSON</button></div><div class="bulk-table-wrap"><table class="bulk-table"><thead><tr><th></th><th data-sort="score">Score</th><th>Band</th><th data-sort="name">Name</th><th>Top blocker</th></tr></thead><tbody id="bulk-tbody"></tbody></table></div></section>
```

Add folder + multi inputs to the existing `#empty-state` drop area. Find the `<input id="card-file" ...>` line and add, right after it:

```html
<input id="folder-file" type="file" webkitdirectory hidden><input id="multi-file" type="file" accept=".json,.png,application/json,image/png" multiple hidden><button id="folder-button" class="link" type="button">Or evaluate a whole folder</button><button id="multi-button" class="link" type="button">Or pick several cards</button>
```

- [ ] **Step 2: Write `bulk-view.mjs`**

Create `src/bulk-view.mjs`:

```js
import { topBlocker } from "./score-report.mjs";

const BUCKET = { Excellent: "ship", Good: "ship", Mixed: "fixable", Weak: "weak" };

export function bandDot(band) { return `dot ${BUCKET[band] || "weak"}`; }

export function renderOverview(store, els, state, handlers) {
  const sum = store.summary();
  const total = sum.count || 1;
  const pct = (n) => Math.round((n / total) * 100);
  els.summary.innerHTML =
    `<b>${sum.count} cards</b> · avg ${sum.avg}` +
    `<span class="dist"><i class="ship" style="width:${pct(sum.buckets.ship)}%"></i>` +
    `<i class="fixable" style="width:${pct(sum.buckets.fixable)}%"></i>` +
    `<i class="weak" style="width:${pct(sum.buckets.weak)}%"></i></span>` +
    `<span>${sum.buckets.ship} ship · ${sum.buckets.fixable} fixable · ${sum.buckets.weak} weak</span>`;

  const bands = state.bands; // Set of band strings, or null for all
  const rows = store.view({ sort: state.sort, dir: state.dir, bands, query: state.query });
  const selected = store.selectedIds();
  els.tbody.replaceChildren(...rows.map((r) => {
    const tr = document.createElement("tr");
    tr.className = r.error ? "unreadable" : "";
    const score = r.result ? r.result.total : "—";
    const band = r.result ? r.result.band : "unreadable";
    const check = r.error ? "" : `<input type="checkbox" ${selected.has(r.id) ? "checked" : ""}>`;
    tr.innerHTML = `<td>${check}</td><td class="score">${score}</td><td><span class="${bandDot(band)}"></span>${band}</td><td class="name">${escapeHtml(r.name || r.fileName)}</td><td class="blocker">${escapeHtml(topBlocker(r))}</td>`;
    const box = tr.querySelector("input");
    if (box) box.onclick = (e) => { e.stopPropagation(); handlers.onToggle(r.id); };
    if (!r.error) tr.querySelector(".name").onclick = () => handlers.onRowClick(r.id);
    return tr;
  }));
  els.count.textContent = `Improve ${selected.size} selected →`;
  els.count.disabled = selected.size === 0;
}

function escapeHtml(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
```

- [ ] **Step 3: Add styles**

Append to `styles.css`:

```css
#bulk{padding:1.5rem;max-width:1100px;margin:0 auto}
.bulk-summary{display:flex;gap:1rem;align-items:center;font-size:.95rem;margin-bottom:1rem}
.bulk-summary .dist{display:inline-flex;width:180px;height:10px;border-radius:5px;overflow:hidden;background:#0002}
.bulk-summary .dist i{display:block;height:100%}
.dist .ship,.dot.ship{background:#6bbf6b}.dist .fixable,.dot.fixable{background:#dfa04f}.dist .weak,.dot.weak{background:#c96}
.bulk-toolbar{display:flex;gap:.5rem;align-items:center;margin-bottom:.75rem}
.bulk-toolbar .grow{flex:1}
.bulk-table{width:100%;border-collapse:collapse}
.bulk-table th,.bulk-table td{text-align:left;padding:.4rem .6rem;border-bottom:1px solid #0001}
.bulk-table th[data-sort]{cursor:pointer}
.bulk-table td.score{font-variant-numeric:tabular-nums;font-weight:600}
.bulk-table td.name{cursor:pointer;text-decoration:underline dotted}
.bulk-table tr.unreadable{opacity:.55}
.dot{display:inline-block;width:.6rem;height:.6rem;border-radius:50%;margin-right:.4rem}
```

- [ ] **Step 4: Verify the table renders (temporary harness)**

Because wiring is completed in Task 6, do a quick manual check: temporarily, at the end of `app.mjs`, you may add a throwaway `window.__renderBulkDemo` that adds a few sample records and calls `renderOverview`; load the page and confirm the table + summary appear and sort/search look right. **Remove the throwaway before committing.** (Task 6 provides the real wiring.)

- [ ] **Step 5: Run the full suite**

Run: `node --test test/*.test.mjs`
Expected: PASS, total = 115 (no new unit tests; `bulk-view` is DOM code verified in-browser).

- [ ] **Step 6: Commit**

```bash
git add src/bulk-view.mjs index.html styles.css
git commit -m "feat: bulk overview table, summary bar, and folder/multi inputs"
```

---

## Task 6: Wire modes and the improve flow

**Goal:** Connect everything: folder/multi/drag load → scan with progress → Overview; row-click and "Improve selected" → Review with a context bar (Back/Prev/Next); return-refresh; report downloads.

**Files:**
- Modify: `src/app.mjs`
- Modify: `index.html` (add the review context bar)

**Interfaces:**
- Consumes: `store`, `saveActive`, `hydrate`, `afterAnalyze` (Task 4); `scanFiles` (Task 3); `renderOverview` (Task 5); `toCsv`, `toJson` (Task 2).
- Produces: `showOverview()`, `showReview()` (replaces the Task 4 stub), and the wired handlers.

- [ ] **Step 1: Add the review context bar HTML**

In `index.html`, at the very start of the `#review` section (right after `<section id="review" hidden>`), add:

```html
<div id="review-context" class="review-context" hidden><button id="ctx-overview" class="link" type="button">← Overview</button><span id="ctx-pos"></span><button id="ctx-prev" class="ghost" type="button">← Prev</button><button id="ctx-next" class="ghost" type="button">Next →</button></div>
```

Add minimal styles (append to `styles.css`):

```css
.review-context{display:flex;gap:.75rem;align-items:center;padding:.5rem 1rem;background:#0001;border-radius:8px;margin-bottom:1rem}
.review-context .link{margin-right:auto}
```

- [ ] **Step 2: Add mode helpers and progress**

In `app.mjs`, replace the Task 4 `showReview(){}` stub with:

```js
// Full replacement of the Task 4 `showReview(){}` stub. Review chrome + context bar.
// Context bar shows whenever this is a bulk session (>1 record); Prev/Next only when the
// current worklist has more than one card.
function showReview(){
  $('#bulk').hidden=true;empty.hidden=true;review.hidden=false;$('#gate').hidden=false;setJourney('review');
  const {index,total}=store.worklistPos();
  const bulkSession=store.all().length>1;
  $('#review-context').hidden=!bulkSession;
  $('#ctx-pos').textContent=total>1?`Card ${index+1} of ${total}`:'';
  $('#ctx-prev').hidden=total<=1;
  $('#ctx-next').hidden=total<=1;
}
function showOverview(){saveActive();$('#review').hidden=true;empty.hidden=true;$('#bulk').hidden=false;renderBulk();}
function renderBulk(){renderOverview(store,{summary:$('#bulk-summary'),tbody:$('#bulk-tbody'),count:$('#bulk-improve')},bulkState,bulkHandlers);}
```

Add near the other module state:

```js
const bulkState={sort:'score',dir:'desc',bands:null,query:''};
```

Add the import at the top:

```js
import { renderOverview } from "./bulk-view.mjs";
import { toCsv, toJson } from "./score-report.mjs";
```

- [ ] **Step 3: Wire folder / multi / drag load through `scanFiles`**

Add handlers (near the existing `#sample-button` wiring):

```js
$('#folder-button').onclick=()=>$('#folder-file').click();
$('#multi-button').onclick=()=>$('#multi-file').click();
$('#folder-file').addEventListener('change',e=>loadMany(e.target.files));
$('#multi-file').addEventListener('change',e=>loadMany(e.target.files));
async function loadMany(files){const list=[...files].filter(f=>/\.(json|png)$/i.test(f.name));if(!list.length)return;if(list.length===1){await load(list[0]);return;}announce(`Scoring ${list.length} cards…`);const recs=await scanFiles(list,{onProgress:(d,t)=>announce(`Scored ${d} / ${t}…`)});for(const r of recs)store.add(r);announce(`Scored ${recs.length} cards.`);showOverview();}
```

Update the existing drop zone `change`/drop handler: the file input currently handles a single file. Add multi support to the drop by finding the existing `file.addEventListener('change', ...)` and leaving it for single; the folder/multi buttons cover bulk. (If a drag-drop-multiple handler exists, route it to `loadMany(e.dataTransfer.files)`.)

- [ ] **Step 4: Wire overview handlers, sort, filter, search**

Add:

```js
const bulkHandlers={onRowClick:id=>{store.setActive(id);store.setWorklist([id]);hydrate(store.get(id));showReview();render();},onToggle:id=>{store.toggleSelect(id);renderBulk();},onImprove:()=>{const ids=[...store.selectedIds()];if(!ids.length)return;store.setWorklist(ids);store.setActive(ids[0]);hydrate(store.get(ids[0]));showReview();render();}};
$('#bulk-improve').onclick=()=>bulkHandlers.onImprove();
$('#bulk-search').addEventListener('input',e=>{bulkState.query=e.target.value;renderBulk();});
for(const b of $('#bulk-filters').children)b.onclick=()=>{for(const x of $('#bulk-filters').children)x.classList.toggle('active',x===b);const band=b.dataset.band;bulkState.bands=band==='all'?null:new Set(band==='ship'?['Good','Excellent']:band==='fixable'?['Mixed']:['Weak']);renderBulk();};
for(const th of document.querySelectorAll('.bulk-table th[data-sort]'))th.onclick=()=>{const key=th.dataset.sort;bulkState.dir=(bulkState.sort===key&&bulkState.dir==='desc')?'asc':'desc';bulkState.sort=key;renderBulk();};
```

- [ ] **Step 5: Wire context bar (Back / Prev / Next) with return-refresh**

Add:

```js
// saveActive() mutates the active record in place, so showOverview()'s own saveActive() is
// enough — no explicit store.replace needed here.
$('#ctx-overview').onclick=()=>showOverview();
$('#ctx-prev').onclick=()=>{saveActive();const r=store.prev();hydrate(r);showReview();render();};
$('#ctx-next').onclick=()=>{saveActive();const r=store.next();hydrate(r);showReview();render();};
```

- [ ] **Step 6: Wire report downloads**

Add (reuse the existing `blob(data,name,type)` helper):

```js
$('#bulk-report-csv').onclick=()=>blob(toCsv(store.all()),'card-scores.csv','text/csv');
$('#bulk-report-json').onclick=()=>blob(toJson(store.all()),'card-scores.json','application/json');
```

- [ ] **Step 7: Verify the whole flow in the browser**

```bash
PORT=4174 node server.mjs &
```

Prepare a test folder of 5–10 `.json` and/or `.png` cards (include one deliberately broken file). In the browser at `http://127.0.0.1:4174/`:
1. Click "Or evaluate a whole folder", pick the folder. Confirm the summary bar + table render, the broken file shows as an "unreadable" row, and progress was announced.
2. Sort by Score (toggle asc/desc), filter by band chips, search by name — confirm the table updates.
3. Click a card's name → the v1 review opens for it with no Prev/Next; "← Overview" returns and the table still shows.
4. Select 3 cards, click "Improve 3 selected →" → review opens on the first with "Card 1 of 3 · Prev/Next"; step through; apply a fix on one; return to Overview and confirm that card's score updated.
5. Load a *single* file via the original picker → goes straight to the review (no overview), exactly like v1.
6. Click "Report CSV" and "Report JSON" → files download with the expected rows.

Stop the server.

- [ ] **Step 8: Run the full suite**

Run: `node --test test/*.test.mjs`
Expected: PASS, total = 115.

- [ ] **Step 9: Commit**

```bash
git add src/app.mjs index.html styles.css
git commit -m "feat: wire bulk modes, improve worklist, and report downloads"
```

---

## Task 7: Final verification and cleanup

**Files:** none (verification only)

- [ ] **Step 1: Full suite green**

Run: `node --test test/*.test.mjs`
Expected: PASS, total = 115, 0 failures.

- [ ] **Step 2: Confirm no stray demo/throwaway code**

Grep for leftovers from Task 5's temporary harness:

Run: `grep -rn "__renderBulkDemo\|throwaway\|console.log" src/`
Expected: no matches (remove any found, re-run tests, amend the relevant commit).

- [ ] **Step 3: Confirm zero dependencies**

Run: `ls package.json 2>/dev/null && echo "UNEXPECTED package.json" || echo "no package.json — good"`
Expected: "no package.json — good". Also confirm no new `import` from a bare package name (only relative `./` imports and `node:` builtins in tests).

- [ ] **Step 4: v1 regression pass**

In the browser (single-card path): load one JSON and one PNG card; confirm scoring, apply, undo, and per-card export (`<slug>.json` / `<slug>.png`) all behave as in v1.

---

## Self-Review (author's notes for the implementer)

- **Spec coverage:** input folder/multi/drag (Task 5–6), chunked scoring + progress (Task 3, 6), sortable/filterable/searchable table + summary (Task 5–6), distribution buckets from bands (Task 1), direct-click and select-and-step improve on the v1 review (Task 6), single-file → straight to review (Task 4, 6 Step 3/7), unreadable-row isolation (Task 3, 5), CSV/JSON report (Task 2, 6). Deferred (out of scope): thumbnails, batch-zip export.
- **`app.mjs` risk:** Tasks 4 and 6 are the only behavior-preserving edits to dense v1 code and have no unit harness — the browser steps are mandatory. If any v1 step regresses, stop and fix before proceeding.
- **Type consistency:** the `record` shape is identical across `bulk-scan` (creation), `bulk-store` (storage), and `score-report` (consumption): `{ id, fileName, name, text, sourcePng, result, applied, ledger, previous, gateOpen, edited, error? }`.
