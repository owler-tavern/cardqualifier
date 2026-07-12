import test from "node:test";
import assert from "node:assert/strict";
import { scoreCard } from "../src/scorer.mjs";
import { analyzePlayability } from "../src/playability.mjs";
import { createAppServer } from "../server.mjs";

test("prose 'unknown' is not a placeholder, but a standalone field value is", () => {
  const prose = scoreCard({
    name: "Aria",
    description: "The corset pushes her figure up to unknown size and fullness.",
    personality: "Warm but wary.",
    scenario: "A masquerade ball.",
    first_mes: "Hello?",
    mes_example: "",
  });
  assert.ok(!prose.findings.some((f) => f.title === "Placeholder text detected"), "prose 'unknown' must not flag");

  const template = scoreCard({
    name: "Aria",
    description: "Age: Unknown",
    personality: "Warm but wary.",
    scenario: "A masquerade ball.",
    first_mes: "Hello?",
    mes_example: "",
  });
  const finding = template.findings.find((f) => f.title === "Placeholder text detected");
  assert.ok(finding, "standalone 'Unknown' value must flag");
  assert.match(finding.detail, /Unknown/, "the finding quotes the offending text");
});

test("the placeholder blocker quotes the matched text and names the field", () => {
  const result = scoreCard({
    name: "Aria",
    description: "Backstory: to be written.",
    personality: "Warm but wary.",
    scenario: "A masquerade ball.",
    first_mes: "Hello?",
    mes_example: "",
  });
  const cleanup = result.suggestions.find((s) => s.field === "cleanup");
  assert.ok(cleanup, "cleanup suggestion exists");
  assert.match(cleanup.reason, /to be written/i, "quotes the matched placeholder");
  assert.match(cleanup.reason, /description/i, "names the field");
});

test("a causal draft carries no raw markdown and is not built from a {{user}} sentence", () => {
  const result = analyzePlayability({
    name: "Afterparty",
    description: "A quiet corner of a loud room.",
    personality: "",
    scenario: "A big gala afterparty with dim lights and music.",
    first_mes: "*{{user}} spotted Barbara at the bar, texting angrily.* *Nearby, Ana de Armas works the room by the tall windows.*",
    mes_example: "",
  });
  const draft = result.suggestions.find((s) => s.title === "Connect a cause to a visible behavior")?.draft || "";
  assert.ok(draft, "a causal draft is produced");
  assert.doesNotMatch(draft, /[*_`]/, "no raw markdown leaks into the draft");
  assert.doesNotMatch(draft, /Because\s+\{\{user\}\}/i, "the draft is not built from a {{user}}-subject sentence");
});

test("a causal draft is withheld when the evidence subject is a different named person", () => {
  // Ensemble/scene card: the name is a scene, and the strongest evidence sentence is about
  // Elle Fanning (a different named person), which is exactly the real Hollywood card shape.
  const ensemble = analyzePlayability({
    name: "Hollywood Gala Afterparty",
    description: "Elle Fanning is ordering a drink at the crowded bar and swaying on her feet, clearly a little drunk already.",
    personality: "",
    scenario: "A party.",
    first_mes: "Music plays.",
    mes_example: "",
  });
  const ensembleSuggestion = ensemble.suggestions.find((s) => s.title === "Connect a cause to a visible behavior");
  assert.ok(ensembleSuggestion, "the causal finding still appears");
  assert.equal(ensembleSuggestion.draft, undefined, "no fabricated draft about a foreign subject");

  // A normal single-character card still gets a deterministic draft.
  const solo = analyzePlayability({
    name: "Mara Venn",
    description: "Mara guards the last archive of a drowned city and never lets a stranger past the door.",
    personality: "",
    scenario: "A shuttered station at midnight.",
    first_mes: "Hello.",
    mes_example: "",
  });
  const soloSuggestion = solo.suggestions.find((s) => s.title === "Connect a cause to a visible behavior");
  assert.ok(soloSuggestion?.draft, "single-character card still gets a draft");
  assert.doesNotMatch(soloSuggestion.draft, /[*_`]/, "and it is clean");
});

test("the static server decodes URL-encoded paths", async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/src/app%2Emjs`);
    const body = await res.text();
    assert.equal(res.status, 200, "%2E should decode to '.' and resolve the file");
    assert.match(body, /function/, "served the JavaScript module body");
  } finally {
    server.close();
  }
});
