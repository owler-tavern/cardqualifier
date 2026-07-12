import test from "node:test";
import assert from "node:assert/strict";
import { weakestAreas } from "../src/weakest-areas.mjs";

const crit = (label, max, points) => ({ label, max, points, note: "" });

test("empty / malformed input yields no areas and never throws", () => {
  for (const v of [null, undefined, {}, { criteria: null }, { criteria: [] }, 42]) {
    assert.deepEqual(weakestAreas(v), { areas: [], more: 0 });
  }
});

test("only criteria below 70% of max are weak, lowest ratio first", () => {
  const result = { criteria: [
    crit("Character substance", 23, 23), // 100% — strong, excluded
    crit("Voice", 8, 5),                 // 62.5% — weak, mid
    crit("Character depth", 16, 4),      // 25% — weak, hi
  ] };
  const { areas, more } = weakestAreas(result);
  assert.deepEqual(areas.map((a) => a.label), ["Depth", "Voice"]);
  assert.equal(areas[0].severity, "hi");
  assert.equal(areas[1].severity, "mid");
  assert.equal(more, 0);
});

test("severity splits hi/mid at 40% of max", () => {
  const result = { criteria: [
    crit("Voice", 10, 3),           // 30% -> hi
    crit("Opening message", 10, 5), // 50% -> mid
  ] };
  const byLabel = Object.fromEntries(weakestAreas(result).areas.map((a) => [a.label, a.severity]));
  assert.equal(byLabel.Voice, "hi");
  assert.equal(byLabel.Opening, "mid");
});

test("caps at limit and reports the overflow count", () => {
  const result = { criteria: [
    crit("Structure and compatibility", 14, 1),
    crit("Character substance", 23, 2),
    crit("Opening message", 12, 1),
    crit("Voice", 8, 1),
    crit("Character depth", 16, 1),
  ] };
  const { areas, more } = weakestAreas(result, 3);
  assert.equal(areas.length, 3);
  assert.equal(more, 2);
});

test("unmapped criterion labels fall back to themselves", () => {
  const { areas } = weakestAreas({ criteria: [crit("New Rubric Axis", 10, 1)] });
  assert.equal(areas[0].label, "New Rubric Axis");
});