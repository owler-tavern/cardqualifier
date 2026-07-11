import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildAiReviewRequest, buildChatCompletionReviewRequest, extractResponseText, parseAiReviewResponse } from "./src/ai-review.mjs";
import { isAiConfigured, normalizeProviderConfig, parseModelList, providerHeaders, providerModelsUrl, providerUrl } from "./src/provider-config.mjs";

const root = resolve(".");
const port = Number(process.env.PORT || 4173);
const envConfig = normalizeProviderConfig();

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
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(root, cleanPath));
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    return sendJson(response, 404, { error: "Not found" });
  }

  response.writeHead(200, { "Content-Type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream" });
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

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
