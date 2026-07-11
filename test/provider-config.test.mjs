import test from "node:test";
import assert from "node:assert/strict";
import { isAiConfigured, normalizeProviderConfig, parseModelList, providerHeaders, providerModelsUrl, providerUrl } from "../src/provider-config.mjs";

test("defaults to OpenAI with the default model", () => {
  const config = normalizeProviderConfig({}, {});

  assert.equal(config.provider, "openai");
  assert.equal(config.model, "gpt-4.1");
  assert.equal(providerUrl(config), "https://api.openai.com/v1/responses");
  assert.equal(isAiConfigured(config), false);
});

test("per-request settings override environment settings", () => {
  const config = normalizeProviderConfig(
    { provider: "compatible", model: "local-model", baseUrl: "http://127.0.0.1:1234/v1" },
    { AI_PROVIDER: "openai", AI_MODEL: "env-model", OPENAI_API_KEY: "env-key" },
  );

  assert.equal(config.provider, "compatible");
  assert.equal(config.model, "local-model");
  assert.equal(config.baseUrl, "http://127.0.0.1:1234/v1");
  assert.equal(config.apiKey, "env-key");
  assert.equal(isAiConfigured(config), true);
});

test("compatible provider URL tolerates trailing slashes", () => {
  const config = normalizeProviderConfig(
    { provider: "compatible", baseUrl: "http://localhost:8080/v1/" },
    {},
  );

  assert.equal(providerUrl(config), "http://localhost:8080/v1/chat/completions");
});

test("compatible provider URL is not duplicated when full endpoint is supplied", () => {
  const config = normalizeProviderConfig(
    { provider: "compatible", baseUrl: "http://localhost:8080/v1/chat/completions" },
    {},
  );

  assert.equal(providerUrl(config), "http://localhost:8080/v1/chat/completions");
});

test("authorization header is omitted when a local provider does not need a key", () => {
  const config = normalizeProviderConfig({ provider: "compatible", baseUrl: "http://localhost:8080/v1" }, {});

  assert.deepEqual(providerHeaders(config), { "Content-Type": "application/json" });
});

test("authorization header is added when a key is present", () => {
  const config = normalizeProviderConfig({ apiKey: "secret" }, {});

  assert.equal(providerHeaders(config).Authorization, "Bearer secret");
});

test("OpenAI model list URL uses the models endpoint", () => {
  const config = normalizeProviderConfig({}, {});

  assert.equal(providerModelsUrl(config), "https://api.openai.com/v1/models");
});

test("compatible model list URL is built from the provider base URL", () => {
  const config = normalizeProviderConfig(
    { provider: "compatible", baseUrl: "http://localhost:8080/v1/chat/completions" },
    {},
  );

  assert.equal(providerModelsUrl(config), "http://localhost:8080/v1/models");
});

test("model list parser extracts sorted model ids from OpenAI-compatible data", () => {
  const models = parseModelList({
    data: [
      { id: "z-model", object: "model" },
      { id: "a-model", object: "model" },
      { id: "" },
    ],
  });

  assert.deepEqual(models, ["a-model", "z-model"]);
});

test("model list parser tolerates local provider model arrays", () => {
  const models = parseModelList({
    models: [
      { name: "local-b" },
      { id: "local-a" },
    ],
  });

  assert.deepEqual(models, ["local-a", "local-b"]);
});
