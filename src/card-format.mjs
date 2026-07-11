import { firstPresent, hasText, REQUIRED_V1_FIELDS } from "./card-common.mjs";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CARD_TEXT_CHUNK_KEYS = new Set(["chara", "Chara", "character", "Character", "ccv3", "ccv2", "card"]);
// SillyTavern writes both a legacy `chara` (V2) chunk and a canonical `ccv3`
// (V3 superset) chunk. Prefer ccv3 when present so we review the richer card.
const CARD_READ_PRIORITY = ["ccv3", "chara", "Chara", "character", "Character", "ccv2", "card"];
const FIELD_ALIASES = {
  name: ["name", "char_name", "character_name", "title"],
  description: ["description", "char_description", "char_desc", "description_text"],
  personality: ["personality", "char_persona", "persona", "personality_summary"],
  scenario: ["scenario", "world_scenario", "scenario_text", "context"],
  first_mes: ["first_mes", "first_message", "char_greeting", "greeting", "initial_message", "initialMessage"],
  mes_example: ["mes_example", "example_dialogue", "example_dialogues", "examples", "sample_dialogue"],
  creator_notes: ["creator_notes", "creatorNotes", "notes"],
  system_prompt: ["system_prompt", "systemPrompt"],
  post_history_instructions: ["post_history_instructions", "postHistoryInstructions"],
  alternate_greetings: ["alternate_greetings", "alternateGreetings"],
  character_book: ["character_book", "characterBook", "lorebook", "world_info"],
  tags: ["tags"],
  creator: ["creator", "author", "created_by"],
  character_version: ["character_version", "characterVersion", "version"],
  extensions: ["extensions"],
};

export function parseCard(input) {
  if (typeof input !== "string") {
    throw new Error("Expected card JSON text.");
  }

  const parsed = JSON.parse(input);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("This JSON isn't a character card — expected an object with card fields.");
  }
  return normalizeObject(parsed);
}

export function normalizeObject(input) {
  const parsed = decodeWrappedPayload(input);
  if (parsed && parsed.spec === "chara_card_v2" && parsed.data) {
    return { format: "v2", raw: parsed, data: normalizeData(parsed.data) };
  }
  if (parsed && parsed.spec && parsed.data && typeof parsed.data === "object") {
    return { format: String(parsed.spec), raw: parsed, data: normalizeData(parsed.data) };
  }
  if (parsed && parsed.data && typeof parsed.data === "object" && hasRecognizedField(parsed.data)) {
    return { format: "nested", raw: parsed, data: normalizeData(parsed.data) };
  }
  if (parsed && hasRecognizedField(parsed)) {
    const data = normalizeData(parsed);
    return { format: hasCanonicalCore(parsed) ? "v1" : "legacy-alias", raw: parsed, data };
  }
  return { format: "unknown-json", raw: parsed, data: normalizeData(parsed ?? {}) };
}

export function cardDataTarget(parsed) {
  if (parsed && parsed.spec === "chara_card_v2" && parsed.data && typeof parsed.data === "object") return parsed.data;
  if (parsed && parsed.data && typeof parsed.data === "object" && hasRecognizedField(parsed.data)) return parsed.data;
  return parsed;
}

export function extractPngTextChunks(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (!isPng(bytes)) {
    throw new Error("This is not a PNG file.");
  }

  const chunks = {};
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = ascii(bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > bytes.length) break;

    if (type === "tEXt" || type === "iTXt") {
      const chunk = bytes.slice(dataStart, dataEnd);
      const entry = type === "iTXt" ? readInternationalTextChunk(chunk) : readTextChunk(chunk);
      if (entry) chunks[entry.key] = entry.value;
    }

    offset = dataEnd + 4;
  }

  return chunks;
}

export function extractCardJsonFromPng(buffer) {
  const chunks = extractPngTextChunks(buffer);
  const value = firstPresent(chunks, CARD_READ_PRIORITY);
  if (!value) {
    throw new Error("No embedded character data was found in this PNG.");
  }

  const decoded = decodeMaybeBase64Json(value);
  JSON.parse(decoded);
  return decoded;
}

export function embedCardJsonInPng(buffer, cardInput) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (!isPng(bytes)) {
    throw new Error("This is not a PNG file.");
  }

  const cardJson = typeof cardInput === "string" ? JSON.stringify(JSON.parse(cardInput), null, 2) : JSON.stringify(cardInput, null, 2);
  const chunks = readPngChunks(bytes);
  const output = [Uint8Array.from(PNG_SIGNATURE)];
  // Write both the legacy V2 `chara` chunk (for older readers) and the
  // canonical `ccv3` chunk, mirroring SillyTavern, so a V3 card survives the
  // round-trip instead of being collapsed to a single legacy chunk.
  const encoded = encodeBase64Text(cardJson);
  const cardChunks = [makeTextChunk("chara", encoded), makeTextChunk("ccv3", encoded)];
  let inserted = false;

  for (const chunk of chunks) {
    if (chunk.type === "tEXt" || chunk.type === "iTXt") {
      const entry = chunk.type === "iTXt" ? readInternationalTextChunk(chunk.data) : readTextChunk(chunk.data);
      if (entry && CARD_TEXT_CHUNK_KEYS.has(entry.key)) continue;
    }

    if (chunk.type === "IEND" && !inserted) {
      output.push(...cardChunks);
      inserted = true;
    }
    output.push(chunk.raw);
  }

  if (!inserted) output.push(...cardChunks);
  return concatBytes(...output);
}

function decodeWrappedPayload(input) {
  if (!input || typeof input !== "object") return input;

  for (const key of ["chara", "character", "card"]) {
    const value = input[key];
    if (typeof value !== "string") continue;
    const decoded = decodeMaybeBase64Json(value);
    try {
      return JSON.parse(decoded);
    } catch {
      continue;
    }
  }

  return input;
}

function normalizeData(source) {
  const data = {};
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    const value = firstPresent(source, aliases);
    if (value !== undefined) data[canonical] = normalizeFieldValue(canonical, value);
  }

  for (const [key, value] of Object.entries(source ?? {})) {
    if (!(key in data) && !isKnownAlias(key)) data[key] = value;
  }

  if (!data.extensions || typeof data.extensions !== "object" || Array.isArray(data.extensions)) {
    data.extensions = {};
  }

  return data;
}

function normalizeFieldValue(field, value) {
  if (field === "tags") {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string") return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  if (field === "alternate_greetings") {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string" && value.trim()) return [value.trim()];
  }

  if (field === "mes_example" && Array.isArray(value)) {
    return value.map(String).join("\n<START>\n");
  }

  return value;
}

function hasRecognizedField(source) {
  if (!source || typeof source !== "object") return false;
  return Object.values(FIELD_ALIASES).some((aliases) => aliases.some((alias) => source[alias] !== undefined));
}

function hasCanonicalCore(source) {
  return REQUIRED_V1_FIELDS.some((field) => source && source[field] !== undefined);
}

function isKnownAlias(key) {
  return Object.values(FIELD_ALIASES).some((aliases) => aliases.includes(key));
}

function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function isPng(bytes) {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readPngChunks(bytes) {
  const chunks = [];
  let offset = PNG_SIGNATURE.length;

  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = ascii(bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > bytes.length) break;

    chunks.push({
      type,
      data: bytes.slice(dataStart, dataEnd),
      raw: bytes.slice(offset, chunkEnd),
    });

    offset = chunkEnd;
    if (type === "IEND") break;
  }

  return chunks;
}

function makeTextChunk(keyword, value) {
  const keyBytes = new TextEncoder().encode(keyword);
  const valueBytes = new TextEncoder().encode(value);
  const data = concatBytes(keyBytes, Uint8Array.from([0]), valueBytes);
  return makePngChunk("tEXt", data);
}

function makePngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32(chunk, 8 + data.length, crc32(concatBytes(typeBytes, data)));
  return chunk;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readTextChunk(chunk) {
  const separator = chunk.indexOf(0);
  if (separator < 0) return null;
  return {
    key: ascii(chunk.slice(0, separator)),
    value: new TextDecoder("latin1").decode(chunk.slice(separator + 1)),
  };
}

function readInternationalTextChunk(chunk) {
  const separator = chunk.indexOf(0);
  if (separator < 0) return null;

  const key = ascii(chunk.slice(0, separator));
  let cursor = separator + 1;
  const compressionFlag = chunk[cursor];
  cursor += 2;
  const languageEnd = chunk.indexOf(0, cursor);
  if (languageEnd < 0) return null;
  cursor = languageEnd + 1;
  const translatedEnd = chunk.indexOf(0, cursor);
  if (translatedEnd < 0) return null;
  cursor = translatedEnd + 1;

  if (compressionFlag !== 0) return null;
  return { key, value: new TextDecoder("utf-8").decode(chunk.slice(cursor)) };
}

function ascii(bytes) {
  return String.fromCharCode(...bytes);
}

function decodeMaybeBase64Json(value) {
  const direct = String(value).trim();
  if (looksLikeJson(direct)) return direct;

  const decoded = decodeBase64Text(direct);
  if (looksLikeJson(decoded)) return decoded;

  return direct;
}

function decodeBase64Text(value) {
  try {
    if (typeof atob === "function") {
      return decodeURIComponent(escape(atob(value)));
    }
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return String(value);
  }
}

function encodeBase64Text(value) {
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(value)));
  }
  return Buffer.from(value, "utf8").toString("base64");
}

function looksLikeJson(value) {
  return /^\s*[\[{]/.test(value);
}

function concatBytes(...arrays) {
  const output = new Uint8Array(arrays.reduce((sum, item) => sum + item.length, 0));
  let offset = 0;
  for (const array of arrays) {
    output.set(array, offset);
    offset += array.length;
  }
  return output;
}
