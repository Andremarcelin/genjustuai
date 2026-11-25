// api/mochi.js — rota de voz em turnos do GenJutsu Mochi (Vercel, Node 20+, ESM).
// Fluxo: WAV 16 kHz do Mochi -> transcrição (Groq Whisper) -> Corvo (Gemini, Groq se falhar)
//        -> voz (Gemini TTS, reamostrada para 16 kHz) -> JSON para o firmware.
// Cada etapa é cronometrada: campo "timing_ms", header "Server-Timing" e uma linha "mochi_timing" no log.
//
// Variáveis de ambiente: MOCHI_TOKEN (obrigatória), GEMINI_API_KEY (e _2.._9 opcionais), GROQ_API_KEY.
// Opcionais: MOCHI_TTS_MODEL, MOCHI_VOICE_NAME (ou GEN_VOICE_NAME), GEN_CHAT_PRIMARY=groq.

import crypto from "node:crypto";
import { mochiSystemPrompt, parseReply, speechStyle } from "../lib/mochi/persona.js";
import { chat, synthesize, transcribe } from "../lib/mochi/providers.js";
import { createTimer, serverTimingHeader } from "../lib/mochi/timing.js";
import { parseWav } from "../lib/mochi/wav.js";

export const MAX_AUDIO_BYTES = 1024 * 1024;    // 10 s a 16 kHz/16 bits = 320 KB; folga de sobra
const DEADLINE_MS = 17_000;                     // o firmware desiste em 20 s (http.setTimeout)
const RATE_LIMIT = 12, RATE_WINDOW_MS = 60_000;
const hits = new Map();

function rateOk(id, now = Date.now()) {
  const recent = (hits.get(id) || []).filter((t) => now - t < RATE_WINDOW_MS);
  const ok = recent.length < RATE_LIMIT;
  if (ok) recent.push(now);
  hits.set(id, recent);
  return ok;
}

function header(req, name) {
  const h = req?.headers || {};
  if (typeof h.get === "function") return h.get(name) || "";
  return h[name.toLowerCase()] || h[name] || "";
}

function tokenOk(given, expected) {
  if (!given || !expected) return false;
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

async function readBody(req, max) {
  if (Buffer.isBuffer(req?.body)) return req.body.length > max ? { tooLarge: true } : { body: req.body };
  if (typeof req?.body === "string") return { body: Buffer.from(req.body, "binary") };
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
    total += b.length;
    if (total > max) return { tooLarge: true };
    chunks.push(b);
  }
  return { body: Buffer.concat(chunks) };
}

export function createMochiHandler(deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const log = deps.log || ((obj) => console.info(JSON.stringify(obj)));
  const loadContext = deps.loadContext || (async () => "");  // futuro: memória do Mochi no Supabase
  const now = deps.now || (() => new Date());

  return async function handler(req, res) {
    const timer = createTimer();
    const deadline = performance.now() + DEADLINE_MS;
    const reply = (status, body) => {
      const timing_ms = timer.snapshot();
      res.setHeader("Server-Timing", serverTimingHeader(timing_ms));
      res.setHeader("Cache-Control", "no-store");
      log({ evt: "mochi_timing", status, error: body.error, timing_ms, ...(body.meta || {}) });
      res.status(status).json({ ...body, timing_ms });
    };

    if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
    const expected = env.MOCHI_TOKEN || env.MOCHI_DEVICE_TOKEN;
    if (!expected) return reply(503, { error: "missing_MOCHI_TOKEN" });
    if (!tokenOk(header(req, "x-mochi-token"), expected)) return reply(401, { error: "invalid_device_token" });
    const ip = String(header(req, "x-forwarded-for")).split(",")[0].trim() || req.socket?.remoteAddress || "?";
    if (!rateOk(ip)) return reply(429, { error: "rate_limited" });

    // 1) corpo (na Vercel o corpo costuma chegar já bufferizado: aqui mede só a cópia;
    //    o tempo de upload real aparece no firmware, em "envio+espera")
    const raw = await timer.stage("body", () => readBody(req, MAX_AUDIO_BYTES));
    if (raw.tooLarge) return reply(413, { error: "audio_too_large" });
    const wav = parseWav(raw.body);
    if (!wav || wav.pcm.length < 3200) return reply(400, { error: "invalid_audio" });
    const audioMs = Math.round((wav.pcm.length / 2 / wav.channels / wav.sampleRate) * 1000);

    // 2) STT (+ memória em paralelo)
    const [heard, memory] = await timer.stage("stt", () =>
      Promise.all([transcribe({ fetchImpl, env, wav: raw.body, deadline }), loadContext().catch(() => "")]));
    if (heard.error) return reply(502, { error: "stt_failed", detail: heard.detail || heard.error });
    if (!heard.text) {
      return reply(200, { text: "", transcript: "", emotion: "confused", audio: null,
        meta: { audio_in_ms: audioMs, note: "silencio" } });
    }

    // 3) chat no papel do Corvo
    const llm = await timer.stage("chat", () => chat({
      fetchImpl, env,
      system: mochiSystemPrompt({ now: now(), memory }),
      user: heard.text.slice(0, 1000),
      deadline,
    }));
    if (llm.error) return reply(502, { error: "llm_failed", detail: llm.fallback_errors, chat_attempts: llm.attempts });
    const ans = parseReply(llm.content);
    if (!ans.text) ans.text = "Hmm, me perdi aqui. Fala de novo?";

    // 4) voz
    const tts = await timer.stage("tts", () =>
      synthesize({ fetchImpl, env, text: ans.text, style: speechStyle(ans.emotion), deadline }));

    // 5) base64 + JSON
    const audio = await timer.stage("encode", async () =>
      tts.wav ? { mime: "audio/wav", sample_rate: 16000, data: tts.wav.toString("base64") } : null);

    const body = {
      text: ans.text,
      transcript: heard.text,
      emotion: ans.emotion,
      audio,
      meta: {
        audio_in_ms: audioMs,
        audio_out_ms: tts.wav ? Math.round(((tts.wav.length - 44) / 2 / 16000) * 1000) : 0,
        audio_out_bytes_b64: audio ? audio.data.length : 0,
        stt_model: heard.model,
        chat_provider: llm.provider,
        chat_model: llm.model,
        chat_attempts: llm.attempts?.length > 1 ? llm.attempts : undefined,
        chat_fallback_errors: llm.fallback_errors?.length ? llm.fallback_errors : undefined,
        reply_json_ok: ans.parsed,
        tts_model: tts.model || null,
        tts_error: tts.error,
        tts_attempts: tts.attempts,
      },
    };
    if (ans.alert) body.alert = ans.alert;   // contrato v1.2 do firmware: "alert" (ou "reminder")
    return reply(200, body);
  };
}

// O firmware desiste em 20 s; 30 s cobre o prazo interno de 17 s e a resposta.
export const maxDuration = 30;

export const config = {
  api: {
    // WAV cru. O parser JSON estraga os bytes e o limite padrão (1mb = 1_000_000)
    // fica abaixo de MAX_AUDIO_BYTES (1 MiB). A plataforma aceita até 4,5 MB.
    bodyParser: false,
  },
};

export default createMochiHandler();
