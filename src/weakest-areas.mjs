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

const WEAK_RATIO = 0.7;
const SEVERE_RATIO = 0.4;

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