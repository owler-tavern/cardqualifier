import test from "node:test";
import assert from "node:assert/strict";
import { exportReadiness } from "../src/export-readiness.mjs";

test("Good and Excellent bands are ship-ready", () => {
  assert.equal(exportReadiness("Good").ready, true);
  assert.equal(exportReadiness("Excellent").ready, true);
});

test("Weak and Mixed bands are not ship-ready", () => {
  assert.equal(exportReadiness("Weak").ready, false);
  assert.equal(exportReadiness("Mixed").ready, false);
});

test("each band carries a distinct creator-facing message", () => {
  const messages = ["Weak", "Mixed", "Good", "Excellent"].map((b) => exportReadiness(b).message);
  assert.equal(new Set(messages).size, 4);
  assert.match(exportReadiness("Excellent").message, /ship|ready/i);
});

test("an unknown band is treated as not ready", () => {
  const r = exportReadiness("Nonsense");
  assert.equal(r.ready, false);
  assert.equal(typeof r.message, "string");
});
