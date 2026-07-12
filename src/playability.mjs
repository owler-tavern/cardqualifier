const TEXT_FIELDS = ["description", "personality", "scenario", "first_mes"];
const BEHAVIOR = /\b(refuses(?:\s+to)?[^,.;]*|keeps?[^,.;]*|avoids?[^,.;]*|jokes?[^,.;]*|helps?[^,.;]*)/i;
const CAUSE = /\b(because|after|due to)\s+([^,.;]*)/i;
const CONSEQUENCE = /\b(so|which makes|fears?|regrets?)\s+([^.;]*)/i;
const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "but", "by", "evening", "every", "for", "from", "has", "he", "hello", "her", "here", "hey", "hi", "him", "in", "is", "it", "its", "just", "more", "morning", "of", "ok", "okay", "on", "or", "please", "really", "says", "she", "some", "thank", "thanks", "that", "the", "their", "there", "they", "this", "to", "very", "was", "welcome", "well", "were", "with", "yeah", "yes", "you"]);

export function analyzePlayability(data = {}) {
  const sources = collectSources(data);
  const links = findLinks(sources);
  const tensions = findTensions(sources);
  const greetingCoverage = findGreetingCoverage(sources, data.name, data.first_mes);
  const evidence = sources[0]?.text || "";
  const draftEvidence = selectDraftEvidence(sources) || evidence;
  const findings = [];
  const suggestions = [];

  if (!links.length && evidence) {
    findings.push({
      type: "missing-link",
      title: "No grounded causal link",
      detail: "The card does not yet connect a cause, behavior, and consequence in one local passage.",
      evidence,
    });
    suggestions.push({
      field: "description",
      title: "Connect a cause to a visible behavior",
      reason: "A local cause-behavior-consequence chain gives roleplay a stable reason for what the character does.",
      draft: causalDraft(data, draftEvidence),
      evidence,
    });
  }

  if (!tensions.length && evidence) {
    findings.push({
      type: "missing-tension",
      title: "No explicit tension",
      detail: "The card does not state a contrast or conflict that can create pressure in play.",
      evidence,
    });
  }

  const groundingEvidence = shouldGroundGreeting(greetingCoverage, data.first_mes);
  if (groundingEvidence.length) {
    findings.push({
      type: "greeting-grounding",
      title: "Greeting is disconnected from strong card evidence",
      detail: "The opening does not use the card's strongest available details, so it could belong to almost any character.",
      evidence: groundingEvidence,
    });
    suggestions.push({
      field: "first_mes",
      title: "Ground the first message in card evidence",
      reason: "Opening from a concrete card detail gives the user an immediate, character-specific situation to answer.",
      draft: greetingDraft(data, groundingEvidence[0]),
      evidence: groundingEvidence,
    });
  }

  const agencyBeats = countAgencyBeats(data);
  const motivationSpread = countMotivationSpread(data);
  const traitShown = traitDemonstrated(data);

  const signalCount = links.length + tensions.length + greetingCoverage.matchedAnchors.length;
  return {
    band: signalCount >= 3 ? "strong" : signalCount ? "developing" : "thin",
    links,
    tensions,
    greetingCoverage,
    agencyBeats,
    motivationSpread,
    traitShown,
    findings,
    suggestions,
  };
}

// Independent action beats: an animate third-person subject doing something, not
// pointed at {{user}}. Requiring an animate subject naturally excludes pure scenery
// ("the lights dimmed", "music is playing") while catching "Jenna and Emma are dancing".
const ACTION_VERB = /\b(walk|talk|danc|sip|drink|text|shak|tap|laugh|smil|glanc|wander|argu|whisper|lean|check|read|scroll|roll|watch|nurse|scan|type|pour|slide|lock|raise|cross|mutter|pace|flirt|tease|giggle|sway|stumble|chat|sit|stand|move|turn|reach|grab|kiss|hug|wave|nod)\w*/i;

function countAgencyBeats(data) {
  const beats = new Set();
  for (const field of ["first_mes", "scenario", "description"]) {
    for (const sentence of sentencesOf(data[field])) {
      if (/\{\{user\}\}|\byou\b|\byour\b/i.test(sentence)) continue;
      // Drop the first token so a sentence-initial capital ("The", "Music") is not mistaken
      // for a proper-noun subject; a real named subject recurs or a pronoun is present.
      const rest = sentence.replace(/^\s*\S+\s*/, "");
      const hasSubject = /\b(she|he|they|her|him)\b/i.test(sentence) || /\b[A-Z][a-z]{2,}\b/.test(rest);
      if (!hasSubject) continue;
      const hasAction = ACTION_VERB.test(sentence) || /\b[a-z]+ing\b/.test(sentence) || /\b(she|he|they)\s+[a-z]+s\b/i.test(sentence);
      if (hasAction) beats.add(sentence.toLowerCase());
    }
  }
  return beats.size;
}

// Distributed reinforcement: a motivation/theme word that recurs across at least two of
// the definition fields (description, personality, scenario). Rewards the "scatter clues
// across fields" method instead of a spelled-out chain in one passage.
function countMotivationSpread(data) {
  const perField = ["description", "personality", "scenario"].map((field) => new Set(meaningfulWords(data[field], data.name)));
  const counts = new Map();
  for (const words of perField) {
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.values()].filter((n) => n >= 2).length;
}

// A stated personality trait that is actually shown in behavior (greeting or examples),
// not merely asserted.
function traitDemonstrated(data) {
  const traits = new Set(meaningfulWords(data.personality, data.name));
  if (!traits.size) return false;
  const shown = meaningfulWords(`${cleanText(data.first_mes)}\n${cleanText(data.mes_example)}`, data.name);
  return shown.some((word) => traits.has(word));
}

function sentencesOf(value) {
  const out = [];
  if (typeof value !== "string") return out;
  for (const line of value.split(/\r?\n/)) {
    for (const sentence of line.trim().match(/[^.!?]+[.!?]?/g) ?? []) {
      const trimmed = sentence.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

function causalDraft(data, evidence) {
  const name = cleanText(data.name) || "{{char}}";
  const anchor = cleanText(evidence).replace(/\.$/, "");
  const cause = cleanLeadingConjunction(anchor);
  const behavior = visibleBehavior(anchor);
  return `Because ${cause ? cause.charAt(0).toLowerCase() + cause.slice(1) : "the card gives them a specific history"}, ${name} ${behavior}, so {{user}} has something concrete to notice, question, or challenge in the scene.`;
}

function greetingDraft(data, evidence) {
  const name = cleanText(data.name) || "{{char}}";
  const anchor = cleanText(evidence);
  return `*${anchor} ${name} ${visibleBehavior(anchor)}.* "Tell me what you saw before you came here, {{user}}. If you missed the wrong sign, we may already be too late."`;
}

function visibleBehavior(evidence) {
  const lower = evidence.toLowerCase();
  if (/\b(forest|path|cottage|ruins|kingdom|storm|clouds?)\b/.test(lower)) {
    return "keeps glancing toward the old paths before answering";
  }
  if (/\b(station|road|map|ledger|archive|seal|route)\b/.test(lower)) {
    return "checks the door and covers the nearest record before speaking";
  }
  if (/\b(secret|hidden|vanish|danger|fear|protect)\b/.test(lower)) {
    return "lowers their voice and watches whether {{user}} noticed the same danger";
  }
  return "pauses before answering and studies whether {{user}} noticed the detail that matters";
}

function selectDraftEvidence(sources) {
  return sources
    .filter(({ text }) => !isMetadata(text))
    .map((source) => ({ ...source, score: evidenceScore(source) }))
    .sort((left, right) => right.score - left.score)[0]?.text || sources[0]?.text || "";
}

function evidenceScore({ text, field }) {
  const words = meaningfulWords(text);
  let score = Math.min(words.length, 12);
  if (field === "scenario") score += 8;
  if (/\b(forest|city|village|kingdom|station|cottage|woods|road|castle|school|ship|bar|archive|ruins|storm|map|ledger)\b/i.test(text)) score += 8;
  if (/\b(secret|vanish|danger|fear|protect|recognize|predict|hidden)\b/i.test(text)) score += 4;
  return score;
}

function cleanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function cleanLeadingConjunction(value) {
  return String(value).replace(/^(?:and|but|so)\s+/i, "");
}

function collectSources(data) {
  const sources = [];
  for (const field of TEXT_FIELDS) addSentences(sources, data[field], field);
  for (const entry of data.character_book?.entries ?? []) {
    if (entry?.enabled === false) continue;
    addSentences(sources, entry?.content, "character_book");
  }
  return sources;
}

function addSentences(target, value, field) {
  if (typeof value !== "string") return;
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const sentence of trimmed.match(/[^.!?]+[.!?]?/g) ?? []) {
      const text = sentence.trim();
      if (text) target.push({ text, field });
    }
  }
}

function findLinks(sources) {
  const seen = new Set();
  const links = [];
  for (const { text } of sources) {
    const cause = text.match(CAUSE);
    const behavior = text.match(BEHAVIOR);
    const consequence = text.match(CONSEQUENCE);
    if (!cause || !behavior || !consequence) continue;
    const link = {
      cause: `${cause[1]} ${cause[2]}`.trim(),
      behavior: behavior[1].trim(),
      consequence: `${consequence[1]} ${consequence[2]}`.trim(),
      evidence: text,
    };
    const key = `${link.cause.toLowerCase()}|${link.behavior.toLowerCase()}|${link.consequence.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      links.push(link);
    }
  }
  return links;
}

function findTensions(sources) {
  const seen = new Set();
  return sources.flatMap(({ text }) => {
    if (!/\b(but|however|although|yet)\b/i.test(text) || seen.has(text.toLowerCase())) return [];
    seen.add(text.toLowerCase());
    return [{ statement: text, evidence: text }];
  });
}

function findGreetingCoverage(sources, name, greeting) {
  const anchors = sources.filter(({ text, field }) => field !== "first_mes" && isAnchor(text, name));
  const greetingWords = meaningfulWords(greeting, name);
  const matchedAnchors = anchors.filter(({ text }) => overlap(meaningfulWords(text, name), greetingWords) >= 2).map(({ text }) => text);
  const matched = new Set(matchedAnchors);
  return { matchedAnchors, unusedAnchors: anchors.map(({ text }) => text).filter((text) => !matched.has(text)) };
}

function shouldGroundGreeting(greetingCoverage, greeting) {
  const unusedAnchors = greetingCoverage.unusedAnchors;
  const greetingWords = meaningfulWords(greeting);
  const isGenericOrDisconnected = greetingWords.length < 2 || greetingCoverage.matchedAnchors.length === 0;
  return isGenericOrDisconnected && unusedAnchors.length >= 2
    ? [...unusedAnchors].sort((left, right) => meaningfulWords(right).length - meaningfulWords(left).length).slice(0, 2)
    : [];
}

function isAnchor(text, name) {
  return !isMetadata(text) && meaningfulWords(text, name).length >= 2;
}

function meaningfulWords(value, name) {
  const nameWords = new Set(String(name ?? "").toLowerCase().match(/[a-z0-9']+/g) ?? []);
  const withoutPlaceholders = String(value ?? "").replace(/\{\{[^}]+\}\}/g, " ");
  return [...new Set((withoutPlaceholders.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((word) => word.length >= 4 && !STOP_WORDS.has(word) && !nameWords.has(word)))];
}

function overlap(left, right) {
  const rightSet = new Set(right);
  return left.filter((word) => rightSet.has(word)).length;
}

function isMetadata(text) {
  return /^#{1,6}\s+/.test(text)
    || /\b\d{4}\b/.test(text)
    || /\b\d{1,3}\s*,\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*-based\b/.test(text)
    || /\b(actor|actress|model|celebrity|influencer|singer)\b/i.test(text);
}
