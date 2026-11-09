import {
  GEMINI_AUTH_URL,
  GEMINI_LIVE_MODEL,
  GEMINI_LIVE_RESOURCE,
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

const GEMINI_KEY_NAMES = ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3"];

export function geminiKeys(env) {
  return GEMINI_KEY_NAMES.map((name) => secret(env, name)).filter(Boolean);
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
  const keys = GEMINI_KEY_NAMES.map((name, i) => ({
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

export async function completeChat({ fetchImpl, env, messages, tools, toolChoice }) {
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
    response = await groqFetch(fetchImpl, GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
  const message = json?.choices?.[0]?.message;
  if (!response.ok || !message) return { error: "provider_unreachable" };
  return { message };
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
