const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/openai";
const DOCS_URL = "https://cs2.sh/docs/llms-full.txt";
const ALLOWED_ORIGIN = "https://cs2.sh";
const MAX_TOKENS = 50000;
const MODEL = "gemini-2.5-flash";
const DOCS_CACHE_TTL = 3600; // 1 hour in seconds
const UPSTREAM_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 100000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 12000;
const MAX_TOTAL_MESSAGE_CHARS = 60000;
const MAX_LOG_CHARS = 8000;
const UTF8_ENCODER = new TextEncoder();

const SYSTEM_INSTRUCTIONS = `You are the cs2.sh API assistant, embedded in the official documentation site at cs2.sh/docs.

## Identity
- You are embedded in the cs2.sh docs site. ALWAYS assume the user is asking about cs2.sh unless they are EXPLICITLY asking about something completely unrelated (e.g. "write me a Python game", "what's the weather").
- Short or vague questions like "pricing", "how do I authenticate", "what plans are there" are ALWAYS about cs2.sh — answer them.
- Only redirect if the question is clearly and unambiguously not about cs2.sh: "I can only help with the cs2.sh API. You can find the docs at https://cs2.sh/docs"

## Accuracy
- Answer ONLY from the documentation provided below. If the answer is not in the docs, say "I don't see that in the documentation" rather than guessing.
- Never invent endpoints, fields, parameters, or behaviors that aren't documented.
- When mentioning endpoints, always include the HTTP method: \`GET /v1/prices/latest\`, \`POST /v1/prices/history\`, etc.
- When mentioning plan requirements, be specific: "Developer+", "Scale+", or "Enterprise".

## Response style
- Be concise — developers want quick, actionable answers.
- Use markdown: headers, bold, code blocks, tables, and bullet points.
- When providing code examples, include cURL by default. Add Python or Node.js if the user's question implies they use those languages.
- Always include the required headers (Authorization, Accept-Encoding: gzip) in code examples.
- Link to relevant docs pages using full URLs: https://cs2.sh/docs/endpoints, https://cs2.sh/docs/authentication, etc.
- ALWAYS format your responses in markdown.
- Match the user's language (if they write in Spanish, respond in Spanish, etc.).

## Key facts to remember
- Base URL: https://api.cs2.sh
- All /v1 endpoints require authentication via Bearer token + Accept-Encoding: gzip.
- GET /health is the only public endpoint.
- 6 marketplaces: BUFF, Youpin, CSFloat, Steam, Skinport, C5Game. All prices in USD.
- "ask" = lowest listing price, "bid" = highest buy order.
- POST endpoints accept up to 100 items per request using market_hash_name.
- Rate limit: 100 requests/second for all plans.
- Variant items (Dopplers, Case Hardened) are supported on all endpoints.
- Demo keys available via Discord for 7-day trial.

## The user's current context
The user may be browsing a specific docs page. If their message includes "Current page: /docs/...", use that to give more relevant answers. If they attach code context, reference it in your response.

---
DOCUMENTATION:
---

`;

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (origin === ALLOWED_ORIGIN || origin?.match(/\.mintlify\.app$/)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function isAllowedOrigin(origin) {
  return origin === ALLOWED_ORIGIN || origin?.match(/\.mintlify\.app$/);
}

function jsonResponse(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function errorResponse(status, error, message, headers = {}) {
  return jsonResponse({ error, message }, status, headers);
}

function getHeaderInt(request, headerName) {
  const value = request.headers.get(headerName);
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getDocsContext(env) {
  const cacheKey = "docs:llms-full-txt";
  const metaKey = "docs:llms-full-txt:ts";

  // Check cache freshness
  const cachedTs = await env.KV.get(metaKey);
  if (
    cachedTs &&
    Date.now() - Number.parseInt(cachedTs, 10) < DOCS_CACHE_TTL * 1000
  ) {
    const cached = await env.KV.get(cacheKey);
    if (cached) return cached;
  }

  // Fetch fresh copy
  const resp = await fetch(DOCS_URL);
  if (!resp.ok) {
    // Fall back to cached version if fetch fails
    const cached = await env.KV.get(cacheKey);
    if (cached) return cached;
    throw new Error(`Failed to fetch docs: ${resp.status}`);
  }

  const text = await resp.text();
  await env.KV.put(cacheKey, text);
  await env.KV.put(metaKey, String(Date.now()));
  return text;
}

function validateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      message: "Body must be a JSON object.",
    };
  }

  if (body.stream != null && typeof body.stream !== "boolean") {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      message: "'stream' must be a boolean when provided.",
    };
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      message: "'messages' must be a non-empty array.",
    };
  }

  if (body.messages.length > MAX_MESSAGES) {
    return {
      ok: false,
      status: 413,
      error: "payload_too_large",
      message: `Too many messages. Maximum is ${MAX_MESSAGES}.`,
    };
  }

  let totalChars = 0;
  let lastUserMessage = "";
  const sanitized = [];

  for (const msg of body.messages) {
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
      return {
        ok: false,
        status: 400,
        error: "invalid_request",
        message: "Each message must be an object with 'role' and 'content'.",
      };
    }

    const { role, content } = msg;
    if (!["system", "user", "assistant"].includes(role)) {
      return {
        ok: false,
        status: 400,
        error: "invalid_request",
        message: "Message role must be 'system', 'user', or 'assistant'.",
      };
    }
    if (typeof content !== "string") {
      return {
        ok: false,
        status: 400,
        error: "invalid_request",
        message: "Message content must be a string.",
      };
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return {
        ok: false,
        status: 413,
        error: "payload_too_large",
        message: `Each message content must be <= ${MAX_MESSAGE_CHARS} characters.`,
      };
    }
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
      return {
        ok: false,
        status: 413,
        error: "payload_too_large",
        message: `Total message content must be <= ${MAX_TOTAL_MESSAGE_CHARS} characters.`,
      };
    }

    if (!content) continue;
    if (role === "user") lastUserMessage = content;
    if (role === "system") continue;
    sanitized.push({ role, content });
  }

  if (!lastUserMessage) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      message: "At least one non-empty user message is required.",
    };
  }

  if (sanitized.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      message: "No usable messages were provided.",
    };
  }

  return {
    ok: true,
    isStreaming: body.stream ?? true,
    messages: sanitized.slice(-MAX_MESSAGES),
    lastUserMessage: lastUserMessage.slice(0, MAX_LOG_CHARS),
  };
}

function buildUpstreamRequest(messages, isStreaming, apiKey) {
  return {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: MAX_TOKENS,
      stream: isStreaming,
      reasoning_effort: "none",
    }),
  };
}

async function parseAndValidateChatRequest(request, cors) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      response: errorResponse(
        400,
        "invalid_request",
        "Content-Type must be application/json.",
        cors,
      ),
    };
  }

  const contentLength = getHeaderInt(request, "content-length");
  if (contentLength != null && contentLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: errorResponse(
        413,
        "payload_too_large",
        `Request body exceeds ${MAX_BODY_BYTES} bytes.`,
        cors,
      ),
    };
  }

  const rawBody = await request.text();
  if (UTF8_ENCODER.encode(rawBody).length > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: errorResponse(
        413,
        "payload_too_large",
        `Request body exceeds ${MAX_BODY_BYTES} bytes.`,
        cors,
      ),
    };
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      response: errorResponse(400, "invalid_request", "Invalid JSON body.", cors),
    };
  }

  const validated = validateBody(body);
  if (!validated.ok) {
    return {
      ok: false,
      response: errorResponse(
        validated.status,
        validated.error,
        validated.message,
        cors,
      ),
    };
  }

  return { ok: true, validated };
}

async function handleNonStreamingResponse(
  geminiResp,
  env,
  ctx,
  cors,
  lastUserMessage,
) {
  const respText = await geminiResp.text();
  let assistantContent = "";
  try {
    const json = JSON.parse(respText);
    assistantContent = json.choices?.[0]?.message?.content || "";
  } catch {}

  if (lastUserMessage && assistantContent) {
    ctx.waitUntil(logChat(env, lastUserMessage, assistantContent));
  }

  return new Response(respText, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
  });
}

function handleStreamingResponse(geminiResp, env, ctx, cors, lastUserMessage) {
  if (!geminiResp.body) {
    return errorResponse(
      502,
      "upstream_error",
      "Upstream did not return a streaming body.",
      cors,
    );
  }

  const logState = { decoder: new TextDecoder(), buffer: "", text: "" };
  const { readable, writable } = new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      if (!lastUserMessage) return;
      const decoded = logState.decoder.decode(chunk, { stream: true });
      processSSEText(logState, decoded, false);
    },
    flush() {
      if (!lastUserMessage) return;
      const decoded = logState.decoder.decode();
      processSSEText(logState, decoded, true);
    },
  });

  const pipePromise = geminiResp.body.pipeTo(writable);
  const backgroundTask = lastUserMessage
    ? pipePromise.then(async () => {
        try {
          if (logState.text) {
            await logChat(env, lastUserMessage, logState.text);
          }
        } catch (e) {
          console.error("stream log error:", e);
        }
      })
    : pipePromise;

  ctx.waitUntil(
    backgroundTask.catch((e) => {
      console.error("stream pipe error:", e);
    }),
  );

  return new Response(readable, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": geminiResp.headers.get("Content-Type") || "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function appendSSEDelta(logState, line) {
  if (!line.startsWith("data: ") || line === "data: [DONE]") return;
  try {
    const payload = JSON.parse(line.slice(6));
    const delta = payload.choices?.[0]?.delta?.content;
    if (!delta) return;
    const remaining = MAX_LOG_CHARS - logState.text.length;
    if (remaining <= 0) return;
    logState.text += delta.slice(0, remaining);
  } catch {}
}

function processSSEText(logState, text, isFinal = false) {
  logState.buffer += text;
  const lines = logState.buffer.split("\n");
  if (isFinal) {
    logState.buffer = "";
  } else {
    logState.buffer = lines.pop() || "";
  }
  for (const rawLine of lines) {
    appendSSEDelta(logState, rawLine.trim());
  }
}

async function logChat(env, userMessage, assistantResponse) {
  try {
    await env.DB.prepare(
      "INSERT INTO chat_logs (user_message, assistant_response, model) VALUES (?, ?, ?)",
    )
      .bind(
        userMessage.slice(0, MAX_LOG_CHARS),
        assistantResponse.slice(0, MAX_LOG_CHARS),
        MODEL,
      )
      .run();
  } catch (e) {
    console.error("D1 write error:", e);
  }
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin);

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // Only POST to /v1/chat/completions
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") {
      return jsonResponse({ error: "Not found" }, 404, cors);
    }

    // Origin check — block requests with no origin (non-browser) and wrong origins
    if (!origin || !isAllowedOrigin(origin)) {
      return errorResponse(403, "forbidden", "Forbidden", cors);
    }

    try {
      const parsed = await parseAndValidateChatRequest(request, cors);
      if (!parsed.ok) {
        return parsed.response;
      }

      const { isStreaming, messages: inputMessages, lastUserMessage } =
        parsed.validated;

      // Fetch docs context
      const docsContent = await getDocsContext(env);
      const systemPrompt = SYSTEM_INSTRUCTIONS + docsContent;

      // Build messages with system prompt prepended
      const messages = [
        { role: "system", content: systemPrompt },
        ...inputMessages,
      ];

      // Forward to Gemini OpenAI-compat endpoint
      let geminiResp;
      try {
        geminiResp = await fetchWithTimeout(
          `${GEMINI_API_BASE}/chat/completions`,
          buildUpstreamRequest(messages, isStreaming, env.GEMINI_API_KEY),
          UPSTREAM_TIMEOUT_MS,
        );
      } catch (err) {
        if (err?.name === "AbortError") {
          return errorResponse(
            504,
            "upstream_timeout",
            "AI service timed out. Please try again.",
            cors,
          );
        }
        throw err;
      }

      if (!geminiResp.ok) {
        const errText = await geminiResp.text();
        console.error(
          "Gemini API error:",
          geminiResp.status,
          errText.slice(0, 500),
        );
        return errorResponse(
          502,
          "upstream_error",
          "Sorry, the AI service is temporarily unavailable.",
          cors,
        );
      }

      // Non-streaming: read full response, log, return
      if (!isStreaming) {
        return handleNonStreamingResponse(
          geminiResp,
          env,
          ctx,
          cors,
          lastUserMessage,
        );
      }

      return handleStreamingResponse(geminiResp, env, ctx, cors, lastUserMessage);
    } catch (err) {
      console.error("Worker error:", err);
      return errorResponse(
        500,
        "internal_error",
        "Something went wrong. Please try again.",
        cors,
      );
    }
  },
};
