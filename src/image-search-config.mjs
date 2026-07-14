function clean(value) { return typeof value === "string" ? value.trim() : ""; }

export function normalizeSearchConfig(input = {}, env = process.env) {
  return { apiKey: clean(input.apiKey) || clean(env.BRAVE_API_KEY) };
}

export function isSearchConfigured(config) { return Boolean(config.apiKey); }