import test from "node:test";
import assert from "node:assert/strict";
import { pickNextFix, AUTO_IMPROVE_TARGET } from "../src/auto-improve.mjs";

// Build a minimal scoreCard-shaped result with the given reviewFindings.
function result(total, findings) { return { total, band: total >= 70 ? "Good" : "Weak", reviewFindings: findings }; }
function finding(id, field, severity, extra = {}) {
  return { id, field, severity, summary: "", evidence: [], estimatedDelta: 5, fixTemplate: null, ...extra };
}

test("done+reached once the card is at or above the target", () => {
  const pick = pickNextFix(result(AUTO_IMPROVE_TARGET, []), []);
  assert.deepEqual(pick, { done: true, status: "reached" });
});

test("picks a blocker before an improvement", () => {
  const r = result(40, [
    finding("i1", "personality", "improvement"),
    finding("b1", "description", "blocker"),
  ]);
  const pick = pickNextFix(r, []);
  assert.equal(pick.done, false);
  assert.equal(pick.card.field, "description"); // blocker first
});

test("skips findings already applied", () => {
  const r = result(40, [finding("b1", "description", "blocker")]);
  const pick = pickNextFix(r, ["b1"]);
  assert.deepEqual(pick, { done: true, status: "exhausted" });
});

test("stuck when the only actionable finding is non-draftable with no template", () => {
  const r = result(40, [finding("c1", "cleanup", "blocker")]); // cleanup: not draftable, no template
  const pick = pickNextFix(r, []);
  assert.deepEqual(pick, { done: true, status: "stuck" });
});

test("a non-draftable finding with a template is still actionable", () => {
  const r = result(40, [finding("c1", "cleanup", "blocker", { fixTemplate: "do the thing" })]);
  const pick = pickNextFix(r, []);
  assert.equal(pick.done, false);
  assert.equal(pick.card.field, "cleanup");
});
