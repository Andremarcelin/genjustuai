// Chamadas externas do /api/mochi: STT (Groq Whisper), chat (Gemini -> Groq) e voz (Gemini TTS).
// Modelos e endpoints conferidos em 2026-11-24:
//   Gemini TTS (Interactions API): https://ai.google.dev/gemini-api/docs/speech-generation
//   Groq STT: https://console.groq.com/docs/speech-to-text
// Mesmos modelos de texto que o genjustuai usa em lib/gen/constants.js.

import { makeWav, parseWav, resamplePcm16 } from "./wav.js";

export const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_STT_MODEL = "whisper-large-v3-turbo";
export const GROQ_CHAT_MODEL = "openai/gpt-oss-20b";
export const GEMINI_TEXT_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_TTS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
// O Flash-Lite TTS é o indicado pela doc para "conversational voice agent cascades" (mais rápido).
export const DEFAULT_TTS_MODELS = ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"];
export const DEFAULT_VOICE = "Charon";
export const MOCHI_SAMPLE_RATE = 16000;

// Cada tentativa usa o menor entre o seu timeout e o que sobra até o prazo final da rota
// (o firmware desiste em 20 s; a rota mira 17 s para ainda responder com erro a tempo).
export function budget(timeoutMs, deadline) {
  if (!deadline) return timeoutMs;
  return Math.max(0, Math.min(timeoutMs, Math.round(deadline - performance.now())));
}

const secret = (env, name) => String(env?.[name] || "").trim();

export function geminiKeys(env) {
  const names = ["GEMINI_API_KEY"];
  for (let n = 2; n <= 9; n += 1) names.push(`GEMINI_API_KEY_${n}`);
  return names.map((n) => secret(env, n)).filter(Boolean);
}

export function ttsModels(env) {
  const forced = secret(env, "MOCHI_TTS_MODEL");
  return forced ? [forced, ...DEFAULT_TTS_MODELS.filter((m) => m !== forced)] : DEFAULT_TTS_MODELS;
}

export function voiceName(env) {
  const raw = secret(env, "MOCHI_VOICE_NAME") || secret(env, "GEN_VOICE_NAME");
  return /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(raw) ? raw : DEFAULT_VOICE;
}

async function jsonOf(res) {
  try { return await res.json(); } catch { return null; }
}

function errMsg(json, status) {
  return String(json?.error?.message || json?.error || `http_${status}`).slice(0, 160);
}

// ---------- STT ----------
export async function transcribe({ fetchImpl, env, wav, timeoutMs = 6000, deadline }) {
  const key = secret(env, "GROQ_API_KEY");
  if (!key) return { error: "missing_GROQ_API_KEY" };
  const send = () => {
    const form = new FormData();
    form.append("file", new Blob([wav], { type: "audio/wav" }), "mochi.wav");
    form.append("model", GROQ_STT_MODEL);
    form.append("language", "pt");
    form.append("response_format", "json");
    form.append("temperature", "0");
    return fetchImpl(GROQ_TRANSCRIBE_URL, {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
      signal: AbortSignal.timeout(budget(timeoutMs, deadline) || 1),
    });
  };
  try {
    let res = await send();
    if (res.status === 429 || res.status >= 500) res = await send();
    const json = await jsonOf(res);
    if (!res.ok || typeof json?.text !== "string") return { error: `stt_${res.status}`, detail: errMsg(json, res.status) };
    return { text: json.text.trim(), model: GROQ_STT_MODEL };
  } catch (e) {
    return { error: "stt_unreachable", detail: String(e?.message || e) };
  }
}

// ---------- chat ----------
async function chatGemini({ fetchImpl, env, system, user, timeoutMs, deadline }) {
  const keys = geminiKeys(env);
  if (!keys.length) return { error: "missing_GEMINI_API_KEY" };
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 200, responseMimeType: "application/json" },
  };
  let last = { error: "gemini_failed" };
  const attempts = [];
  for (let i = 0; i < keys.length; i += 1) {
    const ms = budget(timeoutMs, deadline);
    if (ms < 500) break;
    const t0 = performance.now();
    const note = (status, error) => attempts.push({ key: i + 1, status, ms: Math.round(performance.now() - t0), error });
    try {
      const res = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": keys[i] },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(ms),
        },
      );
      const json = await jsonOf(res);
      if (!res.ok) {
        last = { error: `gemini_${res.status}`, detail: errMsg(json, res.status) };
        note(res.status, last.detail); continue;
      }
      const text = (json?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      if (!text.trim()) { last = { error: "gemini_empty" }; note(200, "empty"); continue; }
      note(200);
      return { content: text, provider: "gemini", model: GEMINI_TEXT_MODEL, attempts };
    } catch (e) {
      last = { error: "gemini_unreachable", detail: String(e?.message || e) };
      note(0, last.detail);
      break;            // lentidão/rede não é culpa da chave: vai direto para o Groq
    }
  }
  return { ...last, attempts };
}

async function chatGroq({ fetchImpl, env, system, user, timeoutMs, deadline }) {
  const key = secret(env, "GROQ_API_KEY");
  if (!key) return { error: "missing_GROQ_API_KEY" };
  try {
    const res = await fetchImpl(GROQ_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: GROQ_CHAT_MODEL,
        temperature: 0.6,
        max_tokens: 400,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(budget(timeoutMs + 1500, deadline) || 1),
    });
    const json = await jsonOf(res);
    const content = json?.choices?.[0]?.message?.content;
    if (!res.ok || !content) return { error: `groq_${res.status}`, detail: errMsg(json, res.status) };
    return { content, provider: "groq", model: GROQ_CHAT_MODEL };
  } catch (e) {
    return { error: "groq_unreachable", detail: String(e?.message || e) };
  }
}

// Gemini Flash-Lite costuma responder em < 1,5 s: 4 s por chave evita ficar preso numa chamada lenta.
export async function chat({ fetchImpl, env, system, user, timeoutMs = 4000, deadline }) {
  const order = secret(env, "GEN_CHAT_PRIMARY").toLowerCase() === "groq" ? [chatGroq, chatGemini] : [chatGemini, chatGroq];
  const errors = [];
  let attempts = [];
  for (const fn of order) {
    const r = await fn({ fetchImpl, env, system, user, timeoutMs, deadline });
    if (r.attempts) attempts = r.attempts;
    if (!r.error) return { ...r, attempts, fallback_errors: errors };
    errors.push(r.error + (r.detail ? `: ${r.detail}` : ""));
  }
  return { error: "llm_failed", attempts, fallback_errors: errors };
}

// ---------- TTS ----------
// Teste real em 2026-11-24: "sample_rate": 16000 no response_format volta 400 (invalid argument),
// apesar da doc citar 16000. Então pedimos o WAV padrão (24 kHz) e reamostramos aqui para 16 kHz,
// que é a taxa fixa do alto-falante do Mochi.
export async function synthesize({ fetchImpl, env, text, style, timeoutMs = 9000, deadline }) {
  const keys = geminiKeys(env);
  if (!keys.length) return { error: "missing_GEMINI_API_KEY", attempts: [] };
  if (!text) return { error: "empty_text", attempts: [] };
  const attempts = [];
  for (const model of ttsModels(env)) {
    for (let i = 0; i < keys.length; i += 1) {
      const limit = budget(timeoutMs, deadline);
      if (limit < 800) return { error: "tts_no_time_left", attempts };
      const t0 = performance.now();
      try {
        const res = await fetchImpl(GEMINI_TTS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": keys[i] },
          body: JSON.stringify({
            model,
            input: [{ type: "user_input", content: [{ type: "text", text,
              annotations: [{ type: "speech_metadata", style }] }] }],
            response_format: { type: "audio", mime_type: "audio/wav" },
            generation_config: { speech_config: [{ voice: voiceName(env) }] },
          }),
          signal: AbortSignal.timeout(limit),
        });
        const json = await jsonOf(res);
        const ms = Math.round(performance.now() - t0);
        if (!res.ok) {
          attempts.push({ model, key: i + 1, status: res.status, ms, error: errMsg(json, res.status) });
          if (res.status === 400 || res.status === 404) break;     // modelo/argumento ruim: próximo modelo
          continue;                                                // 429/5xx/403: próxima chave
        }
        const audio = (json?.steps || [])
          .filter((s) => s.type === "model_output")
          .flatMap((s) => s.content || [])
          .filter((c) => c.type === "audio" && c.data)
          .pop();
        if (!audio) { attempts.push({ model, key: i + 1, status: 200, ms, error: "no_audio" }); continue; }
        attempts.push({ model, key: i + 1, status: 200, ms });
        const raw = Buffer.from(audio.data, "base64");
        const w = parseWav(raw);
        const pcm24 = w ? w.pcm : raw;                              // audio/l16 sem cabeçalho = 24 kHz
        const rate = w ? w.sampleRate : 24000;
        const pcm16 = resamplePcm16(pcm24, rate, MOCHI_SAMPLE_RATE);
        return { wav: makeWav(pcm16, MOCHI_SAMPLE_RATE), model, source_rate: rate, attempts };
      } catch (e) {
        attempts.push({ model, key: i + 1, ms: Math.round(performance.now() - t0), error: String(e?.message || e) });
      }
    }
  }
  return { error: "tts_failed", attempts };
}
