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