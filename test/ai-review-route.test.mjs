import test from "node:test";
import assert from "node:assert/strict";
import { handleAiReview } from "../server.mjs";

function fakeRequest(bodyObject) {
  const body = JSON.stringify(bodyObject);
  return {
    async *[Symbol.asyncIterator]() {
      yield body;
    },
  };
}

function fakeResponse() {
  return {
    statusCode: null,
    payload: null,
    writeHead(status) {
      this.statusCode = status;
    },
    end(chunk) {
      this.payload = chunk ? JSON.parse(chunk) : null;
    },
  };
}

function withStubbedFetch(fetchImpl, run) {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings = [];
  globalThis.fetch = fetchImpl;
  console.warn = (...args) => warnings.push(args.join(" "));
  return Promise.resolve(run(warnings)).finally(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });
}

function providerJson(review) {
  return { ok: true, status: 200, json: async () => ({ output_text: JSON.stringify(review) }) };
}

function providerRawText(text) {
  return { ok: true, status: 200, json: async () => ({ output_text: text }) };
}

const askBody = {
  card: JSON.stringify({ data: { name: "Mara", personality: "Guarded." } }),
  aiConfig: { apiKey: "test-key" },
  targetField: "personality",
  validFindingIds: ["rubric.personality.thin"],
};

test("route returns a reviewer draft for the requested field", async () => {
  await withStubbedFetch(
    async () => providerJson({
      summary: "ok",
      suggestions: [{
        field: "personality",
        title: "Anchor the voice",
        why: "Traits are unanchored.",
        draft: "Warm but wary; she deflects with dry jokes.",
        evidence: ["personality reads flat"],
        confidence: "high",
        resolvesFindingIds: ["rubric.personality.thin"],
        directionUsed: false,
      }],
    }),
    async () => {
      const response = fakeResponse();
      await handleAiReview(fakeRequest(askBody), response);

      assert.equal(response.statusCode, 200);
      assert.equal(response.payload.suggestions.length, 1);
      assert.equal(response.payload.suggestions[0].field, "personality");
    },
  );
});

test("route logs the raw output when every suggestion is dropped", async () => {
  await withStubbedFetch(
    async () => providerJson({
      summary: "empty draft",
      suggestions: [{ field: "personality", title: "t", why: "w", draft: "" }],
    }),
    async (warnings) => {
      const response = fakeResponse();
      await handleAiReview(fakeRequest(askBody), response);

      assert.equal(response.statusCode, 200);
      assert.equal(response.payload.suggestions.length, 0);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /no usable suggestions for field "personality"/);
    },
  );
});

test("route returns a clear error and logs raw text when the model output is not JSON", async () => {
  await withStubbedFetch(
    async () => providerRawText('{"summary":"ok","suggestions":[{"field":"personality","draft":"he said "hi'),
    async (warnings) => {
      const response = fakeResponse();
      await handleAiReview(fakeRequest(askBody), response);

      assert.equal(response.statusCode, 502);
      assert.match(response.payload.error, /valid JSON/i);
      assert.doesNotMatch(response.payload.error, /position \d+/);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /unreadable model output/i);
    },
  );
});

test("route forwards provider errors with their status", async () => {
  await withStubbedFetch(
    async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "Rate limited" } }) }),
    async () => {
      const response = fakeResponse();
      await handleAiReview(fakeRequest(askBody), response);

      assert.equal(response.statusCode, 429);
      assert.equal(response.payload.error, "Rate limited");
    },
  );
});
