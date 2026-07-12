import test from "node:test";
import assert from "node:assert/strict";
import { scoreCard } from "../src/scorer.mjs";
import { analyzePlayability } from "../src/playability.mjs";

const axis = (result, label) => result.criteria.find((c) => c.label === label);

test("the rubric axes still sum to 100 at their ceilings", () => {
  const result = scoreCard({ name: "Any", description: "x", personality: "", scenario: "", first_mes: "Hi", mes_example: "" });
  const total = result.criteria.reduce((sum, c) => sum + c.max, 0);
  assert.equal(total, 100);
  assert.ok(axis(result, "Character depth"), "has a Character depth axis");
  assert.ok(axis(result, "Voice"), "has a Voice axis");
});

test("a hollow but tidy card scores low on Character depth", () => {
  const hollow = scoreCard({
    name: "Aria",
    description: "Aria is a bright companion. Aria enjoys long talks. Aria brightens any room she enters.",
    personality: "Cheerful. Polite. Curious. Agreeable.",
    scenario: "A cozy cafe on a slow afternoon.",
    first_mes: "*She waves.* \"Hello there! What shall we talk about today?\"",
    mes_example: "<START>\n{{user}}: Hi.\n{{char}}: \"Hi! Lovely to meet you.\"",
  });
  const depth = axis(hollow, "Character depth");
  assert.ok(depth.points < 8, `expected thin depth, got ${depth.points}/16`);
});

test("a card with contradiction, causal grounding, and agency scores high on Character depth", () => {
  const rich = scoreCard({
    name: "Mara Venn",
    description: "After a border raid burned her convoy, Mara refuses shortcuts, so she keeps coded maps hidden beneath the floor.",
    personality: "Warm but guarded. Generous, yet she hates leaving a debt unpaid.",
    scenario: "A shuttered station during a dust storm.",
    first_mes: "*Mara bolts the door. She slides a sealed ledger across the table.* \"Did you hear three taps or four?\"",
    mes_example: "<START>\n{{user}}: Why trust me?\n{{char}}: \"I trust what you carried through the storm, not your face.\"",
  });
  const depth = axis(rich, "Character depth");
  assert.ok(depth.points >= 10, `expected rich depth, got ${depth.points}/16`);
});

test("distributed motivation (no explicit 'because') still earns coherent-motivation credit", () => {
  // The theme "revenge" recurs across description and personality and is never spelled out
  // as a cause->behavior->consequence chain in one passage.
  const play = analyzePlayability({
    name: "Coil",
    description: "Coil trades in revenge favors and files every slight in a black ledger.",
    personality: "Patient about revenge, generous only to those who share her revenge.",
    scenario: "A back-alley office.",
    first_mes: "She counts coins.",
  });
  assert.equal(play.links.length, 0, "no explicit causal chain");
  assert.ok(play.motivationSpread >= 1, `expected distributed theme, got ${play.motivationSpread}`);
});

test("agency detector fires on independent action beats but not on pure scenery", () => {
  const ensemble = analyzePlayability({
    name: "Party",
    description: "",
    personality: "",
    scenario: "",
    first_mes: "Jenna and Emma are dancing near the bar. Barbara keeps checking her phone and shaking her head.",
  });
  assert.ok(ensemble.agencyBeats >= 2, `expected agency beats, got ${ensemble.agencyBeats}`);

  const scenery = analyzePlayability({
    name: "Room",
    description: "",
    personality: "",
    scenario: "",
    first_mes: "The lights have dimmed. Music is playing softly. The room feels warm and quiet.",
  });
  assert.equal(scenery.agencyBeats, 0, "scenery is not agency");
});

test("Voice credits post-history speaking rules, not only example dialogue", () => {
  const base = {
    name: "Iris",
    description: "A courier.",
    personality: "Blunt.",
    scenario: "A road.",
    first_mes: "Hello.",
  };
  const neither = scoreCard({ ...base, mes_example: "", post_history_instructions: "" });
  const rulesOnly = scoreCard({
    ...base,
    mes_example: "",
    post_history_instructions: "Always answer in clipped, dry sentences.\nNever use pet names.\nStay in character; describe one physical action per reply.\nRefer to the user by their role, not their name.",
  });
  const examplesOnly = scoreCard({
    ...base,
    mes_example: "<START>\n{{user}}: Hi.\n{{char}}: \"State your business.\"\n<START>\n{{user}}: Rude.\n{{char}}: \"Accurate.\"",
    post_history_instructions: "",
  });

  assert.equal(axis(neither, "Voice").points, 0, "no voice teaching scores zero");
  assert.ok(axis(rulesOnly, "Voice").points >= 4, `speaking rules should score, got ${axis(rulesOnly, "Voice").points}`);
  assert.ok(axis(examplesOnly, "Voice").points > 0, "examples still score");
});

test("having both examples and speaking rules earns the both-present bonus", () => {
  const base = {
    name: "Iris",
    description: "A courier.",
    personality: "Blunt.",
    scenario: "A road.",
    first_mes: "Hello.",
    mes_example: "<START>\n{{user}}: Hi.\n{{char}}: \"State your business.\"",
  };
  const examplesOnly = scoreCard({ ...base, post_history_instructions: "" });
  const both = scoreCard({
    ...base,
    post_history_instructions: "Always answer in clipped, dry sentences.\nNever use pet names.\nStay in character.",
  });
  assert.ok(axis(both, "Voice").points > axis(examplesOnly, "Voice").points, "both beats one");
});
