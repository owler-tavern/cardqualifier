const TEXT_FIELDS = ["description", "greeting", "examples"];

export function analyzeStyle(data = {}) {
  const textByField = {
    description: String(data.description ?? ""),
    greeting: String(data.first_mes ?? ""),
    examples: String(data.mes_example ?? ""),
  };
  const findings = [];
  const firstPerson = TEXT_FIELDS.filter((field) => /\bI\b|\bmy\b/i.test(textByField[field]));
  const thirdPerson = TEXT_FIELDS.filter((field) => /\b(?:she|he|they)\b/i.test(textByField[field]));
  if (firstPerson.length && thirdPerson.length) findings.push(finding("style.perspective", "description", "Perspective shifts between card fields; keep narration and voice intentional.", [...firstPerson, ...thirdPerson]));

  const combined = Object.values(textByField).join(" ");
  const negatives = combined.match(/\b(?:do not|don't|never|avoid|must not)\b/gi) ?? [];
  if (negatives.length >= 3) findings.push(finding("style.positive-framing", "description", "Several prohibitions describe behavior negatively; state the preferred behavior too.", negatives));

  const traits = String(data.personality ?? "").match(/\b[a-z]{4,}\b/gi)?.filter((word) => !/^(and|with|that|this|they|their|from)$/i.test(word)) ?? [];
  const examples = textByField.examples.toLowerCase();
  const unanchored = traits.filter((trait) => !examples.includes(trait.toLowerCase()));
  if (traits.length >= 2 && unanchored.length) findings.push(finding("style.trait-anchoring", "mes_example", "Some stated traits have no dialogue anchor; show them under pressure in examples.", unanchored.slice(0, 3)));
  return findings;
}

function finding(id, field, summary, evidence) {
  return { id, field, source: "style", severity: "advisory", summary, evidence, estimatedDelta: 0, fixTemplate: null };
}
