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
