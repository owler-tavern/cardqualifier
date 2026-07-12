import test from "node:test";
import assert from "node:assert/strict";
import { topBlocker, reportRows, toCsv, toJson } from "../src/score-report.mjs";

function rec(over = {}) {
  return { fileName: "a.json", name: "A", edited: false,
    result: { total: 61, band: "Mixed", name: "A", reviewPlan: { blockers: [{ title: "Add example dialogues" }] } },
    ...over };
}

test("topBlocker returns the first blocker title, or a dash, or the error", () => {
  assert.equal(topBlocker(rec()), "Add example dialogues");
  assert.equal(topBlocker(rec({ result: { total: 90, band: "Excellent", reviewPlan: { blockers: [] } } })), "—");
  assert.equal(topBlocker({ fileName: "bad.png", error: "not a card", result: null }), "unreadable: not a card");
});

test("reportRows maps records to flat rows including unreadable ones", () => {
  const rows = reportRows([rec({ name: "Comma, Name", edited: true }), { fileName: "bad.png", error: "boom", result: null }]);
  assert.deepEqual(rows[0], { name: "Comma, Name", fileName: "a.json", score: 61, band: "Mixed", topBlocker: "Add example dialogues", edited: "yes" });
  assert.deepEqual(rows[1], { name: "bad.png", fileName: "bad.png", score: "", band: "unreadable", topBlocker: "unreadable: boom", edited: "no" });
});

test("toCsv quotes values containing commas, quotes, or newlines", () => {
  const csv = toCsv([rec({ name: 'He said "hi", loudly' })]);
  const lines = csv.split("\n");
  assert.equal(lines[0], "name,fileName,score,band,topBlocker,edited");
  assert.match(lines[1], /^"He said ""hi"", loudly",a\.json,61,Mixed,Add example dialogues,no$/);
});

test("toCsv neutralizes spreadsheet formula injection in untrusted names", () => {
  const csv = toCsv([rec({ name: "=HYPERLINK(1)" })]);
  const line = csv.split("\n")[1];
  // Leading '=' is prefixed with an apostrophe so Excel treats it as text.
  assert.match(line, /^'=HYPERLINK\(1\),/);
});

test("toCsv guards a leading + that also needs comma-quoting", () => {
  const csv = toCsv([rec({ name: "+1, really" })]);
  const line = csv.split("\n")[1];
  assert.match(line, /^"'\+1, really",/);
});

test("toJson leaves values unescaped (no CSV apostrophe guard)", () => {
  const parsed = JSON.parse(toJson([rec({ name: "=raw" })]));
  assert.equal(parsed[0].name, "=raw");
});

test("toJson is valid JSON of the rows", () => {
  const parsed = JSON.parse(toJson([rec()]));
  assert.equal(parsed[0].score, 61);
  assert.equal(parsed[0].band, "Mixed");
});