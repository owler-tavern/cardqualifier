import test from "node:test";
import assert from "node:assert/strict";
import { applySuggestionToCard, embedCardJsonInPng, extractCardJsonFromPng, extractPngTextChunks, findRecommendedSuggestion, parseCard, scoreCard } from "../src/scorer.mjs";

test("emits auditable rubric findings in the shared Finding shape", () => {
  const result = scoreCard({ name: "Thin", description: "", personality: "", scenario: "Placeholder", first_mes: "Hi", mes_example: "" });
  assert.ok(result.reviewFindings.length > 0);
  assert.ok(result.reviewFindings.every((finding) => ["id", "field", "source", "severity", "summary", "evidence", "estimatedDelta", "fixTemplate"].every((key) => key in finding)));
  assert.ok(result.reviewFindings.some((finding) => finding.source === "rubric" && finding.estimatedDelta > 0));
  assert.ok(!result.reviewFindings.some((finding) => finding.field === "core_fields"));
  assert.ok(result.reviewFindings.some((finding) => finding.field === "personality"));
  assert.ok(result.reviewFindings.some((finding) => finding.field === "mes_example"));
});

test("rejects JSON that is not a card object (array, primitive, or null)", () => {
  for (const bad of ["[1,2,3]", "42", "null", '"a string"', "true"]) {
    assert.throws(() => parseCard(bad), /isn't a character card/, `expected ${bad} to be rejected`);
    assert.throws(() => scoreCard(bad), /isn't a character card/, `expected scoreCard(${bad}) to reject`);
  }
});

test("still accepts a structurally valid (even if empty) card object", () => {
  assert.doesNotThrow(() => parseCard("{}"));
  assert.doesNotThrow(() => parseCard(JSON.stringify({ name: "Ok", description: "A card." })));
});

test("parses Character Card V2 data", () => {
  const card = parseCard(JSON.stringify({
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: { name: "Mara", extensions: {} },
  }));

  assert.equal(card.format, "v2");
  assert.equal(card.data.name, "Mara");
});

test("normalizes common legacy and platform field aliases", () => {
  const card = parseCard(JSON.stringify({
    char_name: "Alias Bot",
    char_persona: "A precise archivist who remembers every treaty.",
    world_scenario: "{{user}} arrives at the archive after midnight.",
    char_greeting: "\"You are late. Which treaty did you lose?\"",
    example_dialogue: "<START>\n{{user}}: Help me.\n{{char}}: \"Only if you stop bleeding on the index.\"",
  }));

  assert.equal(card.format, "legacy-alias");
  assert.equal(card.data.name, "Alias Bot");
  assert.equal(card.data.personality, "A precise archivist who remembers every treaty.");
  assert.equal(card.data.scenario, "{{user}} arrives at the archive after midnight.");
  assert.equal(card.data.first_mes, "\"You are late. Which treaty did you lose?\"");
  assert.equal(card.data.mes_example, "<START>\n{{user}}: Help me.\n{{char}}: \"Only if you stop bleeding on the index.\"");
});

test("stronger cards score higher than sparse cards", () => {
  const sparse = {
    name: "Bot",
    description: "Nice person.",
    personality: "",
    scenario: "",
    first_mes: "Hi.",
    mes_example: "",
  };
  const strong = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Mara Venn",
      description: "Mara Venn is a retired courier from the brass city of Leth, known for memorizing routes through storms and border posts because she refuses to abandon clients.",
      personality: "Warm but guarded, generous but allergic to sentimentality. She jokes when frightened and hates unpaid debts.",
      scenario: "{{user}} meets Mara at a shuttered station while a dust storm traps both of them inside.",
      first_mes: "*Mara lowers the lantern.* \"Answer quickly: did you hear three taps or four?\"",
      mes_example: "<START>\n{{user}}: Why does it matter?\n{{char}}: \"Three means shelter. Four means danger.\"",
      creator_notes: "Tense travel scenes.",
      tags: ["mystery"],
      creator: "test",
      character_version: "1.0",
      extensions: {},
    },
  };

  assert.ok(scoreCard(strong).total > scoreCard(sparse).total);
});

test("placeholder text is reported as a problem", () => {
  const result = scoreCard({
    name: "Template",
    description: "Lorem ipsum placeholder",
    personality: "To be filled",
    scenario: "Unknown",
    first_mes: "Hello?",
    mes_example: "",
  });

  assert.ok(result.findings.some((finding) => finding.title === "Placeholder text detected"));
});

test("returns ranked fix suggestions for weak cards", () => {
  const result = scoreCard({
    name: "Thin Bot",
    description: "Nice person.",
    personality: "",
    scenario: "",
    first_mes: "Hi.",
    mes_example: "",
  });

  assert.ok(result.suggestions.length >= 3);
  assert.equal(result.suggestions[0].priority, 1);
  assert.ok(result.suggestions.some((suggestion) => suggestion.field === "mes_example"));
  assert.ok(result.suggestions.some((suggestion) => suggestion.options.length >= 2));

  const groundedResult = scoreCard({
    name: "Ana De Armas",
    description: "Innocent, pure-hearted, gentle, soft-spoken, shy, compassionate, graceful, curious, trusting, elegant, emotionally-sensitive, kind, fragile-looking, humble, quietly-mysterious\n\nThey want...\nThey fear...\nThey refuse to...\nThey speak like...\nThey know {{user}} because...",
    personality: "",
    scenario: "It's the year 1472. {{user}} enters God's Veil, a forest where travelers vanish beyond the old stone paths. A young woman lives alone in a hidden cottage with her elderly grandmother. She recognizes symbols carved into ruins older than the kingdom itself and predicts storms before clouds appear.",
    first_mes: "Hello.",
    mes_example: "",
  });
  const rubricDrafts = groundedResult.suggestions
    .filter((item) => !item.evidence)
    .map((item) => item.template || item.draft || "")
    .filter(Boolean);
  const playabilityDrafts = groundedResult.suggestions
    .filter((item) => item.evidence)
    .map((item) => item.template || item.draft || "")
    .filter(Boolean);
  const drafts = playabilityDrafts.join("\n");

  assert.deepEqual(rubricDrafts, []);
  assert.ok(playabilityDrafts.length > 0);
  assert.doesNotMatch(drafts, /\[[^\]]+\]|\bThey want\.\.\.|\bThey fear\.\.\.|\bThey refuse to\.\.\.|\[Voice-rich line\]|\[urgent question\]/);
  assert.match(drafts, /God's Veil|old stone paths|hidden cottage/);
});

test("exposes a playability audit without changing the deterministic total", () => {
  const result = scoreCard({
    name: "Mara Venn",
    description: "After a border raid, Mara keeps coded maps hidden, so smugglers cannot trace the village routes.",
    personality: "Warm but guarded; she refuses easy promises because trust must be earned.",
    scenario: "{{user}} meets Mara at a shuttered station while a dust storm closes the road.",
    first_mes: "*Mara lowers the lantern.* \"Did you hear three taps or four?\"",
    mes_example: "<START>\n{{user}}: Why does it matter?\n{{char}}: \"Three means shelter. Four means danger.\"",
    extensions: {},
  });

  assert.ok(result.playability);
  assert.ok(result.playability.links.length > 0);
  assert.equal(result.total, Math.round(result.criteria.reduce((sum, criterion) => sum + criterion.points, 0)));
});

test("ranks a playability repair below placeholder cleanup", () => {
  const result = scoreCard({
    name: "Mara Venn",
    description: "Lorem ipsum describes Mara's old courier routes and the station records she protects.",
    personality: "Warm but guarded, methodical but restless, and loyal to people who keep their word.",
    scenario: "{{user}} arrives at a shuttered station where Mara needs help securing a damaged archive before dawn.",
    first_mes: "*Mara slides a sealed ledger across the table.* \"Will you help me keep this out of the wrong hands?\"",
    mes_example: "<START>\n{{user}}: Why trust me?\n{{char}}: \"I do not. I trust the evidence you brought.\"\n<START>\n{{user}}: What is in the ledger?\n{{char}}: \"A promise someone paid dearly to erase.\"",
    creator_notes: "Station mystery.",
    creator: "test",
    character_version: "1.0",
    tags: ["mystery"],
    extensions: {},
  });
  const cleanup = result.suggestions.find((suggestion) => suggestion.field === "cleanup");
  const playability = result.suggestions.find((suggestion) => suggestion.title === "Connect a cause to a visible behavior");

  assert.ok(cleanup);
  assert.ok(playability);
  assert.ok(cleanup.priority < playability.priority);
});

test("preserves source evidence when playability repairs enter the ranked queue", () => {
  const evidence = "Mara protects old courier routes in the brass city.";
  const result = scoreCard({
    name: "Mara",
    description: `${evidence} She stores coded maps beneath a loose floorboard and watches the station door through a cracked mirror. Her old compass only points toward promises she has not yet kept.`,
    personality: "Warm but guarded, patient but suspicious, and sharply funny when frightened. She values careful witnesses, distrusts easy promises, and never leaves a debt unanswered.",
    scenario: "{{user}} arrives at Mara's shuttered station during a dust storm after the last road has closed. A damaged transit seal gives Mara a reason to decide whether to hide {{user}} or send them back into the storm.",
    first_mes: "*Mara checks the cracked mirror beside the station door, then slides a coded map across the table.* \"That transit seal is damaged. Did you come here for shelter, or did someone send you to find me?\"",
    mes_example: "<START>\n{{user}}: Why should I trust you?\n{{char}}: \"You should not. You should watch what I do when the storm gets worse.\"\n<START>\n{{user}}: What is on the map?\n{{char}}: \"A route that keeps changing because someone wants it forgotten.\"",
    creator_notes: "A tense station mystery.",
    creator: "test",
    character_version: "1.0",
    tags: ["mystery"],
    extensions: {},
  });

  const repair = result.suggestions.find((item) => item.title === "Connect a cause to a visible behavior");
  assert.equal(repair?.evidence, evidence);
});

test("recommends the highest-ranked deterministic repair", () => {
  const result = {
    suggestions: [{ priority: 1, field: "core_fields", title: "Fill the missing core fields", template: "Name:" }],
  };

  assert.equal(findRecommendedSuggestion(result)?.title, "Fill the missing core fields");
});

test("applies a playability field draft without mutating unrelated card data", () => {
  const card = {
    name: "Mara Venn",
    description: "A guarded courier.",
    personality: "Warm but careful.",
    scenario: "A storm closes the road.",
    first_mes: "Hello.",
    mes_example: "",
  };
  const selectedPlayabilitySuggestion = scoreCard({
    name: "Mara Venn",
    description: "Mara protects old courier routes in the brass city.",
    personality: "Warm but guarded, loyal but impatient with careless promises.",
    scenario: "{{user}} meets Mara at a shuttered station during a dangerous dust storm.",
    first_mes: "*Mara checks the locked door.* \"Can you hear anyone outside?\"",
    mes_example: "<START>\n{{user}}: Why trust me?\n{{char}}: \"I trust what you carried through the storm.\"",
    creator_notes: "Station mystery.",
    creator: "test",
    character_version: "1.0",
    tags: ["mystery"],
    extensions: {},
  }).suggestions.find((suggestion) => suggestion.title === "Connect a cause to a visible behavior");

  assert.ok(selectedPlayabilitySuggestion?.draft);

  const updated = applySuggestionToCard(card, selectedPlayabilitySuggestion);
  const field = selectedPlayabilitySuggestion.field;

  assert.equal(updated[field], `${card[field]}\n\n${selectedPlayabilitySuggestion.draft}`);
  assert.equal(card[field], "A guarded courier.");
  assert.deepEqual(Object.fromEntries(Object.entries(updated).filter(([key]) => key !== field)), Object.fromEntries(Object.entries(card).filter(([key]) => key !== field)));
});

test("extracts direct JSON from PNG text chunks", () => {
  const cardJson = JSON.stringify({ name: "Png Bot", description: "Stored directly." });
  const png = makePngWithText("chara", cardJson);

  assert.equal(extractCardJsonFromPng(png), cardJson);
});

test("embeds updated character JSON into an existing PNG card", () => {
  const oldCard = JSON.stringify({ name: "Old Bot", description: "Before." });
  const updatedCard = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Updated Bot",
      description: "After.",
      extensions: {},
    },
  };
  const png = makePngWithText("chara", Buffer.from(oldCard, "utf8").toString("base64"));

  const updatedPng = embedCardJsonInPng(png, updatedCard);
  const extracted = JSON.parse(extractCardJsonFromPng(updatedPng));

  assert.equal(extracted.data.name, "Updated Bot");
  assert.equal(extracted.data.description, "After.");
});

test("adds character JSON to a PNG without existing card metadata", () => {
  const png = makePngWithText("Comment", "plain image note");
  const updatedPng = embedCardJsonInPng(png, { name: "New Bot", description: "Inserted." });
  const extracted = JSON.parse(extractCardJsonFromPng(updatedPng));

  assert.equal(extracted.name, "New Bot");
});

test("prefers the canonical ccv3 chunk over a legacy chara chunk", () => {
  const v2 = JSON.stringify({ spec: "chara_card_v2", spec_version: "2.0", data: { name: "V2 view" } });
  const v3 = JSON.stringify({ spec: "chara_card_v3", spec_version: "3.0", data: { name: "V3 view" } });
  const png = makePngWithChunks([["chara", v2], ["ccv3", v3]]);

  assert.equal(JSON.parse(extractCardJsonFromPng(png)).data.name, "V3 view");
});

test("embedding writes both chara and ccv3 chunks", () => {
  const png = makePngWithText("Comment", "plain image note");
  const out = embedCardJsonInPng(png, { spec: "chara_card_v3", spec_version: "3.0", data: { name: "Dual" } });
  const chunks = extractPngTextChunks(out);

  assert.ok("chara" in chunks, "chara chunk present");
  assert.ok("ccv3" in chunks, "ccv3 chunk present");
  assert.equal(JSON.parse(extractCardJsonFromPng(out)).data.name, "Dual");
});

test("re-embedding a v3 card does not duplicate or drop the ccv3 chunk", () => {
  const png = makePngWithChunks([["chara", "old"], ["ccv3", "old"]]);
  const out = embedCardJsonInPng(png, { spec: "chara_card_v3", spec_version: "3.0", data: { name: "Once" } });
  const chunks = extractPngTextChunks(out);

  assert.ok("ccv3" in chunks);
  // A second embed must not stack extra card chunks.
  const out2 = embedCardJsonInPng(out, { spec: "chara_card_v3", spec_version: "3.0", data: { name: "Twice" } });
  assert.equal(JSON.parse(extractCardJsonFromPng(out2)).data.name, "Twice");
});

test("metadata hygiene rewards substantive creator notes, not junk", () => {
  const base = {
    name: "Mara", description: "A retired courier from Leth who keeps coded maps.",
    personality: "Warm but guarded.", scenario: "{{user}} meets Mara at a station.",
    first_mes: "Hello.", mes_example: "<START>\n{{user}}: hi\n{{char}}: hey",
    tags: ["mystery"],
  };
  const meta = (card) => scoreCard(JSON.stringify({ spec: "chara_card_v2", spec_version: "2.0", data: card }))
    .criteria.find((c) => c.label === "Metadata hygiene").points;

  const substantive = meta({ ...base, creator_notes: "Dark mystery; keep replies short." });
  const junk = meta({ ...base, creator_notes: "Follow me @author on discord.gg/x" });

  assert.equal(substantive - junk, 2); // the creator_notes bonus is gated on substance
});

function makePngWithChunks(pairs) {
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = pairs.map(([keyword, value]) => {
    const data = new TextEncoder().encode(`${keyword}\0${value}`);
    const chunk = new Uint8Array(12 + data.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length);
    chunk.set(new TextEncoder().encode("tEXt"), 4);
    chunk.set(data, 8);
    view.setUint32(8 + data.length, 0);
    return chunk;
  });
  const end = Uint8Array.from([0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0]);
  return concat(signature, ...chunks, end);
}

function makePngWithText(keyword, value) {
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const data = new TextEncoder().encode(`${keyword}\0${value}`);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(new TextEncoder().encode("tEXt"), 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, 0);
  const end = Uint8Array.from([0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0]);
  return concat(signature, chunk, end);
}

function concat(...arrays) {
  const output = new Uint8Array(arrays.reduce((sum, item) => sum + item.length, 0));
  let offset = 0;
  for (const array of arrays) {
    output.set(array, offset);
    offset += array.length;
  }
  return output;
}
