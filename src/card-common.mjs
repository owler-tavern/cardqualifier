export const REQUIRED_V1_FIELDS = ["name", "description", "personality", "scenario", "first_mes", "mes_example"];
export const PLACEHOLDER_PATTERNS = [
  /\blorem ipsum\b/i,
  /\bto be (filled|added|written)\b/i,
  /\bplaceholder\b/i,
  /\bunknown\b/i,
  /\bn\/a\b/i,
];

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function collectStats(data) {
  const permanent = [data.name, data.description, data.personality, data.scenario].map(text).join("\n");
  return {
    permanentWords: wordCount(permanent),
    greetingWords: wordCount(data.first_mes),
    exampleWords: wordCount(data.mes_example),
    tags: Array.isArray(data.tags) ? data.tags.length : 0,
    lorebookEntries: Array.isArray(data.character_book?.entries) ? data.character_book.entries.length : 0,
  };
}

export function specificityScore(value) {
  const content = text(value);
  if (!content) return 0;

  const signals = [
    /\b(because|therefore|secretly|refuses|fears|wants|needs|believes|remembers|hates|loves)\b/i,
    /\b(friend|rival|mentor|family|captain|guild|school|city|village|kingdom|station|company)\b/i,
    /\b(always|never|only when|unless|except|cannot|must)\b/i,
    /\b\d+\b/,
    /[,;:]/,
  ];

  const signalHits = signals.filter((pattern) => pattern.test(content)).length;
  const properNouns = (content.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).length;
  return clamp((signalHits + Math.min(properNouns, 6) / 2) / 8, 0, 1);
}

export function hasContrastingTraits(value) {
  return /\b(but|however|although|despite|yet)\b/i.test(text(value));
}

export function hasActionableHook(value) {
  return /[?]|\b(what do you|how do you|will you|can you|choose|decide|answer|help|tell me)\b/i.test(text(value));
}

export function containsPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text(value)));
}

export function repetitionRatio(value) {
  const words = text(value).toLowerCase().match(/[a-z0-9']+/g) ?? [];
  if (words.length < 30) return 0;
  const counts = new Map();
  for (const word of words) {
    if (word.length < 4) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const repeated = [...counts.values()].filter((count) => count >= 4).reduce((sum, count) => sum + count, 0);
  return repeated / words.length;
}

export function firstPresent(source, keys) {
  if (!source || typeof source !== "object") return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}
