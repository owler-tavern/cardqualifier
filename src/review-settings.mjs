const SETTINGS = [
  ["#ai-provider", "cq.provider", "openai"],
  ["#ai-model", "cq.ai-model", "gpt-4.1"],
  ["#ai-base-url", "cq.base-url", ""],
];

const REMEMBER_FLAG = "cq.remember-key";
const API_KEY = "cq.api-key";

// Opt-in persistence for the API key. Unlike provider/model/base-url (always
// persisted, non-secret), the key is only stored when the user ticks "Remember
// key on this device" — and it lands in plaintext localStorage, so it stays off
// by default. Storage is injectable so the logic is unit-testable without a DOM.
export function connectApiKeyPersistence(keyInput, rememberBox, storage = localStorage) {
  const remembered = storage.getItem(REMEMBER_FLAG) === "1";
  rememberBox.checked = remembered;
  if (remembered) keyInput.value = storage.getItem(API_KEY) || "";
  rememberBox.addEventListener("change", () => {
    if (rememberBox.checked) {
      storage.setItem(REMEMBER_FLAG, "1");
      storage.setItem(API_KEY, keyInput.value);
    } else {
      storage.removeItem(REMEMBER_FLAG);
      storage.removeItem(API_KEY);
    }
  });
  keyInput.addEventListener("input", () => {
    if (rememberBox.checked) storage.setItem(API_KEY, keyInput.value);
  });
}

export function connectPersistedSettings(select, storage = localStorage) {
  for (const [selector, key, fallback] of SETTINGS) {
    const input = select(selector);
    input.value = storage.getItem(key) || fallback;
    input.addEventListener("input", () => storage.setItem(key, input.value));
  }
  connectApiKeyPersistence(select("#ai-api-key"), select("#ai-remember"), storage);
}

export function readAiSettings(select) {
  return {
    provider: select("#ai-provider").value,
    model: select("#ai-model").value,
    baseUrl: select("#ai-base-url").value,
    apiKey: select("#ai-api-key").value,
  };
}
