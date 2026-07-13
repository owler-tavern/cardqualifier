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
  let s = String(value ?? "");
  // Neutralize spreadsheet formula injection: card names/blockers come from
  // untrusted cards, so a leading =/+/-/@ (or tab/CR) could execute in Excel.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(records) {
  const rows = reportRows(records);
  return [HEADERS.join(","), ...rows.map((row) => HEADERS.map((h) => esc(row[h])).join(","))].join("\n");
}

export function toJson(records) {
  return JSON.stringify(reportRows(records), null, 2);
}