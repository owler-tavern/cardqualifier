import test from "node:test";
import assert from "node:assert/strict";
import { classifyCreatorNotes } from "../src/creator-notes.mjs";

test("empty / non-string notes are not substantive and never throw", () => {
  for (const v of ["", "   ", null, undefined, 42, {}]) {
    assert.equal(classifyCreatorNotes(v).substantive, false);
  }
});

test("notes stating genre/tone/behavior/model intent are substantive", () => {
  for (const v of [
    "Dark mystery, keep replies short.",
    "Genre: horror. She responds tersely.",
    "Best with a Claude model and a low temperature.",
    "NSFW opt-in; wholesome otherwise.",
  ]) {
    assert.equal(classifyCreatorNotes(v).substantive, true, v);
  }
});

test("link/handle/boilerplate-only notes are junk", () => {
  for (const v of [
    "Follow me @author on discord.gg/abc",
    "https://patreon.com/me — subscribe!",
    "enjoy!",
    "v2: fixed typos",
    "thanks for downloading, my first card",
  ]) {
    assert.equal(classifyCreatorNotes(v).substantive, false, v);
  }
});

test("borderline prose with no explicit intent word leans substantive", () => {
  // Two-plus meaningful words remain after stripping junk → included.
  assert.equal(classifyCreatorNotes("A cozy little seaside tale.").substantive, true);
  assert.equal(classifyCreatorNotes("Grumpy retired mercenary.").substantive, true);
});

test("substance mixed with a promo link still counts as substantive", () => {
  assert.equal(
    classifyCreatorNotes("Slow-burn romance, be patient with her. Support me at ko-fi.com/x").substantive,
    true,
  );
});

test("non-Latin-script prose is substantive, not stripped to nothing", () => {
  for (const v of [
    "ダークミステリー、短めに返答", // "dark mystery, reply briefly" (Japanese)
    "Тёмная мистика, отвечает кратко", // "dark mystery, answers briefly" (Russian)
    "음침한 미스터리, 짧게 대답", // "gloomy mystery, short replies" (Korean)
  ]) {
    assert.equal(classifyCreatorNotes(v).substantive, true, v);
  }
});
