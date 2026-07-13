import test from "node:test";
import assert from "node:assert/strict";
import { AI_REVIEW_SCHEMA, buildAiReviewPayload, buildAiReviewRequest, buildChatCompletionReviewRequest, describeReviewerMiss, filterAiSuggestions, isDraftableField, normalizeJsonText, parseAiReviewResponse } from "../src/ai-review.mjs";

test("drops AI drafts that reference unknown deterministic findings", () => {
  const kept = filterAiSuggestions([{ field: "scenario", draft: "A scene", resolvesFindingIds: ["known"], directionUsed: true }, { field: "scenario", draft: "Invented", resolvesFindingIds: ["unknown"], directionUsed: false }], new Set(["known"]));
  assert.deepEqual(kept.map((item) => item.draft), ["A scene"]);
});

test("keeps single-field reviewer drafts when the model omits finding ids", () => {
  const kept = filterAiSuggestions([
    { field: "personality", draft: "Quietly wary, gentle under pressure.", resolvesFindingIds: [], directionUsed: true },
    { field: "scenario", draft: "A different scene.", resolvesFindingIds: [], directionUsed: false },
  ], new Set(["rubric.personality.draft.missing.personality"]), new Set(["personality"]));

  assert.deepEqual(kept.map((item) => item.draft), ["Quietly wary, gentle under pressure."]);
});

const weakCard = JSON.stringify({
  name: "Mara Venn",
  description: "Mara Venn is a retired courier from Leth.",
  personality: "Guarded but generous.",
  scenario: "{{user}} meets Mara Venn at a station.",
  first_mes: "Hi.",
  mes_example: "",
});

test("AI review request includes strict schema and anti-invention instructions", () => {
  const request = buildAiReviewRequest(weakCard);

  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.match(request.instructions, /SillyTavern\/JanitorAI-style character card quality reviewer/);
  assert.match(request.instructions, /stripped card fields/);
  assert.match(request.instructions, /Do not invent canon facts/);
  assert.match(request.instructions, /metadata as dialogue/);
  assert.match(request.instructions, /When Playability evidence identifies a gap, improve one named link only\. Preserve all named facts and unresolved states\. Do not invent canon; mark any necessary new decision as an editable candidate\./);
});

test("AI review payload includes deterministic score context", () => {
  const payload = buildAiReviewPayload(weakCard);

  assert.equal(payload.score.band, "Weak");
  assert.ok(payload.score.findings.length > 0);
  assert.equal(payload.card.fields.name, "Mara Venn");
  assert.equal(payload.card.rawJsonIncluded, false);
});

test("AI review payload includes merged findings and steering", () => {
  const payload = buildAiReviewPayload(weakCard);

  assert.ok(payload.score.findings.every((card) => Array.isArray(card.findings)));
  assert.equal(payload.creatorDirection, "true");
  assert.equal(payload.targetModel, "any");
});

test("AI review payload sends only review-relevant card fields", () => {
  const payload = buildAiReviewPayload(JSON.stringify({
    spec: "chara_card_v2",
    data: {
      name: "Scoped Bot",
      description: "A bot with a narrow payload.",
      personality: "Careful.",
      scenario: "{{user}} tests payload scope.",
      first_mes: "Hello?",
      mes_example: "",
      extensions: { private_blob: "do not send this" },
      irrelevant_dump: "do not send this either",
    },
  }));

  assert.equal(payload.card.fields.name, "Scoped Bot");
  assert.equal(payload.card.fields.extensions, undefined);
  assert.equal(payload.card.fields.irrelevant_dump, undefined);
});

test("AI response parser extracts output_text content", () => {
  const parsed = parseAiReviewResponse({
    output: [{
      content: [{
        type: "output_text",
        text: JSON.stringify({ summary: "ok", warranted: true, suggestions: [] }),
      }],
    }],
  });

  assert.equal(parsed.summary, "ok");
});

test("AI response parser supports OpenAI-compatible chat completion output", () => {
  const parsed = parseAiReviewResponse({
    choices: [{
      message: {
        content: JSON.stringify({ summary: "compatible", warranted: true, suggestions: [] }),
      },
    }],
  });

  assert.equal(parsed.summary, "compatible");
});

test("AI response parser accepts JSON wrapped in a markdown code fence", () => {
  const parsed = parseAiReviewResponse({
    choices: [{
      message: {
        content: "```json\n{\"summary\":\"fenced\",\"warranted\":true,\"suggestions\":[]}\n```",
      },
    }],
  });

  assert.equal(parsed.summary, "fenced");
});

test("AI response parser accepts fenced JSON with text around it", () => {
  const parsed = parseAiReviewResponse({
    choices: [{
      message: {
        content: "Here is the review:\n```json {\"summary\":\"inline fence\",\"warranted\":true,\"suggestions\":[]} ```\nDone.",
      },
    }],
  });

  assert.equal(parsed.summary, "inline fence");
});

test("AI response parser extracts the first JSON object from prose", () => {
  const parsed = parseAiReviewResponse({
    choices: [{
      message: {
        content: "The structured result is {\"summary\":\"object only\",\"warranted\":true,\"suggestions\":[]} Thanks.",
      },
    }],
  });

  assert.equal(parsed.summary, "object only");
});

test("AI response parser normalizes partial provider suggestions", () => {
  const parsed = parseAiReviewResponse({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: "partial",
          warranted: true,
          suggestions: [{
            field: "description",
            title: "Add motive",
            why: "The motive is thin.",
            draft: "Alex wants a clearer goal.",
          }],
        }),
      },
    }],
  });

  assert.deepEqual(parsed.suggestions[0].evidence, []);
  assert.equal(parsed.suggestions[0].confidence, "medium");
});

test("strict schema drops minItems/maxItems for provider compatibility", () => {
  const raw = JSON.stringify(AI_REVIEW_SCHEMA);
  assert.doesNotMatch(raw, /minItems/);
  assert.doesNotMatch(raw, /maxItems/);
});

test("single-field request names the field and pins the valid finding ids", () => {
  const request = buildAiReviewRequest(weakCard, {
    targetField: "personality",
    validFindingIds: ["rubric.personality.thin", "rubric.personality.unanchored"],
  });

  assert.match(request.instructions, /Return exactly one suggestion\. Its field MUST be "personality"\./);
  assert.match(request.instructions, /resolvesFindingIds MUST be a subset/);
  assert.match(request.instructions, /rubric\.personality\.thin/);
  assert.match(request.instructions, /rubric\.personality\.unanchored/);
});

test("single-field request instructs empty ids when none are supplied", () => {
  const request = buildAiReviewRequest(weakCard, { targetField: "scenario", validFindingIds: [] });

  assert.match(request.instructions, /Its field MUST be "scenario"/);
  assert.match(request.instructions, /Leave resolvesFindingIds empty/);
});

test("generic review request omits the single-field instruction", () => {
  const request = buildAiReviewRequest(weakCard);
  assert.doesNotMatch(request.instructions, /Return exactly one suggestion/);
});

test("payload carries the normalized target field and valid finding ids", () => {
  const payload = buildAiReviewPayload(weakCard, {
    targetField: "Personality",
    validFindingIds: ["a", " ", "b"],
  });

  assert.equal(payload.targetField, "personality");
  assert.deepEqual(payload.validFindingIds, ["a", "b"]);
});

test("payload rejects an unknown target field", () => {
  const payload = buildAiReviewPayload(weakCard, { targetField: "not_a_field" });
  assert.equal(payload.targetField, null);
});

test("suggestion normalizer matches the field enum case-insensitively", () => {
  const parsed = parseAiReviewResponse({
    choices: [{
      message: {
        content: JSON.stringify({
          summary: "cased",
          suggestions: [{ field: "Personality", title: "t", why: "w", draft: "Warmer voice." }],
        }),
      },
    }],
  });

  assert.equal(parsed.suggestions.length, 1);
  assert.equal(parsed.suggestions[0].field, "personality");
});

test("describeReviewerMiss reports drafts aimed at other fields", () => {
  const message = describeReviewerMiss([{ field: "description" }, { field: "scenario" }], "personality");
  assert.match(message, /returned 2 drafts, but for description, scenario — not personality/);
});

test("describeReviewerMiss reports an empty reviewer response", () => {
  assert.match(describeReviewerMiss([], "personality"), /did not send a usable draft for personality/);
});

test("describeReviewerMiss reports same-field drafts that were still filtered out", () => {
  const message = describeReviewerMiss([{ field: "personality" }], "personality");
  assert.match(message, /replied but sent no usable draft for personality/);
});

test("review instructions always ask for concise, non-padded drafts", () => {
  assert.match(buildAiReviewRequest(weakCard).instructions, /concise/i);
});

test("a very large target field is told to trim to a core and offload to the lorebook", () => {
  const bloated = JSON.stringify({
    spec: "chara_card_v2",
    data: {
      name: "Lore Bomb",
      description: "Setup. " + "This is permanent reference lore that belongs elsewhere. ".repeat(200),
      personality: "Terse.",
      scenario: "{{user}} arrives.",
      first_mes: "Hi.",
      mes_example: "",
    },
  });

  const request = buildAiReviewRequest(bloated, { targetField: "description", validFindingIds: [] });
  assert.match(request.instructions, /very large/i);
  assert.match(request.instructions, /do not rewrite/i);
  assert.match(request.instructions, /lorebook|character_book/i);
});

test("a normal-sized target field is not told to trim or offload", () => {
  const request = buildAiReviewRequest(weakCard, { targetField: "personality", validFindingIds: [] });
  assert.doesNotMatch(request.instructions, /do not rewrite/i);
});

test("normalizer accepts the alternate key names local models emit", () => {
  const parsed = parseAiReviewResponse({
    choices: [{
      message: {
        content: JSON.stringify({
          suggestions: [{
            targetField: "description",
            findingId: "rubric.description.make.the.character.definition.more.specific",
            title: "Expand description",
            explanation: "The definition is too thin.",
            pasteReadyDraft: "A richer, concrete description of the character.",
          }],
        }),
      },
    }],
  });

  assert.equal(parsed.suggestions.length, 1);
  const suggestion = parsed.suggestions[0];
  assert.equal(suggestion.field, "description");
  assert.equal(suggestion.draft, "A richer, concrete description of the character.");
  assert.equal(suggestion.why, "The definition is too thin.");
  assert.deepEqual(suggestion.resolvesFindingIds, ["rubric.description.make.the.character.definition.more.specific"]);
});

test("parser salvages complete suggestions from truncated fenced output", () => {
  const truncated =
    "```json\n{\n  \"suggestions\": [\n" +
    "    {\"field\":\"description\",\"draft\":\"First complete draft.\",\"resolvesFindingIds\":[\"a\"]},\n" +
    "    {\"field\":\"personality\",\"draft\":\"Second complete draft.\",\"resolvesFindingIds\":[\"b\"]},\n" +
    "    {\"field\":\"scenario\",\"draft\":\"Third draft that gets cut off mid-str";

  const parsed = parseAiReviewResponse({ choices: [{ message: { content: truncated } }] });

  assert.deepEqual(parsed.suggestions.map((s) => s.field), ["description", "personality"]);
  assert.deepEqual(parsed.suggestions.map((s) => s.draft), ["First complete draft.", "Second complete draft."]);
});

test("normalizeJsonText strips an unclosed json code fence", () => {
  assert.equal(
    normalizeJsonText('```json\n{"summary":"x","suggestions":[]}'),
    '{"summary":"x","suggestions":[]}',
  );
});

test("requests raise the output token cap for long drafts", () => {
  assert.equal(buildAiReviewRequest(weakCard).max_output_tokens, 4096);
  assert.equal(buildChatCompletionReviewRequest(weakCard).max_tokens, 4096);
});

test("isDraftableField separates card fields from finding categories", () => {
  assert.equal(isDraftableField("description"), true);
  assert.equal(isDraftableField("personality"), true);
  assert.equal(isDraftableField("token_efficiency"), false);
  assert.equal(isDraftableField("metadata"), false);
});

test("chat completion review request uses json schema response format", () => {
  const request = buildChatCompletionReviewRequest(weakCard);

  assert.equal(request.response_format.type, "json_schema");
  assert.equal(request.response_format.json_schema.strict, true);
  assert.equal(request.messages[0].role, "system");
});

test("junk creator_notes are stripped from the AI payload; intent instruction absent", () => {
  const card = JSON.stringify({ spec: "chara_card_v2", spec_version: "2.0", data: {
    name: "Mara", description: "A retired courier.", personality: "Guarded.",
    scenario: "{{user}} meets Mara.", first_mes: "Hi.", mes_example: "",
    creator_notes: "Follow me @author on discord.gg/x",
  }});
  const payload = buildAiReviewPayload(card);
  assert.equal(payload.card.fields.creator_notes, "");
  assert.doesNotMatch(buildAiReviewRequest(card).instructions, /creator's intent/i);
});

test("substantive creator_notes are kept and elevated to an intent instruction", () => {
  const card = JSON.stringify({ spec: "chara_card_v2", spec_version: "2.0", data: {
    name: "Mara", description: "A retired courier.", personality: "Guarded.",
    scenario: "{{user}} meets Mara.", first_mes: "Hi.", mes_example: "",
    creator_notes: "Dark slow-burn mystery; keep her replies terse.",
  }});
  const payload = buildAiReviewPayload(card);
  assert.match(payload.card.fields.creator_notes, /slow-burn mystery/);
  assert.match(buildAiReviewRequest(card).instructions, /creator's intent/i);
});
