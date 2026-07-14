import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchConfig, isSearchConfigured } from "../src/image-search-config.mjs";

test("prefers explicit apiKey, falls back to BRAVE_API_KEY env", () => {
  assert.equal(normalizeSearchConfig({ apiKey: " k1 " }, {}).apiKey, "k1");
  assert.equal(normalizeSearchConfig({}, { BRAVE_API_KEY: "envk" }).apiKey, "envk");
  assert.equal(normalizeSearchConfig({}, {}).apiKey, "");
});

test("isSearchConfigured reflects a present key", () => {
  assert.equal(isSearchConfigured({ apiKey: "k" }), true);
  assert.equal(isSearchConfigured({ apiKey: "" }), false);
});