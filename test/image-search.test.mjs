import test from "node:test";
import assert from "node:assert/strict";
import { buildImageQuery, normalizeBraveResults } from "../src/image-search.mjs";

test("buildImageQuery uses name + tags and appends 'character portrait'", () => {
  const q = buildImageQuery({ name: "Mara Venn", tags: ["mystery", "mentor"] });
  assert.match(q, /Mara Venn/);
  assert.match(q, /mystery/);
  assert.match(q, /character portrait/);
});

test("buildImageQuery dedupes case-insensitively and caps length", () => {
  const q = buildImageQuery({ name: "Portrait", tags: ["portrait", "PORTRAIT"] });
  assert.equal((q.match(/portrait/gi) || []).length, 2); // one from tag, one from the literal "character portrait"
  assert.ok(q.length <= 120);
});

test("buildImageQuery tolerates a missing/blank card", () => {
  assert.equal(typeof buildImageQuery({}), "string");
  assert.match(buildImageQuery({}), /character portrait/);
});

test("normalizeBraveResults maps fields and drops incomplete entries", () => {
  const json = { results: [
    { title: "A", url: "https://src/a", thumbnail: { src: "https://t/a" }, properties: { url: "https://img/a", width: 400, height: 600 } },
    { title: "no image", url: "https://src/b", thumbnail: { src: "https://t/b" }, properties: {} }, // no properties.url → dropped
    { title: "no thumb", url: "https://src/c", properties: { url: "https://img/c" } },              // no thumbnail → dropped
  ] };
  const out = normalizeBraveResults(json);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { image: "https://img/a", thumbnail: "https://t/a", source: "https://src/a", title: "A", width: 400, height: 600 });
});

test("normalizeBraveResults handles a non-object safely", () => {
  assert.deepEqual(normalizeBraveResults(null), []);
  assert.deepEqual(normalizeBraveResults({}), []);
});