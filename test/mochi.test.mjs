import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMochiHandler, MAX_AUDIO_BYTES } from "../api/mochi.js";
import { EMOTIONS, mochiSystemPrompt, parseReply, speechStyle } from "../lib/mochi/persona.js";
import { budget, geminiKeys, ttsModels, voiceName } from "../lib/mochi/providers.js";
import { serverTimingHeader } from "../lib/mochi/timing.js";
import { makeWav, parseWav, resamplePcm16 } from "../lib/mochi/wav.js";

const TOKEN = "mochi-test-token";
const ENV = {
  MOCHI_TOKEN: TOKEN,
  GEMINI_API_KEY: "gemini-test-key",
  GEMINI_API_KEY_2: "gemini-test-key-2",
  GROQ_API_KEY: "groq-test-key",
};

let ipSeq = 0;
function nextIp() {
  ipSeq += 1;
  return `203.0.113.${ipSeq}`;
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; this.headersSent = true; return this; },
  };
}

function post({ token, body, ip = nextIp(), method = "POST", firmware = "1.2.0" } = {}) {
  const headers = {
    "content-type": "audio/wav",
    "x-forwarded-for": ip,
    "x-mochi-firmware": firmware,
  };
  if (token !== undefined) headers["x-mochi-token"] = token;
  return { method, headers, body };
}

function wavBytes(seconds = 0.25, sampleRate = 16000) {
  const samples = Math.ceil(sampleRate * seconds);
  const pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    pcm.writeInt16LE(Math.round(Math.sin(i / 12) * 8000), i * 2);
  }
  return makeWav(pcm, sampleRate);
}

function ttsPayload(seconds = 0.2) {
  return {
    steps: [{
      type: "model_output",
      content: [{ type: "audio", data: wavBytes(seconds, 24000).toString("base64") }],
    }],
  };
}

function chatJson(text, emotion, extra) {
  return {
    candidates: [{
      content: { parts: [{ text: JSON.stringify({ text, emotion, ...extra }) }] },
    }],
  };
}

function mockProviders({ groqText = "Oi Corvo, me lembra de beber água.", gemini, tts, onCall } = {}) {
  return async (url, opts) => {
    const target = String(url);
    onCall?.(target, opts);
    if (target.includes("/audio/transcriptions")) {
      return Response.json({ text: groqText });
    }
    if (target.includes(":generateContent")) {
      if (gemini instanceof Response) return gemini;
      if (typeof gemini === "function") return gemini(opts);
      return Response.json(chatJson("Pode deixar. Eu te aviso.", "happy", { alert: { text: "Beber água", in_min: 10 } }));
    }
    if (target.includes("/chat/completions")) {
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ text: "Pelo Groq.", emotion: "cool" }) } }],
      });
    }
    if (target.includes("/interactions")) {
      if (tts instanceof Response) return tts;
      return Response.json(ttsPayload());
    }
    throw new Error(`url inesperada ${target}`);
  };
}

function handler(extra = {}) {
  return createMochiHandler({ env: ENV, log() {}, fetchImpl: mockProviders(), ...extra });
}

test("vercel.json dá 30s ao mochi e mantém cron e rewrites", () => {
  const cfg = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(cfg.functions["api/mochi.js"].maxDuration, 30);
  assert.equal(Object.keys(cfg.functions).length, 1);
  assert.equal(cfg.crons[0].path, "/api/routines");
  assert.ok(cfg.rewrites.some((rule) => rule.source === "/gen" && rule.destination === "/gen.html"));
  const src = fs.readFileSync(new URL("../api/mochi.js", import.meta.url), "utf8");
  assert.match(src, /bodyParser:\s*false/);
  assert.equal(MAX_AUDIO_BYTES, 1024 * 1024);
});

test("401 sem token e com token errado", async () => {
  const fn = handler();
  const missing = mockRes();
  await fn(post({ body: wavBytes() }), missing);
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.body.error, "invalid_device_token");
  assert.ok(missing.headers["Server-Timing"]);
  assert.equal(typeof missing.body.timing_ms.total, "number");

  const wrong = mockRes();
  await fn(post({ token: "outro", body: wavBytes() }), wrong);
  assert.equal(wrong.statusCode, 401);
  assert.equal(JSON.stringify(wrong.body).includes(TOKEN), false);
});

test("503 sem MOCHI_TOKEN e 405 fora de POST", async () => {
  const fn = createMochiHandler({ env: { GROQ_API_KEY: "x" }, log() {} });
  const res = mockRes();
  await fn(post({ token: TOKEN, body: wavBytes() }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "missing_MOCHI_TOKEN");

  const method = mockRes();
  await handler()(post({ token: TOKEN, body: wavBytes(), method: "GET" }), method);
  assert.equal(method.statusCode, 405);
  assert.equal(method.body.error, "method_not_allowed");
});

test("200 JSON com WAV, emoção, alerta e áudio 16 kHz", async () => {
  let sttAuth = "";
  const fn = handler({
    fetchImpl: mockProviders({
      onCall(url, opts) {
        if (url.includes("/audio/transcriptions")) sttAuth = opts.headers.Authorization;
      },
    }),
  });
  const res = mockRes();
  await fn(post({ token: TOKEN, body: wavBytes() }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.match(res.headers["Server-Timing"], /stt;dur=\d+/);
  assert.match(res.headers["Server-Timing"], /chat;dur=\d+/);
  assert.match(res.headers["Server-Timing"], /tts;dur=\d+/);
  assert.match(res.headers["Server-Timing"], /total;dur=\d+/);
  assert.equal(res.body.text, "Pode deixar. Eu te aviso.");
  assert.equal(res.body.transcript, "Oi Corvo, me lembra de beber água.");
  assert.equal(res.body.emotion, "happy");
  assert.ok(EMOTIONS.includes(res.body.emotion));
  assert.deepEqual(res.body.alert, { text: "Beber água", in_min: 10 });
  assert.equal(res.body.audio.mime, "audio/wav");
  assert.equal(res.body.audio.sample_rate, 16000);
  const out = parseWav(Buffer.from(res.body.audio.data, "base64"));
  assert.equal(out.sampleRate, 16000);
  assert.equal(out.channels, 1);
  assert.equal(out.bits, 16);
  assert.ok(out.pcm.length >= 2);
  assert.equal(res.body.meta.chat_provider, "gemini");
  assert.equal(res.body.meta.tts_model, "gemini-3.8-flash-lite-tts");
  assert.equal(typeof res.body.timing_ms.total, "number");
  assert.equal(sttAuth, "Bearer groq-test-key");
  const dumped = JSON.stringify(res.body);
  assert.equal(dumped.includes("gemini-test-key"), false);
  assert.equal(dumped.includes("groq-test-key"), false);
});

test("aceita o WAV em stream e em string binária", async () => {
  const wav = wavBytes();
  const fn = handler();
  const streamed = mockRes();
  const req = post({ token: TOKEN, body: undefined });
  req[Symbol.asyncIterator] = async function* chunks() {
    yield wav.subarray(0, 80);
    yield wav.subarray(80);
  };
  await fn(req, streamed);
  assert.equal(streamed.statusCode, 200);
  assert.equal(streamed.body.emotion, "happy");

  const asString = mockRes();
  await fn(post({ token: TOKEN, body: wav.toString("latin1") }), asString);
  assert.equal(asString.statusCode, 200);
  assert.equal(asString.body.audio.sample_rate, 16000);
});

test("áudio acima de MAX_AUDIO_BYTES responde 413 e WAV inválido responde 400", async () => {
  const fn = handler();
  const tooBig = mockRes();
  await fn(post({ token: TOKEN, body: Buffer.alloc(MAX_AUDIO_BYTES + 1) }), tooBig);
  assert.equal(tooBig.statusCode, 413);
  assert.equal(tooBig.body.error, "audio_too_large");

  const atLimit = mockRes();
  const exact = Buffer.alloc(MAX_AUDIO_BYTES);
  wavBytes(0.3).copy(exact);
  await fn(post({ token: TOKEN, body: exact }), atLimit);
  assert.equal(atLimit.statusCode, 200);

  const bad = mockRes();
  await fn(post({ token: TOKEN, body: Buffer.alloc(4000, 1) }), bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.error, "invalid_audio");
});

test("silêncio devolve 200 sem áudio e emoção confused", async () => {
  const fn = handler({ fetchImpl: mockProviders({ groqText: "   " }) });
  const res = mockRes();
  await fn(post({ token: TOKEN, body: wavBytes() }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.text, "");
  assert.equal(res.body.emotion, "confused");
  assert.equal(res.body.audio, null);
  assert.equal(res.body.meta.note, "silencio");
});

test("Gemini 429 cai no Groq e TTS vazio deixa audio null", async () => {
  const fn = handler({
    fetchImpl: mockProviders({
      gemini: () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 }),
      tts: Response.json({ steps: [] }),
    }),
  });
  const res = mockRes();
  await fn(post({ token: TOKEN, body: wavBytes() }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.text, "Pelo Groq.");
  assert.equal(res.body.emotion, "cool");
  assert.equal(res.body.audio, null);
  assert.equal(res.body.meta.chat_provider, "groq");
  assert.equal(res.body.alert, undefined);
});

test("Gemini travado cai no Groq dentro do prazo do firmware", async () => {
  const calls = [];
  const fn = handler({
    fetchImpl: async (url, opts) => {
      const target = String(url);
      calls.push(target);
      if (target.includes("/audio/transcriptions")) return Response.json({ text: "que horas são?" });
      if (target.includes(":generateContent")) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("gemini nao abortou")), 15000);
          opts.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" }));
          }, { once: true });
        });
      }
      if (target.includes("/chat/completions")) {
        return Response.json({
          choices: [{ message: { content: JSON.stringify({ text: "São três.", emotion: "thinking" }) } }],
        });
      }
      if (target.includes("/interactions")) return Response.json(ttsPayload(0.05));
      throw new Error(`url inesperada ${target}`);
    },
  });
  const started = Date.now();
  const res = mockRes();
  await fn(post({ token: TOKEN, body: wavBytes() }), res);
  const elapsed = Date.now() - started;
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.text, "São três.");
  assert.equal(res.body.emotion, "thinking");
  assert.equal(res.body.meta.chat_provider, "groq");
  assert.ok(elapsed < 12_000, `resposta em ${elapsed} ms`);
  assert.ok(calls.some((url) => url.includes(":generateContent")));
  assert.ok(calls.some((url) => url.includes("/chat/completions")));
});

test("STT e chat esgotados respondem 502 sem vazar chave", async () => {
  const fn = handler({
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.includes("/audio/transcriptions")) {
        return new Response(JSON.stringify({ error: { message: "down" } }), { status: 503 });
      }
      throw new Error(`url inesperada ${target}`);
    },
  });
  const stt = mockRes();
  await fn(post({ token: TOKEN, body: wavBytes() }), stt);
  assert.equal(stt.statusCode, 502);
  assert.equal(stt.body.error, "stt_failed");

  const both = handler({
    fetchImpl: async (url) => {
      const target = String(url);
      if (target.includes("/audio/transcriptions")) return Response.json({ text: "oi" });
      return new Response(JSON.stringify({ error: { message: "down" } }), { status: 503 });
    },
  });
  const llm = mockRes();
  await both(post({ token: TOKEN, body: wavBytes() }), llm);
  assert.equal(llm.statusCode, 502);
  assert.equal(llm.body.error, "llm_failed");
  assert.equal(JSON.stringify(llm.body).includes("gemini-test-key"), false);
});

test("limite de 12 pedidos por minuto no mesmo IP", async () => {
  const fn = handler();
  const ip = nextIp();
  for (let n = 0; n < 12; n += 1) {
    const res = mockRes();
    await fn(post({ token: TOKEN, body: Buffer.alloc(0), ip }), res);
    assert.equal(res.statusCode, 400);
  }
  const blocked = mockRes();
  await fn(post({ token: TOKEN, body: wavBytes(), ip }), blocked);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.error, "rate_limited");
});

test("parser do Corvo, alerta e as 21 emoções", () => {
  assert.equal(EMOTIONS.length, 21);
  const parsed = parseReply('```json\n{"text":"Oi!","emotion":"HAPPY","alert":{"text":"Água","in_min":10}}\n```');
  assert.equal(parsed.parsed, true);
  assert.equal(parsed.text, "Oi!");
  assert.equal(parsed.emotion, "happy");
  assert.deepEqual(parsed.alert, { text: "Água", in_min: 10 });

  const clock = parseReply('{"text":"Às oito.","emotion":"relaxed","reminder":{"text":"Remédio","at":"08:00"}}');
  assert.deepEqual(clock.alert, { text: "Remédio", at: "08:00" });

  const unknown = parseReply("<think>hmm</think>{\"text\":\"*ok*\",\"emotion\":\"alegre\"}");
  assert.equal(unknown.emotion, "neutral");
  assert.equal(unknown.text, "ok");
  assert.equal(unknown.alert, null);

  const many = parseReply(JSON.stringify({
    text: "Dois avisos.",
    emotion: "winking",
    alert: [{ text: "Um", in_min: 1 }, { text: "Dois", in_sec: 30 }, { text: "" }],
  }));
  assert.equal(many.alert.length, 2);
  assert.deepEqual(many.alert[1], { text: "Dois", in_sec: 30 });

  const plain = parseReply("sem json nenhum");
  assert.equal(plain.parsed, false);
  assert.equal(plain.emotion, "neutral");
  assert.match(plain.text, /sem json/);

  const prompt = mochiSystemPrompt({ now: new Date("2026-11-25T15:00:00Z"), memory: "gosta de café" });
  for (const name of EMOTIONS) assert.match(prompt, new RegExp(name));
  assert.match(prompt, /gosta de café/);
  assert.match(prompt, /alert/);
  assert.match(speechStyle("sleepy"), /sonolento/);
});

test("WAV 24 kHz reamostra para 16 kHz e o header Server-Timing é seguro", () => {
  const src = wavBytes(0.1, 24000);
  const parsed = parseWav(src);
  assert.equal(parsed.sampleRate, 24000);
  const down = resamplePcm16(parsed.pcm, 24000, 16000);
  const back = parseWav(makeWav(down, 16000));
  assert.equal(back.sampleRate, 16000);
  assert.equal(back.pcm.length, Math.floor(parsed.pcm.length / 2 * (16000 / 24000)) * 2);
  assert.equal(parseWav(Buffer.from("nope")), null);
  assert.equal(serverTimingHeader({ stt: 12, "chat ms": 4, skip: Number.NaN }), "stt;dur=12, chat_ms;dur=4");
});

test("chaves, voz e orçamento de tempo", () => {
  assert.deepEqual(geminiKeys({ GEMINI_API_KEY: " a ", GEMINI_API_KEY_2: "", GEMINI_API_KEY_9: "z" }), ["a", "z"]);
  assert.deepEqual(ttsModels({}), ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"]);
  assert.deepEqual(ttsModels({ MOCHI_TTS_MODEL: "gemini-3.8-flash-tts" })[0], "gemini-3.8-flash-tts");
  assert.equal(voiceName({}), "Charon");
  assert.equal(voiceName({ GEN_VOICE_NAME: "Puck" }), "Puck");
  assert.equal(voiceName({ MOCHI_VOICE_NAME: "Orus", GEN_VOICE_NAME: "Puck" }), "Orus");
  assert.equal(voiceName({ MOCHI_VOICE_NAME: "não vale" }), "Charon");
  assert.equal(budget(4000), 4000);
  const soon = budget(4000, performance.now() + 250);
  assert.ok(soon > 0 && soon <= 250);
  assert.equal(budget(4000, performance.now() - 5), 0);
});
