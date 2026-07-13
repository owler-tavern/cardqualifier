// Strong intent signals — unambiguous statements of genre, tone, behaviour, or
// model/content guidance. Any one of these on its own marks the note as the
// creator stating intent (matched on word boundaries to avoid substring hits).
const STRONG_WORDS = [
  "genre", "tone", "setting", "mood", "theme", "atmosphere",
  "romance", "horror", "mystery", "comedy", "drama", "fantasy", "sci-fi",
  "scifi", "slice of life", "wholesome", "angst", "slow-burn",
  "personality", "behavior", "behaviour", "responds", "reply", "replies",
  "roleplay", "backstory", "lore", "scenario",
  "plays", "acts", "speaks", "persona", "greeting",
  "nsfw", "sfw", "content warning", "jailbreak", "system prompt",
  "preset", "temperature",
];
const STRONG_RE = new RegExp("\\b(" + STRONG_WORDS.join("|") + ")\\b", "i");

// Weak signals — words that often accompany intent but are far too common to be
// evidence on their own ("check out my dark stuff"). They neither short-circuit
// nor count toward substance; a note that also carries real prose still passes
// on that prose, but a note whose only signal is a weak word does not.
const WEAK_WORDS = new Set([
  "dark", "context", "model", "voice", "trigger", "dynamic",
  "relationship", "vibe", "content",
]);

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

  if (STRONG_RE.test(raw)) return { substantive: true, reason: "states intent" };

  let residue = raw;
  for (const re of JUNK_RE) residue = residue.replace(re, " ");
  // \p{L}\p{N} keeps letters/numbers from every script (CJK, Cyrillic, etc.)
  // so non-Latin creator notes are not stripped to nothing.
  const words = residue.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const content = words.filter((w) => !WEAK_WORDS.has(w.toLowerCase()));

  // Lean-substance: two or more real words survive the gate. A note whose only
  // signal is a weak word no longer sneaks through as stated intent.
  if (content.length >= 2) return { substantive: true, reason: "meaningful prose remains" };
  return { substantive: false, reason: "link/handle/boilerplate only" };
}
