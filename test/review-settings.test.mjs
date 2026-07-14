import test from "node:test";
import assert from "node:assert/strict";
import { connectApiKeyPersistence } from "../src/review-settings.mjs";

// Minimal fake DOM element: records event handlers so tests can fire them.
function fakeInput(initial = "") {
  const handlers = {};
  return {
    value: initial,
    checked: false,
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    fire(type) { for (const fn of handlers[type] || []) fn(); },
  };
}

function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

test("key is not restored when the remember flag is unset", () => {
  const key = fakeInput("");
  const box = fakeInput();
  const storage = fakeStorage({ "cq.api-key": "leftover" });
  connectApiKeyPersistence(key, box, storage);
  assert.equal(box.checked, false);
  assert.equal(key.value, ""); // not restored — remember flag absent
});

test("ticking remember stores the flag and the current key", () => {
  const key = fakeInput("sk-abc123");
  const box = fakeInput();
  const storage = fakeStorage();
  connectApiKeyPersistence(key, box, storage);
  box.checked = true;
  box.fire("change");
  assert.equal(storage.getItem("cq.remember-key"), "1");
  assert.equal(storage.getItem("cq.api-key"), "sk-abc123");
});

test("editing the key while remembered keeps the stored copy in sync", () => {
  const key = fakeInput("sk-old");
  const box = fakeInput();
  const storage = fakeStorage();
  connectApiKeyPersistence(key, box, storage);
  box.checked = true;
  box.fire("change");
  key.value = "sk-new";
  key.fire("input");
  assert.equal(storage.getItem("cq.api-key"), "sk-new");
});

test("un-ticking remember clears both the flag and the stored key", () => {
  const key = fakeInput("sk-abc");
  const box = fakeInput();
  const storage = fakeStorage({ "cq.remember-key": "1", "cq.api-key": "sk-abc" });
  connectApiKeyPersistence(key, box, storage);
  assert.equal(box.checked, true); // restored as ticked
  assert.equal(key.value, "sk-abc"); // key restored
  box.checked = false;
  box.fire("change");
  assert.equal(storage.getItem("cq.remember-key"), null);
  assert.equal(storage.getItem("cq.api-key"), null);
});

test("a remembered key is restored on connect and the box is ticked", () => {
  const key = fakeInput("");
  const box = fakeInput();
  const storage = fakeStorage({ "cq.remember-key": "1", "cq.api-key": "sk-saved" });
  connectApiKeyPersistence(key, box, storage);
  assert.equal(box.checked, true);
  assert.equal(key.value, "sk-saved");
});
