// Words that signal a creator is stating intent (genre, tone, behaviour, or
// model/content guidance). Matched on word boundaries to avoid substring hits.
const INTENT_WORDS = [
  "genre", "tone", "setting", "mood", "theme", "vibe", "atmosphere",
  "romance", "horror", "mystery", "comedy", "drama", "fantasy", "sci-fi",
  "scifi", "slice of life", "dark", "wholesome", "angst", "slow-burn",
  "personality", "behavior", "behaviour", "responds", "reply", "replies",
  "roleplay", "dynamic", "relationship", "backstory", "lore", "scenario",
  "plays", "acts", "speaks", "voice", "persona", "greeting",
  "nsfw", "sfw", "content warning", "trigger", "model", "preset",
  "temperature", "context", "jailbreak", "system prompt",
];
const INTENT_RE = new RegExp("\\b(" + INTENT_WORDS.join("|") + ")\\b", "i");

// Material that carries no character intent: links, handles, promo platforms,
// filler, and changelog/credit lines. Stripped before measuring what remains.
const JUNK_RE = [
  /https?:\/\/\S+/gi,
  /\b[\w.-]+\.(?:com|net|org|io|gg|me|ai|xyz|co)\b\S*/gi,
  /@[a-z0-9_]+/gi,
  /\b(?:discord|patreon|ko-?fi|twitter|instagram|tiktok|youtube|reddit|subscribe|follow me|dm me|donate|tip jar)\b/gi,
  /\b(?:enjoy|have fun|thanks for downloading|my first card|hope you like|please rate|feedback welcome|credit|credits)\b/gi,
  /\bv?\d+(?:\.\d+)*\s*[:\-]/gi,
  /\b(?:fixed|updated|typo|typos|changelog)\b/gi,
];

export function classifyCreatorNotes(text) {
  if (typeof text !== "string") return { substantive: false, reason: "empty" };
  const raw = text.trim();
  if (!raw) return { substantive: false, reason: "empty" };

  if (INTENT_RE.test(raw)) return { substantive: true, reason: "states intent" };

  let residue = raw;
  for (const re of JUNK_RE) residue = residue.replace(re, " ");
  // \p{L}\p{N} keeps letters/numbers from every script (CJK, Cyrillic, etc.)
  // so non-Latin creator notes are not stripped to nothing.
  const words = residue.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

  // Lean-substance: any real prose beyond a stray word survives the gate.
  if (words.length >= 2) return { substantive: true, reason: "meaningful prose remains" };
  return { substantive: false, reason: "link/handle/boilerplate only" };
}
