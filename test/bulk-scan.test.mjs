import test from "node:test";
import assert from "node:assert/strict";
import { buildRecord, errorRecord, scanFiles } from "../src/bulk-scan.mjs";

const fakeScore = (text) => ({ total: 70, band: "Good", name: JSON.parse(text).name, reviewPlan: { blockers: [] } });

test("buildRecord scores text and seeds record fields", () => {
  const r = buildRecord({ fileName: "mara.json", text: '{"name":"Mara"}', sourcePng: null }, fakeScore);
  assert.equal(r.name, "Mara");
  assert.equal(r.result.total, 70);
  assert.deepEqual(r.applied, []);
  assert.equal(r.edited, false);
  assert.equal(r.error, undefined);
});

test("buildRecord falls back to fileName when the card has no name", () => {
  const r = buildRecord({ fileName: "nameless.json", text: '{"name":""}', sourcePng: null }, fakeScore);
  assert.equal(r.name, "nameless.json");
});

test("errorRecord carries the message and no result", () => {
  const r = errorRecord("bad.png", new Error("not a card"));
  assert.equal(r.error, "not a card");
  assert.equal(r.result, null);
});

test("scanFiles builds one record per card file and reports progress", async () => {
  const files = [{ name: "a.json" }, { name: "b.json" }, { name: "notes.txt" }];
  const read = async (f) => ({ text: `{"name":"${f.name}"}`, sourcePng: null });
  const progress = [];
  const records = await scanFiles(files, { read, score: fakeScore, chunkSize: 1, onProgress: (d, t) => progress.push([d, t]) });
  assert.equal(records.length, 2); // .txt skipped
  assert.deepEqual(progress.at(-1), [2, 2]);
});

test("scanFiles isolates a failing file as an error record and keeps going", async () => {
  const files = [{ name: "ok.json" }, { name: "broken.png" }];
  const read = async (f) => { if (f.name === "broken.png") throw new Error("bad chunk"); return { text: '{"name":"OK"}', sourcePng: null }; };
  const records = await scanFiles(files, { read, score: fakeScore });
  assert.equal(records.length, 2);
  assert.equal(records[0].name, "OK");
  assert.equal(records[1].error, "bad chunk");
});