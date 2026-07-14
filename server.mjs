import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildAiReviewRequest, buildChatCompletionReviewRequest, extractResponseText, parseAiReviewResponse } from "./src/ai-review.mjs";
import { isAiConfigured, normalizeProviderConfig, parseModelList, providerHeaders, providerModelsUrl, providerUrl } from "./src/provider-config.mjs";

import { buildImageQuery, normalizeBraveResults } from "./src/image-search.mjs";
import { isBlockedUrl } from "./src/ssrf-guard.mjs";
import { isSearchConfigured, normalizeSearchConfig } from "./src/image-search-config.mjs";

const root = resolve(".");
const port = Number(process.env.PORT || 4173);
const envConfig = normalizeProviderConfig();

const PROXY_MAX_BYTES = 8_000_000;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
]);

export function createAppServer() {
  return createServer(handleRequest);
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return sendJson(response, 200, {
        ok: true,
        aiConfigured: isAiConfigured(envConfig),
        provider: envConfig.provider,
        model: envConfig.model,
      });
    }

    if (request.method === "POST" && url.pathname === "/api/ai-review") {
      return await handleAiReview(request, response);
    }

    if (request.method === "POST" && url.pathname === "/api/models") {
      return await handleModels(request, response);
    }

    if (request.method === "POST" && url.pathname === "/api/image-search") {
      return await handleImageSearch(request, response);
    }

    if (request.method === "POST" && url.pathname === "/api/image-proxy") {
      return await handleImageProxy(request, response);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendJson(response, 405, { error: "Method not allowed" });
    }

    return await serveStatic(url.pathname, response, request.method === "HEAD");
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Server error" });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createAppServer().listen(port, "127.0.0.1", () => {
    console.log(`CardQualifier running at http://127.0.0.1:${port}/`);
  });
}

export async function handleAiReview(request, response) {
  const body = await readBody(request, 600_000);
  const payload = JSON.parse(body || "{}");
  const cardText = String(payload.card ?? "");
  const config = normalizeProviderConfig(payload.aiConfig ?? {});


  if (config.provider === "compatible" && !config.baseUrl) {
    return sendJson(response, 501, {
      error: "Add an OpenAI-compatible base URL before running AI review.",
    });
  }

  if (config.provider !== "compatible" && !config.apiKey) {
    return sendJson(response, 501, {
      error: "Add an API key before running OpenAI review.",
    });
  }

  const apiResponse = await fetch(providerUrl(config), {
    method: "POST",
    headers: providerHeaders(config),
    body: JSON.stringify(providerBody(config, cardText, payload)),
  });

  const apiJson = await apiResponse.json();
  if (!apiResponse.ok) {
    return sendJson(response, apiResponse.status, { error: apiJson.error?.message ?? "AI provider request failed" });
  }

  let review;
  try {
    review = parseAiReviewResponse(apiJson);
  } catch (parseError) {
    console.warn(
      `[ai-review] unreadable model output for field "${payload.targetField ?? "?"}": ${parseError.message}. Raw output:`,
      safeExtractRawText(apiJson),
    );
    return sendJson(response, 502, {
      error: "The reviewer's response wasn't valid JSON — the model likely ignored the structured-output format. Try again, or switch to a model with reliable JSON support.",
    });
  }

  if (!review.suggestions.length) {
    console.warn(
      `[ai-review] model returned no usable suggestions for field "${payload.targetField ?? "?"}". Raw output:`,
      safeExtractRawText(apiJson),
    );
  }
  return sendJson(response, 200, review);
}

function safeExtractRawText(apiJson) {
  try {
    return extractResponseText(apiJson).slice(0, 2000);
  } catch {
    return "<no text output>";
  }
}

async function handleModels(request, response) {
  const body = await readBody(request, 20_000);
  const payload = JSON.parse(body || "{}");
  const config = normalizeProviderConfig(payload.aiConfig ?? {});

  if (config.provider === "compatible" && !config.baseUrl) {
    return sendJson(response, 501, { error: "Add an OpenAI-compatible base URL before fetching models." });
  }

  if (config.provider !== "compatible" && !config.apiKey) {
    return sendJson(response, 501, { error: "Add an API key before fetching OpenAI models." });
  }

  const apiResponse = await fetch(providerModelsUrl(config), {
    method: "GET",
    headers: providerHeaders(config),
  });

  const apiJson = await apiResponse.json();
  if (!apiResponse.ok) {
    return sendJson(response, apiResponse.status, { error: apiJson.error?.message ?? "Could not fetch models from provider." });
  }

  const models = parseModelList(apiJson);
  return sendJson(response, 200, { models, count: models.length });
}

function providerBody(config, cardText, options) {
  if (config.provider === "compatible") {
    return {
      model: config.model,
      ...buildChatCompletionReviewRequest(cardText, options),
    };
  }
  return {
    model: config.model,
    ...buildAiReviewRequest(cardText, options),
  };
}

async function serveStatic(pathname, response, headOnly) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return sendJson(response, 400, { error: "Bad request path" });
  }
  const cleanPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = normalize(join(root, cleanPath));
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    return sendJson(response, 404, { error: "Not found" });
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  if (headOnly) return response.end();
  createReadStream(filePath).pipe(response);
}

async function readBody(request, limit) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > limit) throw new Error("Request body is too large.");
  }
  return body;
}

export async function handleImageSearch(request, response) {
  const body = await readBody(request, 20_000);
  const payload = JSON.parse(body || "{}");
  const config = normalizeSearchConfig({ apiKey: payload.apiKey });
  if (!isSearchConfigured(config)) return sendJson(response, 401, { error: "Brave Search API key required." });
  const q = buildImageQuery(payload.card ?? {}) || payload.query || "character portrait";
  const braveUrl = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(q)}&count=20&safesearch=strict`;
  const upstream = await fetch(braveUrl, { headers: { "Accept": "application/json", "X-Subscription-Token": config.apiKey } });
  if (!upstream.ok) return sendJson(response, 502, { error: "Brave search request failed." });
  const json = await upstream.json();
  return sendJson(response, 200, normalizeBraveResults(json));
}

export async function handleImageProxy(request, response) {
  const body = await readBody(request, 20_000);
  const payload = JSON.parse(body || "{}");
  const target = String(payload.url ?? "");
  if (!target) return sendJson(response, 400, { error: "url parameter required." });
  if (isBlockedUrl(target)) return sendJson(response, 403, { error: "URL blocked." });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let upstream;
  try {
    upstream = await fetch(target, { signal: controller.signal, redirect: "follow" });
  } catch { clearTimeout(timer); return sendJson(response, 502, { error: "Could not fetch image." }); }
  clearTimeout(timer);
  const ct = upstream.headers.get("content-type") || "";
  if (!upstream.ok || !ct.toLowerCase().startsWith("image/")) return sendJson(response, 415, { error: "Not an image." });
  const buf = Buffer.from(await upstream.arrayBuffer());
  if (buf.length > PROXY_MAX_BYTES) return sendJson(response, 413, { error: "Image too large." });
  response.writeHead(200, { "Content-Type": ct, "Content-Length": buf.length });
  response.end(buf);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
