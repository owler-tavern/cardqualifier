export function mergeFindings(findings = [], { targetModel = "any", appliedFindingIds = [], gateOpen = false } = {}) {
  const applied = new Set(appliedFindingIds);
  const actionable = findings.filter((finding) => finding.severity !== "advisory" && !applied.has(finding.id));
  const blockers = cards(actionable.filter((finding) => finding.severity === "blocker"), targetModel);
  const improvements = cards(actionable.filter((finding) => finding.severity === "improvement"), targetModel);
  const unresolved = blockers.length > 0;
  return {
    blockers,
    improvements,
    advisories: findings.filter((finding) => finding.severity === "advisory"),
    gate: { open: !unresolved && gateOpen, reason: unresolved ? "Improvements stay locked until every blocker is cleared — this keeps you fixing what breaks the card first." : gateOpen ? "Queue open — these are actionable now." : "Blockers cleared. Re-analyze to open the improvement queue." },
  };
}

function cards(findings, targetModel) {
  const grouped = new Map();
  for (const finding of findings) {
    const card = grouped.get(finding.field) ?? { field: finding.field, title: titleFor(finding.field), findings: [], leverage: 0, fixTemplate: null };
    card.findings.push(finding);
    card.leverage += finding.estimatedDelta || 0;
    card.fixTemplate ||= variant(finding.fixTemplate, targetModel);
    grouped.set(finding.field, card);
  }
  return [...grouped.values()].sort((a, b) => b.leverage - a.leverage);
}

function variant(template, targetModel) { return template && typeof template === "object" ? template[targetModel === "small-local" ? "small" : targetModel] || template.any || null : template || null; }
function titleFor(field) { return String(field).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
