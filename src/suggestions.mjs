import {
  cloneJson,
  collectStats,
  findPlaceholder,
  hasActionableHook,
  hasText,
  REQUIRED_V1_FIELDS,
  specificityScore,
  text,
  wordCount,
} from "./card-common.mjs";
import { cardDataTarget } from "./card-format.mjs";

export function applySuggestionToCard(input, suggestion) {
  const parsed = typeof input === "string" ? JSON.parse(input) : cloneJson(input);
  const target = cardDataTarget(parsed);
  const field = suggestion?.field;
  const draft = text(suggestion?.draft || suggestion?.template);

  if (!field || !draft) return parsed;

  if (field === "character_book") {
    const book = ensureCharacterBook(target);
    book.entries.push({
      keys: extractLorebookKeys(draft),
      content: extractLorebookContent(draft),
      enabled: true,
    });
    return parsed;
  }

  if (field === "core_fields") {
    for (const coreField of REQUIRED_V1_FIELDS) {
      if (!hasText(target[coreField])) target[coreField] = "";
    }
    return parsed;
  }

  if (field === "token_efficiency" || field === "cleanup") return parsed;

  const current = text(target[field]);
  target[field] = current ? `${current}\n\n${draft}` : draft;
  return parsed;
}

export function findRecommendedSuggestion(result) {
  return (result?.suggestions ?? []).find((item) => item?.field && (item.draft || item.template)) ?? null;
}

export function buildSuggestions(data, criteria, playability) {
  const byLabel = new Map(criteria.map((item) => [item.label, item]));
  const suggestions = [];
  const missing = REQUIRED_V1_FIELDS.filter((field) => !hasText(data[field]));
  const permanentWords = collectStats(data).permanentWords;
  const examples = text(data.mes_example);
  const greeting = text(data.first_mes);
  const combinedDefinition = [data.description, data.personality, data.scenario].map(text).join("\n");

  for (const field of missing) {
    suggestions.push(suggestion({
      impact: 100,
      field,
      title: `Draft missing ${labelForField(field)}`,
      reason: `The card is missing ${labelForField(field)}, so frontends and models have less reliable context.`,
      options: [
        `Draft a card-specific ${labelForField(field)} from the existing character evidence.`,
        "If this field is intentionally empty, move the missing idea into the closest useful field instead of leaving it blank.",
      ],
    }));
  }

  if (scoreRatio(byLabel.get("Voice")) < 0.5) {
    suggestions.push(suggestion({
      impact: 90,
      field: "mes_example",
      title: "Add 2-3 example dialogues",
      reason: "Example messages teach the model the character's voice, pacing, and boundaries.",
      options: [
        "Write one calm exchange, one conflict exchange, and one emotionally revealing exchange.",
        "Use `<START>`, `{{user}}:`, and `{{char}}:` so SillyTavern-style importers understand the examples.",
      ],
    }));
  }

  if (scoreRatio(byLabel.get("Character substance")) < 0.55 || specificityScore(combinedDefinition) < 0.45) {
    suggestions.push(suggestion({
      impact: 85,
      field: "description",
      title: "Make the character definition more specific",
      reason: "Generic traits make cards blend together and give the model little to roleplay from.",
      options: [
        "Add concrete motives, fears, habits, relationships, and limits.",
        "Include one contradiction, such as warm but evasive, loyal but reckless, or confident but lonely.",
      ],
    }));
  }

  if (wordCount(text(data.scenario)) < 25) {
    suggestions.push(suggestion({
      impact: 78,
      field: "scenario",
      title: "Strengthen the starting scenario",
      reason: "A scenario should explain where the chat starts and why the user matters.",
      options: [
        "State the location, immediate tension, and relationship to `{{user}}`.",
        "Give the scene a problem that can continue for several turns.",
      ],
    }));
  }

  if (!hasActionableHook(greeting) || wordCount(greeting) < 25) {
    suggestions.push(suggestion({
      impact: 74,
      field: "first_mes",
      title: "Give the first message a clear hook",
      reason: "The opening should make it obvious what the user can say or do next.",
      options: [
        "End with a question, choice, request, threat, or discovery.",
        "Mix action narration with dialogue so the first turn establishes both scene and voice.",
      ],
    }));
  }

  if (permanentWords > 850) {
    suggestions.push(suggestion({
      impact: 70,
      field: "token_efficiency",
      title: "Move long background into lorebook entries",
      reason: "Large permanent definitions can crowd out chat history on smaller-context models.",
      options: [
        "Keep only always-needed identity and behavior in description/personality/scenario.",
        "Move locations, factions, history, and rare details into keyed lorebook entries.",
      ],
    }));
  }

  const placeholderHit = ["description", "personality", "scenario"]
    .map((field) => ({ field, match: findPlaceholder(data[field]) }))
    .find((entry) => entry.match);
  if (placeholderHit) {
    suggestions.push(suggestion({
      impact: 95,
      field: "cleanup",
      title: "Remove template leftovers",
      reason: `Placeholder text "${placeholderHit.match}" in ${labelForField(placeholderHit.field)} is a strong low-quality signal and can leak into roleplay.`,
      options: [
        `Find "${placeholderHit.match}" in the ${labelForField(placeholderHit.field)} field.`,
        "Replace it with short, intentional prose or remove the unfinished section.",
      ],
    }));
  }

  if (scoreRatio(byLabel.get("Metadata hygiene")) < 0.45) {
    suggestions.push(suggestion({
      impact: 48,
      field: "metadata",
      title: "Add lightweight creator metadata",
      reason: "Creator notes, tags, and versions make cards easier to search, compare, and maintain.",
      options: [
        "Add 3-6 focused tags instead of a long noisy list.",
        "Use creator notes to explain intended genre, tone, and model assumptions.",
      ],
    }));
  }

  const playabilitySuggestions = (playability?.suggestions ?? []).map((item) => ({
    impact: 84,
    field: item.field,
    title: item.title,
    reason: item.reason,
    options: [],
    draft: item.draft,
    evidence: item.evidence,
  }));

  return suggestions.concat(playabilitySuggestions)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5)
    .map((item, index) => ({ ...item, priority: index + 1 }));
}

function ensureCharacterBook(target) {
  if (!target.character_book || typeof target.character_book !== "object") {
    target.character_book = { entries: [] };
  }
  if (!Array.isArray(target.character_book.entries)) target.character_book.entries = [];
  return target.character_book;
}

function extractLorebookKeys(draft) {
  const match = text(draft).match(/keys:\s*\[([^\]]+)\]/i);
  if (!match) return ["background"];
  return match[1].split(",").map((key) => key.trim()).filter(Boolean);
}

function extractLorebookContent(draft) {
  const match = text(draft).match(/content:\s*([\s\S]+)/i);
  return match ? match[1].trim() : text(draft);
}

function suggestion({ impact, field, title, reason, options, template }) {
  return { impact, field, title, reason, options, template };
}

function labelForField(field) {
  return String(field).replace(/_/g, " ");
}

function scoreRatio(criterionItem) {
  if (!criterionItem || criterionItem.max === 0) return 1;
  return criterionItem.points / criterionItem.max;
}
