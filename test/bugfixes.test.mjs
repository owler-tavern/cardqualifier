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

test("token_efficiency is advisory, not a dead actionable card", () => {
  // Permanent context (description+personality+scenario) over ~850 words triggers the
  // token_efficiency note. It advises a structural lorebook restructure the single-field
  // apply model can't express, so it must surface as advice-only — never as an improvement
  // card that promises leverage but offers no draft, Apply, or reviewer button.
  // A strong card with heavy permanent context: token_efficiency (impact 70) only survives
  // the top-5 suggestion slice when few higher-impact issues exist, which is exactly when a
  // polished card trips the word threshold.
  const backstory = "Mara Venn is a retired courier from the brass city of Leth. Because she memorized every storm route through the border posts, she keeps coded maps sewn inside her cuffs and refuses to abandon a client mid-run. She is warm but guarded, generous but allergic to sentimentality, and she jokes when she is frightened. ";
  const result = scoreCard({
    name: "Mara Venn",
    description: backstory.repeat(15) + " She distrusts the harbor guild but protects the couriers who work under her.",
    personality: "Warm but guarded, loyal but reckless. She fears owing debts, so she pays them fast, which makes her blunt.",
    scenario: "{{user}} meets Mara at a shuttered station while a dust storm traps them both inside. Someone outside knocks in a pattern she recognizes, and she must decide whether to trust {{user}} before answering it.",
    first_mes: "*Mara lowers the lantern and watches the door.* \"If you are here because of that knocking, answer quickly: did you hear three taps or four? Three means shelter. Four means we are already too late, {{user}}.\"",
    mes_example: "<START>\n{{user}}: Why does the tapping matter?\n{{char}}: \"Three means shelter. Four means danger.\"",
    tags: ["mystery", "courier", "mentor"],
    creator_notes: "Tense travel mystery.",
  });
  const finding = result.reviewFindings.find((f) => f.field === "token_efficiency");
  assert.ok(finding, "the token_efficiency note fires on heavy permanent context");
  assert.equal(finding.severity, "advisory", "it must be advisory, not improvement");
  assert.equal(finding.estimatedDelta, 0, "advisories are never counted toward leverage");
  assert.ok(
    !result.reviewPlan.improvements.some((c) => c.field === "token_efficiency"),
    "it must not appear as an actionable improvement card",
  );
  assert.ok(
    result.reviewPlan.advisories.some((f) => f.field === "token_efficiency"),
    "it belongs in the advice-only advisories list",
  );
});

test("scoreCard exposes the card name for card-specific headline and export filename", () => {
  assert.equal(scoreCard({ name: "Hollywood Gala Afterparty", description: "x" }).name, "Hollywood Gala Afterparty");
  assert.equal(scoreCard({ description: "no name here" }).name, "");
});
