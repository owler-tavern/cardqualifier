function clean(value) { return typeof value === "string" ? value.trim() : ""; }

export function buildImageQuery(card = {}) {
  const parts = [];
  const name = clean(card.name);
  if (name) parts.push(name);
  const tags = Array.isArray(card.tags) ? card.tags.map(clean).filter(Boolean).slice(0, 3) : [];
  parts.push(...tags);
  parts.push("character portrait");
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (p && !seen.has(k)) { seen.add(k); out.push(p); }
  }
  return out.join(" ").slice(0, 120);
}

export function normalizeBraveResults(json) {
  const results = Array.isArray(json?.results) ? json.results : [];
  return results
    .map((r) => ({
      image: clean(r?.properties?.url),
      thumbnail: clean(r?.thumbnail?.src),
      source: clean(r?.url) || clean(r?.source),
      title: clean(r?.title),
      width: r?.properties?.width ?? null,
      height: r?.properties?.height ?? null,
    }))
    .filter((r) => r.image && r.thumbnail);
}