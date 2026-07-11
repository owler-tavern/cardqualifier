import test from "node:test";
import assert from "node:assert/strict";
import { analyzePlayability } from "../src/playability.mjs";

test("finds one grounded causal link in a compact causal card", () => {
  const description = "After the bridge collapse, Mara refuses to take shortcuts, so she keeps a map of every safe route.";
  const result = analyzePlayability({
    name: "Mara",
    description,
    personality: "",
    scenario: "",
    first_mes: "Which route did you take?",
  });

  assert.notEqual(result.band, "thin");
  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].evidence, description);
  assert.match(result.links[0].cause, /After the bridge collapse/);
  assert.match(result.links[0].behavior, /refuses to take shortcuts/);
  assert.match(result.links[0].consequence, /keeps a map/);
});

test("does not turn repeated flat traits into causal links", () => {
  const result = analyzePlayability({
    name: "Mara",
    description: "Mara is kind, kind, kind, patient, patient, patient.",
    personality: "Kind. Patient. Friendly. Kind. Patient. Friendly.",
    scenario: "",
    first_mes: "Hello.",
  });

  assert.equal(result.links.length, 0);
  assert.equal(result.band, "thin");
});

test("ignores headings, biography metadata, and name-only greetings when matching anchors", () => {
  const result = analyzePlayability({
    name: "Alexandra Daddario",
    description: "## Who She Is (2020)\nAlexandra Daddario — 34, Los Angeles-based actress.",
    personality: "",
    scenario: "",
    first_mes: "Are you the Los Angeles-based actress from 2020?",
  });

  assert.deepEqual(result.greetingCoverage.matchedAnchors, []);
  assert.deepEqual(result.greetingCoverage.unusedAnchors, []);
});

test("retains causal analysis for biography-style text that contains a year or profession", () => {
  const description = "After the 2020 premiere, actress Mara refuses interviews, so she keeps her public life private.";
  const result = analyzePlayability({
    name: "Mara",
    description,
    personality: "",
    scenario: "",
    first_mes: "Why avoid interviews?",
  });

  assert.equal(result.links.length, 1);
  assert.equal(result.links[0].evidence, description);
});

test("does not match greeting anchors through character placeholders", () => {
  const result = analyzePlayability({
    name: "Mara",
    description: "{{char}} helps {{user}} at the archive.",
    personality: "",
    scenario: "",
    first_mes: "{{char}}, hello there {{user}}.",
  });

  assert.deepEqual(result.greetingCoverage.matchedAnchors, []);
});

test("does not treat ordinary greeting words as greeting anchors", () => {
  const result = analyzePlayability({
    name: "Mara",
    description: "Mara says hello there every morning.",
    personality: "",
    scenario: "",
    first_mes: "Hello there!",
  });

  assert.deepEqual(result.greetingCoverage.matchedAnchors, []);
});

test("matches a greeting to an uncommon two-word source anchor", () => {
  const description = "Mara keeps a brass astrolabe beside the archive door.";
  const result = analyzePlayability({
    name: "Mara",
    description,
    personality: "",
    scenario: "",
    first_mes: "Is the brass astrolabe still here?",
  });

  assert.deepEqual(result.greetingCoverage.matchedAnchors, [description]);
});

test("attaches exact non-empty source evidence to every finding", () => {
  const description = "Mara is kind, kind, kind, patient, patient, patient.";
  const result = analyzePlayability({
    name: "Mara",
    description,
    personality: "Kind. Patient.",
    scenario: "",
    first_mes: "Hello.",
  });

  assert.ok(result.findings.length > 0);
  assert.ok(result.findings.every((finding) => finding.evidence && description.includes(finding.evidence)));
});

test("excludes disabled lore entries from every playability audit source", () => {
  const disabledLore = "After the vault fire, Mara refuses shortcuts, so she keeps the brass astrolabe hidden.";
  const result = analyzePlayability({
    name: "Mara",
    description: "Mara is a careful archivist.",
    first_mes: "Is the brass astrolabe still hidden?",
    character_book: { entries: [{ content: disabledLore, enabled: false }] },
  });

  assert.equal(result.links.length, 0);
  assert.ok(!result.greetingCoverage.matchedAnchors.includes(disabledLore));
  assert.ok(!result.greetingCoverage.unusedAnchors.includes(disabledLore));
});

test("grounds a generic greeting in several strong unused lore anchors", () => {
  const loreAnchors = [
    "The brass astrolabe opens the archive's sealed lower stacks.",
    "Only a courier bearing a red wax transit seal may enter after midnight.",
  ];
  const result = analyzePlayability({
    name: "Mara",
    description: "Mara keeps the archive after dark.",
    first_mes: "Hello. How can I help you?",
    character_book: { entries: loreAnchors.map((content) => ({ content, enabled: true })) },
  });

  const finding = result.findings.find((item) => item.type === "greeting-grounding");
  const suggestion = result.suggestions.find((item) => item.title === "Ground the first message in card evidence");

  assert.ok(finding);
  assert.deepEqual(new Set(finding.evidence), new Set(loreAnchors));
  assert.ok(suggestion?.draft.includes(finding.evidence[0]));
  assert.deepEqual(new Set(suggestion.evidence), new Set(loreAnchors));
});

test("does not demand lore grounding from an intentionally minimal card", () => {
  const result = analyzePlayability({
    name: "Mara",
    description: "A quiet archivist.",
    first_mes: "Hello.",
  });

  assert.ok(!result.findings.some((item) => item.type === "greeting-grounding"));
});
