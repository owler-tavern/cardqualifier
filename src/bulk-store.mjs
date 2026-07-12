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
  // Start a fresh session — every single-card load or new batch resets state so
  // the v1 single-card experience never inherits a stale bulk worklist.
  function reset() { records.length = 0; byId.clear(); selection.clear(); activeId = null; worklist = []; }
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
    // Unreadable records (no result) bucket as "weak" in summary(), so the Weak
    // filter must include them too or the counts won't reconcile.
    if (bands && bands.size) rows = rows.filter((r) => (r.result ? bands.has(r.result.band) : bands.has("Weak")));
    if (query) { const q = query.toLowerCase(); rows = rows.filter((r) => (r.name || r.fileName).toLowerCase().includes(q)); }
    const key = sort === "name" ? (r) => (r.name || r.fileName).toLowerCase() : (r) => (r.result ? r.result.total : -1);
    rows.sort((a, b) => { const ka = key(a), kb = key(b); if (ka < kb) return dir === "asc" ? -1 : 1; if (ka > kb) return dir === "asc" ? 1 : -1; return 0; });
    return rows;
  }

  return { add, get, reset, replace, all, setActive, active, setWorklist, worklistPos, next, prev,
    toggleSelect, clearSelection, selectedIds, selected, summary, view };
}