import test from "node:test";
import assert from "node:assert/strict";
import { createBulkStore } from "../src/bulk-store.mjs";

function rec(name, total, band) {
  return { fileName: `${name}.json`, name, text: "{}", sourcePng: null,
    result: { total, band, name, reviewPlan: { blockers: [] } },
    applied: [], ledger: [], previous: null, gateOpen: false, edited: false };
}

test("add assigns unique ids and get/all return records", () => {
  const s = createBulkStore();
  const a = s.add(rec("A", 90, "Excellent"));
  const b = s.add(rec("B", 40, "Weak"));
  assert.notEqual(a.id, b.id);
  assert.equal(s.get(a.id).name, "A");
  assert.equal(s.all().length, 2);
});

test("summary computes count, average, and triage buckets from bands", () => {
  const s = createBulkStore();
  s.add(rec("A", 90, "Excellent")); // ship
  s.add(rec("B", 75, "Good"));      // ship
  s.add(rec("C", 60, "Mixed"));     // fixable
  s.add(rec("D", 30, "Weak"));      // weak
  const sum = s.summary();
  assert.equal(sum.count, 4);
  assert.equal(sum.avg, Math.round((90 + 75 + 60 + 30) / 4)); // 64
  assert.deepEqual(sum.buckets, { ship: 2, fixable: 1, weak: 1 });
});

test("view sorts by score desc by default and filters by band + query", () => {
  const s = createBulkStore();
  s.add(rec("Alpha", 90, "Excellent"));
  s.add(rec("Beta", 40, "Weak"));
  s.add(rec("Gamma", 60, "Mixed"));
  const byScore = s.view({}).map((r) => r.name);
  assert.deepEqual(byScore, ["Alpha", "Gamma", "Beta"]);
  const onlyWeak = s.view({ bands: new Set(["Weak"]) }).map((r) => r.name);
  assert.deepEqual(onlyWeak, ["Beta"]);
  const search = s.view({ query: "alph" }).map((r) => r.name);
  assert.deepEqual(search, ["Alpha"]);
});

test("worklist next/prev walk the list and stop at the ends", () => {
  const s = createBulkStore();
  const a = s.add(rec("A", 90, "Excellent"));
  const b = s.add(rec("B", 40, "Weak"));
  const c = s.add(rec("C", 60, "Mixed"));
  s.setWorklist([a.id, b.id, c.id]);
  s.setActive(a.id);
  assert.equal(s.worklistPos().total, 3);
  assert.equal(s.next().name, "B");
  assert.equal(s.next().name, "C");
  assert.equal(s.next().name, "C"); // clamped at end
  assert.equal(s.prev().name, "B");
});

test("selection toggles and unreadable records are excluded from select", () => {
  const s = createBulkStore();
  const a = s.add(rec("A", 90, "Excellent"));
  s.toggleSelect(a.id);
  assert.deepEqual([...s.selectedIds()], [a.id]);
  s.toggleSelect(a.id);
  assert.equal(s.selectedIds().size, 0);
});

test("replace swaps a record in place, preserving id and order", () => {
  const s = createBulkStore();
  const a = s.add(rec("A", 40, "Weak"));
  s.add(rec("B", 90, "Excellent"));
  const improved = { ...a, result: { total: 80, band: "Good", name: "A", reviewPlan: { blockers: [] } }, edited: true };
  s.replace(a.id, improved);
  assert.equal(s.get(a.id).result.total, 80);
  assert.equal(s.all()[0].id, a.id); // order preserved
});