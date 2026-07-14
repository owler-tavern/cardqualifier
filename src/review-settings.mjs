const SETTINGS = [
  ["#ai-provider", "cq.provider", "openai"],
  ["#ai-model", "cq.ai-model", "gpt-4.1"],
  ["#ai-base-url", "cq.base-url", ""],
];

const REMEMBER_FLAG = "cq.remember-key";

// Opt-in persistence for API keys. Unlike provider/model/base-url (always
// persisted, non-secret), keys are only stored when the user ticks "Remember
// key on this device" — and they land in plaintext localStorage, so it stays off
// by default. Storage is injectable so the logic is unit-testable without a DOM.
export function connectApiKeyPersistence(pairs, rememberBox, storage = localStorage) {
  const remembered = storage.getItem(REMEMBER_FLAG) === "1";
  rememberBox.checked = remembered;
  if (remembered) {
    for (const { input, key } of pairs) {
      input.value = storage.getItem(key) || "";
    }
  }
  rememberBox.addEventListener("change", () => {
    if (rememberBox.checked) {
      storage.setItem(REMEMBER_FLAG, "1");
      for (const { input, key } of pairs) {
        storage.setItem(key, input.value);
      }
    } else {
      storage.removeItem(REMEMBER_FLAG);
      for (const { input: _, key } of pairs) {
        storage.removeItem(key);
      }
    }
  });
  for (const { input, key } of pairs) {
    input.addEventListener("input", () => {
      if (rememberBox.checked) storage.setItem(key, input.value);
    });
  }
}

export function connectPersistedSettings(select, storage = localStorage) {
  for (const [selector, key, fallback] of SETTINGS) {
    const input = select(selector);
    input.value = storage.getItem(key) || fallback;
    input.addEventListener("input", () => storage.setItem(key, input.value));
  }
  connectApiKeyPersistence([
    { input: select("#ai-api-key"), key: "cq.api-key" },
    { input: select("#brave-api-key"), key: "cq.brave-key" },
  ], select("#ai-remember"), storage);
}

export function readAiSettings(select) {
  return {
    provider: select("#ai-provider").value,
    model: select("#ai-model").value,
    baseUrl: select("#ai-base-url").value,
    apiKey: select("#ai-api-key").value,
  };
}
