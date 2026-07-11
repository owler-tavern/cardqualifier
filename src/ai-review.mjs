import { parseCard, scoreCard } from "./scorer.mjs";

export const AI_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: ["description", "personality", "scenario", "first_mes", "mes_example", "alternate_greetings", "character_book", "creator_notes"],
          },
          title: { type: "string" },
          why: { type: "string" },
          draft: { type: "string" },
          evidence: {
            type: "array",
            items: { type: "string" },
          },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          resolvesFindingIds: { type: "array", items: { type: "string" } },
          directionUsed: { type: "boolean" },
        },
        required: ["field", "title", "why", "draft", "evidence", "confidence", "resolvesFindingIds", "directionUsed"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "suggestions"],
  additionalProperties: false,
};

export function buildAiReviewPayload(cardText, options = {}) {
  const parsed = parseCard(cardText);
  const score = scoreCard(cardText);
  return {
    card: {
      format: parsed.format,
      rawJsonIncluded: false,
      fields: reviewFields(parsed.data),
    },
    score: {
      total: score.total,
      band: score.band,
      criteria: score.criteria,
      findings: Array.isArray(options.findings) ? options.findings : score.reviewPlan.improvements.concat(score.reviewPlan.blockers),
    },
    creatorDirection: options.creatorDirection || "true",
    targetModel: options.targetModel || "any",
    mode: options.mode || "review",
    targetField: allowedField(options.targetField) || null,
    validFindingIds: Array.isArray(options.validFindingIds)
      ? options.validFindingIds.map(stringValue).filter(Boolean)
      : null,
  };
}

export function buildAiReviewRequest(cardText, options = {}) {
  const payload = buildAiReviewPayload(cardText, options);
  const instructions = [
    "You are a SillyTavern/JanitorAI-style character card quality reviewer.",
    "Your job is to help a card creator improve roleplay usability, not to judge taste or attractiveness.",
    "You receive stripped card fields plus deterministic scoring evidence; do not ask for or rely on raw JSON, PNG metadata, hidden fields, or external facts.",
    "Return only structured JSON matching the schema so every suggestion can become a clickable edit in the app.",
    "Draft only for the findings supplied. Never introduce new issues.",
    "If creatorDirection is set, steer tone accordingly; evidence-grounding rules still apply.",
    "Ground every suggestion in evidence from the supplied stripped card fields or score findings.",
    "Each suggestion should name the target field, explain the issue plainly, and provide a paste-ready draft for that exact field.",
    "Do not treat markdown headings, creator notes, actor biography labels, age/location labels, or metadata as dialogue.",
    "Do not invent canon facts. If adding a new detail would help, phrase it as a candidate draft that the user can accept or edit.",
    "When Playability evidence identifies a gap, improve one named link only. Preserve all named facts and unresolved states. Do not invent canon; mark any necessary new decision as an editable candidate.",
    "Prefer concrete playable additions: clearer scenario pressure, stronger first-message hook, voice examples, or lorebook entries.",
    "Avoid generic AI prose, purple language, overexplaining, and vague praise.",
    "For mes_example, use SillyTavern style with <START>, {{user}}:, and {{char}}:.",
  ];

  if (payload.targetField) {
    const validIds = Array.isArray(payload.validFindingIds) ? payload.validFindingIds : [];
    instructions.push(
      `This is a single-field request. Return exactly one suggestion. Its field MUST be "${payload.targetField}".`,
      validIds.length
        ? `resolvesFindingIds MUST be a subset of this list and nothing else: ${JSON.stringify(validIds)}.`
        : "Leave resolvesFindingIds empty; no deterministic finding ids were supplied for this field.",
    );
  }

  const instructionText = instructions.join(" ");

  return {
    instructions: instructionText,
    input: JSON.stringify(payload, null, 2),
    text: {
      format: {
        type: "json_schema",
        name: "card_improvement_review",
        strict: true,
        schema: AI_REVIEW_SCHEMA,
      },
    },
    max_output_tokens: 2500,
    store: false,
  };
}

function reviewFields(data) {
  return {
    name: stringValue(data.name),
    description: stringValue(data.description),
    personality: stringValue(data.personality),
    scenario: stringValue(data.scenario),
    first_mes: stringValue(data.first_mes),
    mes_example: stringValue(data.mes_example),
    alternate_greetings: Array.isArray(data.alternate_greetings)
      ? data.alternate_greetings.map(stringValue).filter(Boolean).slice(0, 5)
      : [],
    creator_notes: stringValue(data.creator_notes),
    tags: Array.isArray(data.tags) ? data.tags.map(stringValue).filter(Boolean).slice(0, 12) : [],
    character_book_entries: Array.isArray(data.character_book?.entries)
      ? data.character_book.entries.map(reviewLorebookEntry).filter(Boolean).slice(0, 8)
      : [],
  };
}

function reviewLorebookEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    keys: Array.isArray(entry.keys) ? entry.keys.map(stringValue).filter(Boolean).slice(0, 8) : [],
    content: stringValue(entry.content),
    enabled: entry.enabled !== false,
  };
}

export function buildChatCompletionReviewRequest(cardText, options = {}) {
  const request = buildAiReviewRequest(cardText, options);
  return {
    messages: [
      { role: "system", content: request.instructions },
      { role: "user", content: request.input },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "card_improvement_review",
        strict: true,
        schema: AI_REVIEW_SCHEMA,
      },
    },
    max_tokens: 2500,
    temperature: 0.4,
  };
}

export function extractResponseText(responseJson) {
  if (typeof responseJson?.output_text === "string") return responseJson.output_text;
  const chatText = responseJson?.choices?.[0]?.message?.content;
  if (typeof chatText === "string") return chatText;
  for (const item of responseJson?.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("No text output was returned by the model.");
}

export function parseAiReviewResponse(responseJson) {
  return normalizeAiReview(JSON.parse(normalizeJsonText(extractResponseText(responseJson))));
}

export function normalizeJsonText(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();

  const embeddedFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (embeddedFence) return embeddedFence[1].trim();

  return extractJsonObjectText(trimmed) ?? trimmed;
}

function extractJsonObjectText(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) return text.slice(start, index + 1);
  }

  return null;
}

function normalizeAiReview(review) {
  return {
    summary: typeof review?.summary === "string" ? review.summary : "",
    suggestions: Array.isArray(review?.suggestions)
      ? review.suggestions.map(normalizeSuggestion).filter(Boolean).slice(0, 6)
      : [],
  };
}

function normalizeSuggestion(item) {
  if (!item || typeof item !== "object") return null;
  const field = allowedField(item.field);
  const draft = stringValue(item.draft);
  if (!field || !draft) return null;

  return {
    field,
    title: stringValue(item.title) || "Improve this field",
    why: stringValue(item.why) || "The model suggested this as a useful improvement.",
    draft,
    evidence: Array.isArray(item.evidence) ? item.evidence.map(stringValue).filter(Boolean).slice(0, 4) : [],
    confidence: allowedConfidence(item.confidence),
    resolvesFindingIds: Array.isArray(item.resolvesFindingIds) ? item.resolvesFindingIds.map(stringValue).filter(Boolean) : [],
    directionUsed: Boolean(item.directionUsed),
  };
}

export function filterAiSuggestions(suggestions, knownIds, knownFields = new Set()) {
  return (suggestions ?? []).filter((item) => {
    const ids = item?.resolvesFindingIds ?? [];
    if (ids.length && ids.every((id) => knownIds.has(id))) return true;
    return knownFields.has(item?.field);
  });
}

function allowedField(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return AI_REVIEW_SCHEMA.properties.suggestions.items.properties.field.enum.find((field) => field === normalized) ?? null;
}

export function describeReviewerMiss(suggestions, field) {
  const all = Array.isArray(suggestions) ? suggestions : [];
  if (!all.length) {
    return `The reviewer did not send a usable draft for ${field}. Try again or adjust the model.`;
  }
  const otherFields = [...new Set(all.map((item) => item?.field).filter((value) => value && value !== field))];
  if (otherFields.length) {
    return `The reviewer returned ${all.length} draft${all.length > 1 ? "s" : ""}, but for ${otherFields.join(", ")} — not ${field}. Try again.`;
  }
  return `The reviewer replied but sent no usable draft for ${field}. Try again or adjust the model.`;
}

function allowedConfidence(value) {
  return AI_REVIEW_SCHEMA.properties.suggestions.items.properties.confidence.enum.includes(value) ? value : "medium";
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
