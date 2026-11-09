import {
  GEMINI_AUTH_URL,
  GEMINI_GENERATE_URL,
  GEMINI_LIVE_MODEL,
  GEMINI_LIVE_RESOURCE,
  GEMINI_TEXT_MODEL,
  GEMINI_WS_URL,
  GROQ_CHAT_MODEL,
  GROQ_CHAT_URL,
  GROQ_STT_MODEL,
  GROQ_TRANSCRIBE_URL,
  TOKEN_LIFE_MS,
  TOKEN_START_MS,
} from "./constants.js";
import { buildSystemInstruction } from "./persona.js";
import { resolveVoiceName } from "./voice.js";
import { TOOLS, toGeminiDeclarations } from "./tools.js";
import { audioExtension } from "./multipart.js";

function secret(env, name) {
  return String(env?.[name] || "").trim();
}

export function geminiKeyNames() {
  const names = ["GEMINI_API_KEY"];
  for (let n = 2; n <= 9; n += 1) names.push(`GEMINI_API_KEY_${n}`);
  return names;
}

export function geminiKeys(env) {
  return geminiKeyNames().map((name) => secret(env, name)).filter(Boolean);
}

function geminiShouldRotate(status) {
  return status === 401 || status === 403 || status === 429 || status >= 500;
}

function groqShouldRetry(status) {
  return status === 429 || status >= 500;
}

function logGeminiAttempt(keyIndex, status) {
  console.info("gemini_live_token", { key_index: keyIndex, status });
}

export function liveSetup({ systemInstruction, voiceName }) {
  return {
    model: GEMINI_LIVE_RESOURCE,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        languageCode: "pt-BR",
      },
    },
    systemInstruction: { parts: [{ text: systemInstruction }] },
    tools: [{ functionDeclarations: toGeminiDeclarations() }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: {},
  };
}

export function wsUrlForToken(token) {
  return `${GEMINI_WS_URL}?access_token=${encodeURIComponent(token)}`;
}

export async function createLiveToken({ fetchImpl, env, session, state, memory, now = Date.now() }) {
  const keys = geminiKeyNames().map((name, i) => ({
    value: secret(env, name),
    index: i + 1,
  })).filter((slot) => slot.value);
  if (!keys.length) {
    return {
      error: "missing_config",
      hint: "Defina GEMINI_API_KEY na Vercel. A chave fica só no servidor.",
    };
  }
  const voiceName = resolveVoiceName(env);
  const systemInstruction = buildSystemInstruction(session, state, memory);
  const expireTime = new Date(now + TOKEN_LIFE_MS).toISOString();
  const newSessionExpireTime = new Date(now + TOKEN_START_MS).toISOString();
  const body = JSON.stringify({
    uses: 1,
    expireTime,
    newSessionExpireTime,
    bidiGenerateContentSetup: liveSetup({ systemInstruction, voiceName }),
  });

  for (const slot of keys) {
    const keyIndex = slot.index;
    let response;
    try {
      response = await fetchImpl(GEMINI_AUTH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": slot.value,
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      logGeminiAttempt(keyIndex, "network");
      continue;
    }
    logGeminiAttempt(keyIndex, response.status);
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (response.ok && json && typeof json.name === "string" && json.name.trim()) {
      const token = json.name.trim();
      return {
        provider: "gemini",
        model: GEMINI_LIVE_MODEL,
        token,
        expiresAt: typeof json.expireTime === "string" ? json.expireTime : expireTime,
        wsUrl: wsUrlForToken(token),
        systemInstruction,
        tools: TOOLS,
        voiceName,
      };
    }
    if (geminiShouldRotate(response.status)) continue;
    break;
  }
  return { error: "gemini_unavailable", fallback: "groq" };
}

export async function transcribeAudio({ fetchImpl, env, audio, mime }) {
  const apiKey = secret(env, "GROQ_API_KEY");
  if (!apiKey) {
    return {
      error: "missing_config",
      hint: "Defina GROQ_API_KEY na Vercel. A chave fica só no servidor.",
    };
  }
  const form = new FormData();
  const filename = `audio.${audioExtension(mime)}`;
  form.append("file", new Blob([audio], { type: mime || "application/octet-stream" }), filename);
  form.append("model", GROQ_STT_MODEL);
  form.append("language", "pt");
  form.append("response_format", "json");
  let response;
  try {
    response = await groqFetch(fetchImpl, GROQ_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      timeoutMs: 20000,
    });
  } catch {
    return { error: "provider_unreachable" };
  }
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok || !json || typeof json.text !== "string") return { error: "provider_unreachable" };
  return { text: json.text.trim() };
}

export function chatPrimary(env) {
  const raw = String(env?.GEN_CHAT_PRIMARY || "gemini").trim().toLowerCase();
  return raw === "groq" ? "groq" : "gemini";
}

function groqRetryable(status) {
  return status === 429 || status >= 500;
}

async function completeGroqOnce({ fetchImpl, env, messages, tools, toolChoice }) {
  const apiKey = secret(env, "GROQ_API_KEY");
  if (!apiKey) {
    return {
      error: "missing_config",
      hint: "Defina GROQ_API_KEY na Vercel. A chave fica só no servidor.",
    };
  }
  const body = {
    model: GROQ_CHAT_MODEL,
    temperature: 0.4,
    max_tokens: 220,
    messages,
  };
  if (tools) {
    body.tools = tools;
    body.tool_choice = toolChoice || "auto";
  } else if (toolChoice) {
    body.tool_choice = toolChoice;
  }
  let response;
  try {
    // completeChat already retries once; do not also retry inside groqFetch here.
    response = await fetchImpl(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return { error: "provider_unreachable", retryable: true };
  }
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok) {
    return {
      error: "provider_unreachable",
      retryable: groqRetryable(response.status),
      status: response.status,
    };
  }
  const message = json?.choices?.[0]?.message;
  if (!message) return { error: "provider_unreachable", retryable: true };
  return { message, provider: "groq", model: GROQ_CHAT_MODEL };
}

function openaiToGeminiContents(messages) {
  const system = [];
  const contents = [];
  for (const item of messages || []) {
    if (item.role === "system") {
      system.push(item.content || "");
      continue;
    }
    if (item.role === "tool") {
      contents.push({
        role: "user",
        parts: [{
          functionResponse: {
            name: item.name || "tool",
            response: { result: item.content || "" },
          },
        }],
      });
      continue;
    }
    if (item.role === "assistant") {
      const parts = [];
      if (item.content) parts.push({ text: String(item.content) });
      for (const call of item.tool_calls || []) {
        let args = {};
        try {
          args = typeof call?.function?.arguments === "string"
            ? JSON.parse(call.function.arguments || "{}")
            : (call?.function?.arguments || {});
        } catch {
          args = {};
        }
        parts.push({ functionCall: { name: call?.function?.name || "unknown", args } });
      }
      contents.push({ role: "model", parts: parts.length ? parts : [{ text: "" }] });
      continue;
    }
    contents.push({ role: "user", parts: [{ text: String(item.content || "") }] });
  }
  return { system: system.filter(Boolean).join("\n"), contents };
}

function geminiToOpenaiMessage(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((part) => typeof part.text === "string").map((part) => part.text).join(" ").trim();
  const calls = parts.filter((part) => part.functionCall?.name).map((part, index) => ({
    id: `gemini_${index}`,
    type: "function",
    function: {
      name: part.functionCall.name,
      arguments: JSON.stringify(part.functionCall.args || {}),
    },
  }));
  return {
    role: "assistant",
    content: text,
    tool_calls: calls.length ? calls : undefined,
  };
}

export function parseGroundingChunks(json) {
  const candidate = json?.candidates?.[0] || {};
  const meta = candidate.groundingMetadata || candidate.grounding_metadata || {};
  const chunks = meta.groundingChunks || meta.grounding_chunks || [];
  const hits = [];
  for (const chunk of chunks) {
    const web = chunk.web || chunk.Web || {};
    const url = String(web.uri || web.url || "").slice(0, 300);
    const title = String(web.title || "Fonte").slice(0, 160);
    if (!url) continue;
    hits.push({ title, url, snippet: "" });
    if (hits.length >= 2) break;
  }
  return hits;
}

async function geminiGenerate({ fetchImpl, apiKey, payload }) {
  const response = await fetchImpl(GEMINI_GENERATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json().catch(() => null);
  return { response, json };
}

async function completeGeminiChat({ fetchImpl, env, messages, tools, toolChoice }) {
  const keys = geminiKeys(env);
  if (!keys.length) return { error: "provider_unreachable", retryable: true };
  const mapped = openaiToGeminiContents(messages);
  const withTools = Boolean(tools) && toolChoice !== "none";
  const payload = {
    systemInstruction: mapped.system ? { parts: [{ text: mapped.system }] } : undefined,
    contents: mapped.contents.length ? mapped.contents : [{ role: "user", parts: [{ text: " " }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 220 },
  };
  if (withTools) {
    payload.tools = [{ functionDeclarations: toGeminiDeclarations() }];
    payload.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  } else {
    payload.toolConfig = { functionCallingConfig: { mode: "NONE" } };
  }
  for (const apiKey of keys) {
    try {
      const { response, json } = await geminiGenerate({ fetchImpl, apiKey, payload });
      if (!response.ok) {
        if (geminiShouldRotate(response.status)) continue;
        continue;
      }
      const message = geminiToOpenaiMessage(json);
      if (!message.content && !message.tool_calls?.length) continue;
      return { message, provider: "gemini", model: GEMINI_TEXT_MODEL };
    } catch {
      continue;
    }
  }
  if (withTools) {
    return completeGeminiChat({ fetchImpl, env, messages, tools: null, toolChoice: "none" });
  }
  return { error: "provider_unreachable", retryable: true };
}

export async function searchGeminiGrounded({ fetchImpl, env, query }) {
  const keys = geminiKeys(env);
  const q = String(query || "").trim().slice(0, 160);
  if (!keys.length || !q) return { hits: [], grounded: false, text: "" };
  const makePayload = (tool) => ({
    contents: [{
      role: "user",
      parts: [{
        text: `Responda em português do Brasil, em no máximo 3 frases, com informação atual. Pergunta: ${q}`,
      }],
    }],
    tools: [tool],
    generationConfig: { temperature: 0.2, maxOutputTokens: 280 },
  });
  const toolShapes = [{ google_search: {} }, { googleSearch: {} }];
  for (const apiKey of keys) {
    for (const tool of toolShapes) {
      try {
        const { response, json } = await geminiGenerate({
          fetchImpl,
          apiKey,
          payload: makePayload(tool),
        });
        if (!response.ok) {
          if (response.status === 400) break;
          if (geminiShouldRotate(response.status)) break;
          break;
        }
        const text = geminiToOpenaiMessage(json).content || "";
        const hits = parseGroundingChunks(json);
        if (text || hits.length) {
          return {
            hits,
            grounded: hits.length > 0,
            text,
            provider: "gemini",
            model: GEMINI_TEXT_MODEL,
          };
        }
      } catch {
        break;
      }
    }
  }
  return { hits: [], grounded: false, text: "" };
}

async function completeGroqChat({ fetchImpl, env, messages, tools, toolChoice }) {
  let last = { error: "provider_unreachable", retryable: true };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    last = await completeGroqOnce({ fetchImpl, env, messages, tools, toolChoice });
    if (!last.error) return last;
    if (last.error === "missing_config") return last;
    if (!last.retryable) break;
  }
  return last;
}

export async function completeChat({ fetchImpl, env, messages, tools, toolChoice }) {
  const order = chatPrimary(env) === "groq" ? ["groq", "gemini"] : ["gemini", "groq"];
  let last = { error: "provider_unreachable" };
  for (const name of order) {
    last = name === "gemini"
      ? await completeGeminiChat({ fetchImpl, env, messages, tools, toolChoice })
      : await completeGroqChat({ fetchImpl, env, messages, tools, toolChoice });
    if (!last.error) return last;
    if (last.error === "missing_config" && order.length > 1) continue;
  }
  return last;
}

async function groqFetch(fetchImpl, url, { timeoutMs, ...opts }) {
  const once = () => fetchImpl(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
  const response = await once();
  if (!groqShouldRetry(response.status)) return response;
  return once();
}

export function visibleReply(content) {
  let text = content;
  if (Array.isArray(text)) {
    text = text.map((part) => (typeof part === "string" ? part : part?.text || "")).join(" ");
  }
  return String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, 600);
}

export function parseToolArguments(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (raw == null) return {};
  return null;
}
