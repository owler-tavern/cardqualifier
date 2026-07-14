import test from "node:test";
import assert from "node:assert/strict";
import { pickNextFix, autoImproveCard, AUTO_IMPROVE_TARGET } from "../src/auto-improve.mjs";

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

// Fake scorer: total climbs by 20 for each applied "[fix:...]" marker in text,
// and reviewFindings shrink as fixes are applied.
function fakeScore(fixTotal) {
  return (text) => {
    const applied = (text.match(/\[fix:/g) || []).length;
    const total = Math.min(fixTotal, applied * 20);
    const remaining = [];
    if (total < 70) remaining.push({ id: `b${applied}`, field: "description", severity: "blocker", summary: "", evidence: [], estimatedDelta: 5, fixTemplate: null });
    return { total, band: total >= 70 ? "Good" : "Weak", reviewFindings: remaining };
  };
}
const fakeApply = (text, { field, draft }) => `${text}[fix:${field}]`;

test("reaches the target by applying drafted fixes", async () => {
  const out = await autoImproveCard({
    text: "", draftField: async () => "a draft", score: fakeScore(100), apply: fakeApply,
  });
  assert.equal(out.status, "reached");
  assert.ok(out.result.total >= 70);
  assert.ok(out.ledger.length >= 1);
});

test("stops as stuck when a finding can't be drafted or templated", async () => {
  const score = (text) => ({ total: 40, band: "Weak",
    reviewFindings: [{ id: "c1", field: "cleanup", severity: "blocker", summary: "", evidence: [], estimatedDelta: 5, fixTemplate: null }] });
  const out = await autoImproveCard({ text: "", draftField: async () => null, score, apply: fakeApply });
  assert.equal(out.status, "stuck");
});

test("skips a finding the reviewer won't draft, then exhausts", async () => {
  const score = () => ({ total: 40, band: "Weak", reviewFindings: [
    { id: "d0", field: "description", severity: "blocker", summary: "", evidence: [], estimatedDelta: 5, fixTemplate: null },
    { id: "d1", field: "personality", severity: "improvement", summary: "", evidence: [], estimatedDelta: 5, fixTemplate: null },
  ] });
  const out = await autoImproveCard({ text: "", draftField: async () => null, score, apply: fakeApply, cap: 5 });
  assert.equal(out.status, "exhausted");
});

test("cancels between steps when shouldStop returns true", async () => {
  const out = await autoImproveCard({
    text: "", draftField: async () => "d", score: fakeScore(100), apply: fakeApply, shouldStop: () => true,
  });
  assert.equal(out.status, "cancelled");
});

test("templated fixes need no draftField call", async () => {
  let drafted = 0;
  const score = (text) => {
    const applied = (text.match(/\[fix:/g) || []).length;
    const total = applied * 40;
    return { total, band: total >= 70 ? "Good" : "Weak",
      reviewFindings: total >= 70 ? [] : [{ id: `t${applied}`, field: "token_efficiency", severity: "blocker", summary: "", evidence: [], estimatedDelta: 5, fixTemplate: "ready template" }] };
  };
  const out = await autoImproveCard({ text: "", draftField: async () => { drafted++; return "x"; }, score, apply: fakeApply });
  assert.equal(out.status, "reached");
  assert.equal(drafted, 0); // fixTemplate path never calls the reviewer
});
