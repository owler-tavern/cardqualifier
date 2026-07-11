import test from "node:test";
import assert from "node:assert/strict";
import { mergeFindings } from "../src/merge-findings.mjs";
import { readFile } from "node:fs/promises";
import { parseCard, scoreCard } from "../src/scorer.mjs";

test("weak fixture flows through detectors into a closed blocker gate", async () => {
  const text = await readFile(new URL("./fixtures/weak-card.json", import.meta.url), "utf8");
  const card = parseCard(text);
  const score = scoreCard(card);
  const plan = mergeFindings(score.reviewFindings);
  assert.ok(card.data.description.split(/\s+/).length >= 800);
  assert.ok(plan.blockers.length >= 2);
  assert.ok(plan.blockers.some((card) => card.field === "mes_example"));
  assert.ok(plan.blockers.some((card) => card.field === "description"));
  assert.equal(plan.gate.open, false);
  assert.ok(plan.blockers.find((card) => card.field === "description").leverage >= 7);
  assert.ok(plan.advisories.every((finding) => finding.estimatedDelta === 0));
});

test("gate copy explains the blocker-first lock and the unlock states", () => {
  const blocker = { id: "b1", field: "scenario", severity: "blocker", estimatedDelta: 8 };
  const improvement = { id: "i1", field: "personality", severity: "improvement", estimatedDelta: 5 };

  const locked = mergeFindings([blocker, improvement], { gateOpen: false });
  assert.match(locked.gate.reason, /blocker/i);
  assert.equal(locked.gate.open, false);

  const clearedButClosed = mergeFindings([improvement], { appliedFindingIds: [], gateOpen: false });
  assert.match(clearedButClosed.gate.reason, /re-analyze/i);

  const opened = mergeFindings([improvement], { gateOpen: true });
  assert.equal(opened.gate.open, true);
  assert.match(opened.gate.reason, /open|actionable/i);
});
