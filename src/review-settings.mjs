const SETTINGS = [
  ["#ai-provider", "cq.provider", "openai"],
  ["#ai-model", "cq.ai-model", "gpt-4.1"],
  ["#ai-base-url", "cq.base-url", ""],
];

export function connectPersistedSettings(select) {
  for (const [selector, key, fallback] of SETTINGS) {
    const input = select(selector);
    input.value = localStorage.getItem(key) || fallback;
    input.addEventListener("input", () => localStorage.setItem(key, input.value));
  }
}

export function readAiSettings(select) {
  return {
    provider: select("#ai-provider").value,
    model: select("#ai-model").value,
    baseUrl: select("#ai-base-url").value,
    apiKey: select("#ai-api-key").value,
  };
}
