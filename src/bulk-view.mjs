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
