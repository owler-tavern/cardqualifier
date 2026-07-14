import test from "node:test";
import assert from "node:assert/strict";
import { handleImageSearch, handleImageProxy } from "../server.mjs";

function fakeRequest(bodyObject) {
  const body = JSON.stringify(bodyObject);
  return { async *[Symbol.asyncIterator]() { yield body; } };
}
function fakeResponse() {
  return { statusCode: null, headers: null, payload: null,
    writeHead(status, headers) { this.statusCode = status; this.headers = headers || null; },
    end(chunk) { this.payload = chunk && typeof chunk === "string" ? tryJson(chunk) : chunk ?? null; } };
}
function tryJson(s) { try { return JSON.parse(s); } catch { return s; } }
function withStubbedFetch(fetchImpl, run) {
  const original = globalThis.fetch; globalThis.fetch = fetchImpl;
  return Promise.resolve(run()).finally(() => { globalThis.fetch = original; });
}

test("image-search returns normalized results from Brave", async () => {
  const braveJson = { results: [{ title: "A", url: "https://src/a", thumbnail: { src: "https://t/a" }, properties: { url: "https://img/a" } }] };
  await withStubbedFetch(async (url, opts) => {
    assert.match(String(url), /res\/v1\/images\/search/);
    assert.match(String(url), /safesearch=strict/);
    assert.equal(opts.headers["X-Subscription-Token"], "test-key");
    return { ok: true, status: 200, json: async () => braveJson };
  }, async () => {
    const res = fakeResponse();
    await handleImageSearch(fakeRequest({ query: "Mara", apiKey: "test-key" }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.length, 1);
    assert.equal(res.payload[0].image, "https://img/a");
  });
});

test("image-search returns 401 when apiKey is missing", async () => {
  await withStubbedFetch(async () => ({ ok: true, json: async () => ({}) }), async () => {
    const res = fakeResponse();
    await handleImageSearch(fakeRequest({ query: "Mara" }), res);
    assert.equal(res.statusCode, 401);
  });
});

test("image-search returns 502 on upstream non-ok", async () => {
  await withStubbedFetch(async () => ({ ok: false, status: 429, json: async () => ({}) }), async () => {
    const res = fakeResponse();
    await handleImageSearch(fakeRequest({ query: "Mara", apiKey: "k" }), res);
    assert.equal(res.statusCode, 502);
  });
});

test("image-proxy streams an image binary with correct content-type", async () => {
  const buf = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
  await withStubbedFetch(async () => ({
    ok: true,
    status: 200,
    headers: { get: (h) => h === "content-type" ? "image/png" : null },
    arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
  }), async () => {
    const res = fakeResponse();
    await handleImageProxy(fakeRequest({ url: "https://cdn/a.png", key: "k1" }), res);
    assert.equal(res.statusCode, 200);
    assert.match(res.headers?.["Content-Type"] ?? "", /image\/png/);
  });
});

test("image-proxy returns 400 when url is missing", async () => {
  const res = fakeResponse();
  await handleImageProxy(fakeRequest({ key: "k1" }), res);
  assert.equal(res.statusCode, 400);
});

test("image-proxy blocks private hosts (SSRF)", async () => {
  for (const u of ["http://127.0.0.1/x.png", "http://localhost/x.png", "http://10.0.0.1/x.png"]) {
    const res = fakeResponse();
    await handleImageProxy(fakeRequest({ url: u, key: "k1" }), res);
    assert.equal(res.statusCode, 403, `blocked ${u}`);
  }
});

test("image-proxy returns 415 when upstream content-type is not image/*", async () => {
  await withStubbedFetch(async () => ({
    ok: true,
    status: 200,
    headers: { get: (h) => h === "content-type" ? "text/html" : null },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  }), async () => {
    const res = fakeResponse();
    await handleImageProxy(fakeRequest({ url: "https://cdn/a.html", key: "k1" }), res);
    assert.equal(res.statusCode, 415);
  });
});
