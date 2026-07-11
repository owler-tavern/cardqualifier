import { analyzePlayability } from "./playability.mjs";
import { analyzeStyle } from "./style-checks.mjs";
import { mergeFindings } from "./merge-findings.mjs";
import { normalizeObject, parseCard } from "./card-format.mjs";
import { buildSuggestions } from "./suggestions.mjs";
import {
  clamp,
  collectStats,
  containsPlaceholder,
  hasActionableHook,
  hasContrastingTraits,
  hasText,
  repetitionRatio,
  REQUIRED_V1_FIELDS,
  specificityScore,
  text,
  wordCount,
} from "./card-common.mjs";

export function scoreCard(input) {
  const card = typeof input === "string" ? parseCard(input) : normalizeObject(input);
  const data = card.data ?? {};
  const playability = analyzePlayability(data);
  const styleFindings = analyzeStyle(data);
  const findings = [];
  const criteria = [
    scoreStructure(card, data, findings),
    scoreSubstance(data, findings),
    scoreGreeting(data, findings),
    scoreExamples(data, findings),
    scoreEfficiency(data, findings),
    scoreMetadata(data, findings),
    scoreLorebook(data, findings),
  ];

  const total = Math.round(criteria.reduce((sum, item) => sum + item.points, 0));
  findings.unshift({
    type: total >= 85 ? "good" : total >= 70 ? "info" : total >= 50 ? "warning" : "problem",
    title: bandForScore(total),
    detail: summaryForScore(total),
  });

  const suggestions = buildSuggestions(data, criteria, playability);
  const reviewFindings = suggestions.map((item) => ({
    id: `rubric.${item.field}.${slug(item.title)}`,
    field: item.field,
    source: item.evidence ? "playability" : "rubric",
    severity: item.impact >= 85 ? "blocker" : "improvement",
    summary: item.reason,
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
    estimatedDelta: item.evidence ? 0 : Math.round(item.impact / 10),
    fixTemplate: item.template || item.draft || null,
  })).concat(styleFindings);

  return {
    total,
    band: bandForScore(total),
    summary: summaryForScore(total),
    format: card.format,
    criteria,
    findings,
    suggestions,
    reviewFindings,
    reviewPlan: mergeFindings(reviewFindings),
    playability,
    stats: collectStats(data),
  };
}

function scoreStructure(card, data, findings) {
  let points = 0;
  const missing = REQUIRED_V1_FIELDS.filter((field) => !hasText(data[field]));

  points += Math.max(0, 9 - missing.length * 1.5);
  if (card.format === "v2" && card.raw.spec_version === "2.0") points += 4;
  if (card.format === "v2" && card.raw.data && typeof card.raw.data.extensions === "object") points += 2;

  if (missing.length) {
    findings.push({
      type: "problem",
      title: "Missing core fields",
      detail: `Add useful content for: ${missing.join(", ")}.`,
    });
  }

  return criterion("Structure and compatibility", 15, points, "Required fields, V2 compliance, and import safety.");
}

function scoreSubstance(data, findings) {
  const description = text(data.description);
  const personality = text(data.personality);
  const scenario = text(data.scenario);
  const combined = `${description}\n${personality}\n${scenario}`;
  let points = 0;

  points += clamp(wordCount(description) / 90, 0, 1) * 7;
  points += clamp(wordCount(personality) / 45, 0, 1) * 5;
  points += clamp(wordCount(scenario) / 35, 0, 1) * 4;
  points += specificityScore(combined) * 6;
  points += hasContrastingTraits(personality) ? 3 : 0;

  if (specificityScore(combined) < 0.45) {
    findings.push({
      type: "warning",
      title: "Character definition feels generic",
      detail: "Add concrete relationships, motives, boundaries, habits, fears, and setting details.",
    });
  }

  if (containsPlaceholder(combined)) {
    points -= 5;
    findings.push({
      type: "problem",
      title: "Placeholder text detected",
      detail: "Remove template leftovers before publishing the card.",
    });
  }

  return criterion("Character substance", 25, points, "Identity, personality depth, scenario clarity, and specificity.");
}

function scoreGreeting(data, findings) {
  const greeting = text(data.first_mes);
  let points = 0;

  points += clamp(wordCount(greeting) / 80, 0, 1) * 5;
  points += /\{\{user\}\}|you\b/i.test(greeting) ? 3 : 0;
  points += /["“”]/.test(greeting) ? 2 : 0;
  points += /\*[^*]+\*/.test(greeting) ? 2 : 0;
  points += hasActionableHook(greeting) ? 3 : 0;

  const alternates = Array.isArray(data.alternate_greetings) ? data.alternate_greetings.filter(hasText) : [];
  if (alternates.length > 0) points += 1;

  if (!hasActionableHook(greeting)) {
    findings.push({
      type: "warning",
      title: "Greeting needs a stronger opening situation",
      detail: "A good first message gives the user something clear to respond to.",
    });
  }

  return criterion("Opening message", 15, points, "First message quality, voice, scene-setting, and user hook.");
}

function scoreExamples(data, findings) {
  const examples = text(data.mes_example);
  let points = 0;
  const starts = (examples.match(/<START>/gi) ?? []).length;
  const charLines = (examples.match(/\{\{char\}\}\s*:/gi) ?? []).length;
  const userLines = (examples.match(/\{\{user\}\}\s*:/gi) ?? []).length;

  points += clamp(wordCount(examples) / 160, 0, 1) * 5;
  points += Math.min(starts, 3) * 1.5;
  points += Math.min(charLines, 4) * 1;
  points += Math.min(userLines, 4) * 0.75;
  points += examples.includes("{{char}}") && examples.includes("{{user}}") ? 2 : 0;

  if (wordCount(examples) < 40) {
    findings.push({
      type: "warning",
      title: "Few or no dialogue examples",
      detail: "Examples are one of the best ways to teach the model the character's voice.",
    });
  }

  return criterion("Dialogue examples", 15, points, "Example-message coverage and format.");
}

function scoreEfficiency(data, findings) {
  const permanent = [data.name, data.description, data.personality, data.scenario].map(text).join("\n");
  const words = wordCount(permanent);
  let points = 10;

  if (words < 60) points -= 4;
  if (words > 850) points -= 3;
  if (words > 1300) points -= 4;
  if (repetitionRatio(permanent) > 0.18) points -= 3;

  if (words > 850) {
    findings.push({
      type: "warning",
      title: "Permanent context may be heavy",
      detail: "Long permanent definitions can reduce room for chat history on smaller-context models.",
    });
  }

  return criterion("Token efficiency", 10, points, "Useful detail without excessive permanent prompt weight.");
}

function scoreMetadata(data, findings) {
  let points = 0;
  const tags = Array.isArray(data.tags) ? data.tags.filter(hasText) : [];

  points += hasText(data.creator_notes) ? 2 : 0;
  points += hasText(data.creator) ? 1.5 : 0;
  points += hasText(data.character_version) ? 1 : 0;
  points += tags.length > 0 ? 2 : 0;
  points += tags.length > 12 ? -1 : 0;
  points += hasText(data.system_prompt) && data.system_prompt.includes("{{original}}") ? 1.5 : 0;
  points += hasText(data.post_history_instructions) && data.post_history_instructions.includes("{{original}}") ? 1 : 0;
  points += data.extensions && typeof data.extensions === "object" ? 1 : 0;

  if (tags.length > 12) {
    findings.push({
      type: "warning",
      title: "Tag list is noisy",
      detail: "Keep tags focused so search and filtering remain useful.",
    });
  }

  return criterion("Metadata hygiene", 10, points, "Creator notes, tags, versioning, and prompt override safety.");
}

function scoreLorebook(data, findings) {
  const book = data.character_book;
  if (!book || !Array.isArray(book.entries) || book.entries.length === 0) {
    return criterion("Lorebook support", 10, 3, "Optional character book structure and entry quality.");
  }

  const enabled = book.entries.filter((entry) => entry.enabled !== false);
  const withKeys = enabled.filter((entry) => Array.isArray(entry.keys) && entry.keys.some(hasText));
  const withContent = enabled.filter((entry) => hasText(entry.content));
  let points = 4;
  points += clamp(enabled.length / 6, 0, 1) * 2;
  points += enabled.length ? (withKeys.length / enabled.length) * 2 : 0;
  points += enabled.length ? (withContent.length / enabled.length) * 2 : 0;

  if (withKeys.length < enabled.length) {
    findings.push({
      type: "warning",
      title: "Lorebook entries need keys",
      detail: "Entries without trigger keys are hard for frontends to insert predictably.",
    });
  }

  return criterion("Lorebook support", 10, points, "Optional character book structure and entry quality.");
}

function criterion(label, max, points, note) {
  const rounded = Math.max(0, Math.min(max, Number(points.toFixed(1))));
  return { label, max, points: rounded, note };
}

function bandForScore(score) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Mixed";
  return "Weak";
}

function summaryForScore(score) {
  if (score >= 85) return "Strong card: coherent, specific, and ready for regular use.";
  if (score >= 70) return "Solid card: usable now, with a few clear improvement areas.";
  if (score >= 50) return "Uneven card: likely usable, but missing important roleplay support.";
  return "Low-quality card: core structure or character-writing pieces need work.";
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
}
