const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4.1";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeProviderConfig(input = {}, env = process.env) {
  const requestedProvider = clean(input.provider) || clean(env.AI_PROVIDER);
  const provider = requestedProvider === "compatible" ? "compatible" : DEFAULT_PROVIDER;

  return {
    provider,
    model: clean(input.model) || clean(env.AI_MODEL) || clean(env.OPENAI_MODEL) || DEFAULT_MODEL,
    baseUrl: clean(input.baseUrl) || clean(env.AI_BASE_URL),
    apiKey: clean(input.apiKey) || clean(env.AI_API_KEY) || clean(env.OPENAI_API_KEY),
  };
}

export function isAiConfigured(config) {
  return config.provider === "compatible" ? Boolean(config.baseUrl) : Boolean(config.apiKey);
}

export function providerUrl(config) {
  if (config.provider !== "compatible") return OPENAI_RESPONSES_URL;
  const baseUrl = compatibleApiBase(config);
  return `${baseUrl}/chat/completions`;
}

export function providerModelsUrl(config) {
  if (config.provider !== "compatible") return OPENAI_MODELS_URL;
  return `${compatibleApiBase(config)}/models`;
}

export function providerHeaders(config) {
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  return headers;
}

export function parseModelList(responseJson) {
  const source = Array.isArray(responseJson?.data)
    ? responseJson.data
    : Array.isArray(responseJson?.models)
      ? responseJson.models
      : [];
  const ids = source
    .map((model) => clean(model?.id) || clean(model?.name))
    .filter(Boolean);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function compatibleApiBase(config) {
  return config.baseUrl
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "");
}
