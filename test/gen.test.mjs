import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { supabaseRest } from "../lib/supabase-rest.cjs";
import { DEFAULT_AMBIENCE, DEFAULT_LIGHTS, STATE_KEYS, defaultHouseState } from "../lib/gen/defaults.js";
import { buildSystemInstruction, chooseReply, fallbackReply } from "../lib/gen/persona.js";
import { composeMemory } from "../lib/gen/history.js";
import { TOOLS, toGeminiDeclarations, toGroqTools, validateToolCall } from "../lib/gen/tools.js";
import { createMemoryHouseStore } from "../lib/gen/house-store.js";
import { createSupabaseHouseStore } from "../lib/gen/house-store.js";
import { executeHouseTool } from "../lib/gen/executor.js";
import { createRateLimiter } from "../lib/gen/rate-limit.js";
import { parseMultipart } from "../lib/gen/multipart.js";
import { createHouseStateHandler } from "../api/house/state.js";
import { createCommandsHandler } from "../api/gen/commands.js";
import { createVoiceHandler } from "../api/gen/voice-session.js";
import { createChatHandler } from "../api/gen/chat.js";
import { GEMINI_LIVE_MODEL, GEMINI_LIVE_RESOURCE, GROQ_CHAT_MODEL, GROQ_STT_MODEL } from "../lib/gen/constants.js";
import { resolveVoiceName } from "../lib/gen/voice.js";
import { pickPtBrMaleVoice, SPEECH_FALLBACK_PITCH } from "../js/gen-voice.js";

const SESSION = {
  id: "AB3K7Q",
  session_code: "AB3K7Q",
  display_name: "Lina",
  personality_text: "SEGREDO_DO_QUIZ",
  archetype: "Zen",
  profile_id: "Zen",
  status: "active",
  clima_ambiente: "tranquilo",
  clima_tempo: "frio",
};

const LIGHTS = {
  zone: "main",
  intensity: 0.25,
  color: "#00ffaa",
  transition_ms: 800,
};

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; this.headersSent = true; return this; },
    end() { this.headersSent = true; return this; },
  };
}

function activeSession() {
  return async () => ({ session: SESSION });
}

function noSession() {
  return async () => ({ session: null });
}

async function withEnv(env, fn) {
  const keys = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE", "GEMINI_API_KEY", "GROQ_API_KEY"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, env);
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function limiter(limit = 20) {
  return createRateLimiter({ limit, windowMs: 60_000 });
}

test("persona uses the name and profile and does not reveal the quiz", () => {
  const text = buildSystemInstruction(SESSION);
  assert.match(text, /português do Brasil/);
  assert.match(text, /1 a 3 frases/);
  assert.match(text, /Lina/);
  assert.match(text, /Zen/);
  assert.match(text, /switch_dojo/);
  assert.match(text, /status accepted/);
  assert.doesNotMatch(text, /SEGREDO_DO_QUIZ/);
  assert.doesNotMatch(text, /tranquilo/);
  assert.doesNotMatch(text, /frio/);
  assert.doesNotMatch(text, /clima_/);
  assert.match(buildSystemInstruction({ display_name: "A\nB", profile_id: "Excentrico" }), /se chama A B\./);
  assert.match(buildSystemInstruction({ profile_id: "Excentrico" }), /Excêntrico/);
  assert.match(text, /Não peça para repetir/);
  const withHouse = buildSystemInstruction(SESSION, {
    mode: "hub",
    dojo: null,
    lights: {
      main: { intensity: 0.8, color: "#FFAA00" },
      lanterns: { intensity: 0.2, color: "#FF1A1A" },
    },
    ambience: { preset: "bamboo", volume: 0.3 },
  });
  assert.match(withHouse, /#FFAA00/);
  assert.match(withHouse, /intensidade 0\.8/);
  assert.match(withHouse, /bamboo volume 0\.3/);
  assert.match(withHouse, /já está assim/);
  assert.doesNotMatch(withHouse, /SEGREDO_DO_QUIZ/);
  assert.doesNotMatch(withHouse, /tranquilo/);
});

test("chat and live prompts include the visitor's prior turns", async () => {
  const older = [];
  for (let i = 0; i < 6; i += 1) older.push({ role: "visitor", kind: "transcript", body: `fala antiga ${i} `.repeat(40) });
  older.push({ role: "house", kind: "action", body: "Colocou o som de bambu." });
  const recent = [
    { role: "visitor", kind: "transcript", body: "deixa a luz bem azul" },
    { role: "house", kind: "action", body: "Ajustou a luz da casa." },
    { role: "gen", kind: "reply", body: "Pronto. Deixei a luz azul." },
  ];
  const memory = composeMemory(older.concat(recent), { recentTurns: 3, budgetChars: 500 });
  assert.match(memory, /deixa a luz bem azul/);
  assert.match(memory, /Pronto\. Deixei a luz azul/);
  assert.match(memory, /Ajustou a luz da casa/);
  assert.match(memory, /falas anteriores/);
  assert.match(memory, /Colocou o som de bambu/);
  assert.ok(memory.length <= 500);
  const prompt = buildSystemInstruction(SESSION, null, memory);
  assert.match(prompt, /deixa a luz bem azul/);
  assert.match(prompt, /Memória desta sessão/);
  assert.doesNotMatch(prompt, /SEGREDO_DO_QUIZ/);

  let system = "";
  const handler = createChatHandler({
    loadSession: activeSession(),
    store: createMemoryHouseStore(),
    env: { GROQ_API_KEY: "groq-secret" },
    chatLimiter: limiter(),
    ipLimiter: limiter(),
    commandLimiter: limiter(),
    loadMemory: async () => memory,
    fetchImpl: async (_url, opts) => {
      system = JSON.parse(opts.body).messages[0].content;
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "Pode deixar.", tool_calls: [] } }],
      }), { status: 200 });
    },
  });
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { text: "e agora?" },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.match(system, /deixa a luz bem azul/);
  assert.match(system, /Pronto\. Deixei a luz azul/);
  assert.equal(JSON.stringify(res.body).includes("groq-secret"), false);

  let liveText = "";
  const voice = createVoiceHandler({
    loadSession: activeSession(),
    store: createMemoryHouseStore(),
    env: { GEMINI_API_KEY: "gemini-secret" },
    limiter: limiter(),
    ipLimiter: limiter(),
    loadMemory: async () => memory,
    fetchImpl: async (_url, opts) => {
      liveText = JSON.parse(opts.body).bidiGenerateContentSetup.systemInstruction.parts[0].text;
      return new Response(JSON.stringify({ name: "ephemeral-token" }), { status: 200 });
    },
  });
  const live = mockRes();
  await voice({ method: "POST", headers: {}, body: {} }, live);
  assert.equal(live.statusCode, 200);
  assert.match(live.body.systemInstruction, /deixa a luz bem azul/);
  assert.equal(liveText, live.body.systemInstruction);
  assert.equal(JSON.stringify(live.body).includes("gemini-secret"), false);
});

test("tool schemas reject unknown fields and out-of-range values", () => {
  assert.equal(validateToolCall("get_house_state", {}).ok, true);
  assert.equal(validateToolCall("get_house_state", { zone: "main" }).reason, "invalid_args");
  assert.equal(validateToolCall("nope", {}).reason, "unknown_tool");
  const ok = validateToolCall("set_lights", { ...LIGHTS, intensity: "0.25", transition_ms: "800" });
  assert.equal(ok.ok, true);
  assert.equal(ok.args.intensity, 0.25);
  assert.equal(ok.args.transition_ms, 800);
  assert.equal(validateToolCall("set_lights", { ...LIGHTS, extra: true }).reason, "invalid_args");
  assert.equal(validateToolCall("set_lights", { ...LIGHTS, intensity: 1.2 }).reason, "invalid_args");
  assert.equal(validateToolCall("set_lights", { ...LIGHTS, color: "red" }).reason, "invalid_args");
  assert.equal(validateToolCall("set_lights", { ...LIGHTS, transition_ms: 299 }).reason, "invalid_args");
  assert.equal(validateToolCall("set_lights", { ...LIGHTS, zone: "hall" }).reason, "invalid_args");
  assert.equal(validateToolCall("set_ambience", { preset: "rain", volume: 0.5, transition_ms: 500 }).ok, true);
  assert.equal(validateToolCall("set_ambience", { preset: "rain", volume: 0.51, transition_ms: 500 }).reason, "invalid_args");
  assert.equal(validateToolCall("switch_dojo", { dojo: "zen", transition_ms: 2000 }).reason, "invalid_args");
  assert.equal(validateToolCall("switch_dojo", { dojo: "Excentrico", transition_ms: 2000 }).ok, true);

  for (const tool of TOOLS) {
    assert.equal(tool.parameters.additionalProperties, false);
  }
  const gemini = toGeminiDeclarations().find((tool) => tool.name === "set_lights");
  assert.equal(gemini.parameters.type, "OBJECT");
  assert.equal(gemini.parameters.additionalProperties, undefined);
  assert.equal(gemini.parameters.properties.zone.type, "STRING");
  assert.equal(gemini.parameters.properties.transition_ms.type, "INTEGER");
  const groq = toGroqTools().find((tool) => tool.function.name === "set_lights");
  assert.equal(groq.type, "function");
  assert.equal(groq.function.parameters.additionalProperties, false);
});

test("executor applies lights and dojo without touching the profile", async () => {
  const store = createMemoryHouseStore();
  const now = Date.parse("2026-11-06T23:50:00.000Z");
  const read = await executeHouseTool({
    sessionId: "AB3K7Q", tool: "get_house_state", args: {}, store, limiter: limiter(), now,
  });
  assert.equal(read.status, "accepted");
  assert.equal(read.state.version, 0);
  assert.equal(store.commands.length, 0);

  const lights = await executeHouseTool({
    sessionId: "AB3K7Q", tool: "set_lights", args: LIGHTS, store, limiter: limiter(), now,
  });
  assert.equal(lights.status, "accepted");
  assert.equal(lights.state.version, 1);
  assert.equal(lights.state.lights.main.color, "#00FFAA");
  assert.equal(lights.state.lights.main.transition_ms, 800);
  assert.equal(lights.state.lights.lanterns.color, DEFAULT_LIGHTS.lanterns.color);
  assert.deepEqual(Object.keys(lights.state).sort(), STATE_KEYS.slice().sort());
  assert.equal("profile_id" in lights.state, false);

  const bad = await executeHouseTool({
    sessionId: "AB3K7Q", tool: "set_lights", args: { ...LIGHTS, intensity: 2 }, store, limiter: limiter(), now,
  });
  assert.equal(bad.status, "rejected");
  assert.equal(bad.reason, "invalid_args");
  assert.equal(bad.state.version, 1);

  const scene = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "switch_dojo",
    args: { dojo: "Cyber", transition_ms: 4000 },
    store,
    limiter: limiter(),
    now,
  });
  assert.equal(scene.state.mode, "dojo");
  assert.equal(scene.state.dojo, "Cyber");
  assert.equal(scene.state.version, 2);
  assert.equal(JSON.stringify(scene.state).includes("profile_id"), false);
  assert.equal(JSON.stringify(scene.state).includes("Lina"), false);
});

test("executor rate limit does not bump the version", async () => {
  const store = createMemoryHouseStore();
  const gate = limiter(2);
  const now = Date.parse("2026-11-06T23:50:00.000Z");
  const call = (color) => executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "set_lights",
    args: { ...LIGHTS, color },
    store,
    limiter: gate,
    now,
    limit: 2,
  });
  assert.equal((await call("#111111")).status, "accepted");
  assert.equal((await call("#222222")).status, "accepted");
  const blocked = await call("#333333");
  assert.equal(blocked.status, "rejected");
  assert.equal(blocked.reason, "rate_limited");
  assert.equal(blocked.state.version, 2);
  assert.equal(blocked.state.lights.main.color, "#222222");
});

test("GET /api/house/state returns null without a session and the hub default with one", async () => {
  const empty = createHouseStateHandler({ loadSession: noSession() });
  const res = mockRes();
  await empty({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { state: null });

  const ready = createHouseStateHandler({
    loadSession: activeSession(),
    readState: async () => ({ state: null }),
  });
  const res2 = mockRes();
  await ready({ method: "GET", headers: {} }, res2);
  assert.equal(res2.statusCode, 200);
  assert.deepEqual(res2.body.state, defaultHouseState("AB3K7Q"));
});

test("POST /api/gen/commands validates and requires an active session", async () => {
  const store = createMemoryHouseStore();
  const handler = createCommandsHandler({
    loadSession: activeSession(),
    store,
    limiter: limiter(),
    now: () => Date.parse("2026-11-06T23:50:00.000Z"),
  });
  const missing = mockRes();
  await handler({ method: "POST", headers: {}, body: {} }, missing);
  assert.equal(missing.statusCode, 400);

  const accepted = mockRes();
  await handler({
    method: "POST",
    headers: {},
    body: { tool: "set_ambience", args: { preset: "bamboo", volume: 0.2, transition_ms: 1200 } },
  }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.status, "accepted");
  assert.equal(accepted.body.reason, undefined);
  assert.equal(accepted.body.state.ambience.preset, "bamboo");
  assert.equal(accepted.body.state.mode, "hub");

  const idle = createCommandsHandler({ loadSession: noSession(), store });
  const blocked = mockRes();
  await idle({ method: "POST", headers: {}, body: { tool: "get_house_state", args: {} } }, blocked);
  assert.equal(blocked.statusCode, 409);
  assert.deepEqual(blocked.body, { error: "no_active_session" });
});

test("voice session mints a Gemini ephemeral token and hides the API key", async () => {
  const secret = "gemini-secret-do-not-leak";
  let captured = null;
  let calls = 0;
  const handler = createVoiceHandler({
    loadSession: activeSession(),
    store: createMemoryHouseStore(),
    env: { GEMINI_API_KEY: secret },
    limiter: limiter(4),
    ipLimiter: limiter(10),
    now: () => Date.parse("2026-11-06T23:50:00.000Z"),
    fetchImpl: async (url, opts) => {
      calls += 1;
      captured = { url, opts };
      return new Response(JSON.stringify({ name: "ephemeral-token-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const res = mockRes();
  await handler({ method: "POST", headers: {}, body: {} }, res);
  assert.equal(calls, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.provider, "gemini");
  assert.equal(res.body.model, GEMINI_LIVE_MODEL);
  assert.equal(res.body.token, "ephemeral-token-1");
  assert.equal(res.body.expiresAt, "2026-11-07T00:00:00.000Z");
  assert.match(res.body.wsUrl, /BidiGenerateContentConstrained/);
  assert.match(res.body.wsUrl, /access_token=ephemeral-token-1/);
  assert.equal(res.body.tools.length, 4);
  assert.match(res.body.systemInstruction, /Lina/);
  assert.match(res.body.systemInstruction, /Não peça para repetir/);
  assert.match(res.body.systemInstruction, /Estado atual da casa/);
  assert.doesNotMatch(res.body.systemInstruction, /SEGREDO_DO_QUIZ/);
  assert.equal(JSON.stringify(res.body).includes(secret), false);

  const request = JSON.parse(captured.opts.body);
  assert.equal(captured.url, "https://generativelanguage.googleapis.com/v1beta/auth_tokens");
  assert.equal(captured.opts.headers["x-goog-api-key"], secret);
  assert.equal(request.uses, 1);
  assert.equal(request.bidiGenerateContentSetup.model, GEMINI_LIVE_RESOURCE);
  assert.equal(request.fieldMask, undefined);
  assert.match(request.bidiGenerateContentSetup.systemInstruction.parts[0].text, /Lina/);
  assert.equal(request.bidiGenerateContentSetup.tools[0].functionDeclarations.length, 4);
  assert.equal(JSON.stringify(request).includes(secret), false);
  assert.equal(res.body.voiceName, "Charon");
  assert.equal(
    request.bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
    "Charon",
  );
  assert.equal(request.bidiGenerateContentSetup.generationConfig.speechConfig.languageCode, "pt-BR");

  let called = false;
  const bare = createVoiceHandler({
    loadSession: activeSession(),
    store: createMemoryHouseStore(),
    env: {},
    limiter: limiter(),
    ipLimiter: limiter(),
    fetchImpl: async () => { called = true; throw new Error(secret); },
  });
  const missing = mockRes();
  await bare({ method: "POST", headers: {} }, missing);
  assert.equal(called, false);
  assert.equal(missing.statusCode, 503);
  assert.equal(missing.body.error, "missing_config");
  assert.equal(JSON.stringify(missing.body).includes(secret), false);
});

test("Groq chat transcribes, runs the tool, and returns text only", async () => {
  const secret = "groq-secret-do-not-leak";
  const store = createMemoryHouseStore();
  const seen = [];
  const handler = createChatHandler({
    loadSession: activeSession(),
    env: { GROQ_API_KEY: secret },
    store,
    chatLimiter: limiter(),
    ipLimiter: limiter(),
    commandLimiter: limiter(),
    now: () => Date.parse("2026-11-06T23:50:00.000Z"),
    fetchImpl: async (url, opts) => {
      seen.push({ url, opts });
      if (String(url).includes("/audio/transcriptions")) {
        assert.equal(opts.body.get("model"), GROQ_STT_MODEL);
        assert.equal(opts.body.get("language"), "pt");
        assert.equal(opts.headers.Authorization, `Bearer ${secret}`);
        return new Response(JSON.stringify({ text: "deixa a luz principal baixa" }), { status: 200 });
      }
      const body = JSON.parse(opts.body);
      assert.equal(body.model, GROQ_CHAT_MODEL);
      assert.equal(body.tools[0].function.parameters.additionalProperties, false);
      const toolReply = seen.filter((call) => String(call.url).includes("/chat/completions")).length > 1;
      if (!toolReply) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{
                id: "call_1",
                type: "function",
                function: {
                  name: "set_lights",
                  arguments: JSON.stringify(LIGHTS),
                },
              }],
            },
          }],
        }), { status: 200 });
      }
      const toolMessage = body.messages.find((message) => message.role === "tool");
      assert.match(toolMessage.content, /accepted/);
      assert.doesNotMatch(toolMessage.content, /SEGREDO_DO_QUIZ/);
      assert.doesNotMatch(toolMessage.content, /tranquilo/);
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "Pronto, Lina. A luz principal baixou." } }],
      }), { status: 200 });
    },
  });

  const boundary = "----genboundary";
  const audio = Buffer.from("RIFFfake-wav");
  const raw = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="fala.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
    audio,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const parsed = parseMultipart(raw, `multipart/form-data; boundary=${boundary}`);
  assert.equal(Buffer.compare(parsed[0].data, audio), 0);

  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body: raw,
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.transcript, "deixa a luz principal baixa");
  assert.equal(res.body.reply_text, "Pronto, Lina. A luz principal baixou.");
  assert.equal(res.body.actions[0].status, "accepted");
  assert.equal(res.body.actions[0].tool, "set_lights");
  assert.equal(res.body.state.lights.main.color, "#00FFAA");
  assert.equal(res.body.state.version, 1);
  assert.equal(JSON.stringify(res.body).includes(secret), false);
  assert.equal(seen.some((call) => String(call.url).includes("generativelanguage")), false);
});

const WARM_BAMBOO = {
  session_id: "AB3K7Q",
  version: 4,
  mode: "hub",
  dojo: null,
  lights: {
    main: { intensity: 0.8, color: "#FFAA00" },
    lanterns: { intensity: 0.2, color: "#FF1A1A" },
  },
  ambience: { preset: "bamboo", volume: 0.3 },
  updated_at: "2026-11-06T23:40:00.000Z",
};

async function seedHouse(store, state) {
  const saved = await store.save(state, 0);
  assert.equal(saved.conflict, undefined);
  return saved.state;
}

test("a clear repeat of the current house does not ask to repeat", async () => {
  assert.equal(fallbackReply([], { transcript: "??" }), "Pode repetir?");
  assert.equal(
    fallbackReply([], { transcript: "deixa a luz bem quente e coloca som de bambu", state: WARM_BAMBOO }),
    "Já tá quentinha e com bambu tocando 😉",
  );
  assert.equal(fallbackReply(
    [{ tool: "set_lights", status: "accepted" }],
    { transcript: "deixa a luz bem quente", state: WARM_BAMBOO },
  ), "Pronto. Deixei a luz quentinha. O bambu continua tocando.");
  assert.equal(chooseReply({
    modelText: "Já tá quentinha e com bambu tocando 😉",
    actions: [],
    transcript: "deixa a luz bem quente e coloca som de bambu",
    state: WARM_BAMBOO,
  }), "Já tá quentinha e com bambu tocando 😉");

  const secret = "groq-secret-do-not-leak";
  const store = createMemoryHouseStore();
  await seedHouse(store, WARM_BAMBOO);
  const replies = ["", "Pode repetir?", "Já tá quentinha e com bambu tocando 😉"];
  for (const modelText of replies) {
    let system = "";
    const handler = createChatHandler({
      loadSession: activeSession(),
      env: { GROQ_API_KEY: secret },
      store,
      chatLimiter: limiter(),
      ipLimiter: limiter(),
      commandLimiter: limiter(),
      now: () => Date.parse("2026-11-06T23:50:00.000Z"),
      fetchImpl: async (url, opts) => {
        const body = JSON.parse(opts.body);
        system = body.messages[0].content;
        assert.equal(body.model, GROQ_CHAT_MODEL);
        return new Response(JSON.stringify({
          choices: [{ message: { role: "assistant", content: modelText, tool_calls: [] } }],
        }), { status: 200 });
      },
    });
    const res = mockRes();
    await handler({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { text: "deixa a luz bem quente e coloca som de bambu" },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.actions.length, 0);
    assert.equal(res.body.state.version, 4);
    assert.equal(res.body.state.lights.main.color, "#FFAA00");
    assert.equal(res.body.state.ambience.preset, "bamboo");
    assert.notEqual(res.body.reply_text.trim(), "");
    assert.doesNotMatch(res.body.reply_text, /pode repetir/i);
    assert.doesNotMatch(res.body.reply_text, /#[0-9A-Fa-f]{6}/);
    assert.match(res.body.reply_text, /bambu/i);
    assert.match(system, /Chame set_lights/);
    assert.match(system, /Só pule a ferramenta/);
    assert.match(system, /#FFAA00/);
    assert.match(system, /bamboo volume 0\.3/);
    assert.match(system, /Não peça para repetir/);
    assert.doesNotMatch(system, /SEGREDO_DO_QUIZ/);
    assert.equal(JSON.stringify(res.body).includes(secret), false);
  }

  const voiceStore = createMemoryHouseStore();
  await seedHouse(voiceStore, WARM_BAMBOO);
  let locked = "";
  const voice = createVoiceHandler({
    loadSession: activeSession(),
    store: voiceStore,
    env: { GEMINI_API_KEY: "gemini-secret-do-not-leak" },
    limiter: limiter(),
    ipLimiter: limiter(),
    fetchImpl: async (_url, opts) => {
      locked = JSON.parse(opts.body).bidiGenerateContentSetup.systemInstruction.parts[0].text;
      return new Response(JSON.stringify({ name: "ephemeral-token-2" }), { status: 200 });
    },
  });
  const live = mockRes();
  await voice({ method: "POST", headers: {}, body: {} }, live);
  assert.equal(live.statusCode, 200);
  assert.match(live.body.systemInstruction, /#FFAA00/);
  assert.match(live.body.systemInstruction, /bamboo volume 0\.3/);
  assert.match(live.body.systemInstruction, /Não peça para repetir/);
  assert.equal(locked, live.body.systemInstruction);
  assert.equal(JSON.stringify(live.body).includes("gemini-secret-do-not-leak"), false);
});

const COOL_BAMBOO = {
  session_id: "AB3K7Q",
  version: 4,
  mode: "hub",
  dojo: null,
  lights: {
    main: { intensity: 0.45, color: "#00BFFF" },
    lanterns: { intensity: 0.2, color: "#FF1A1A" },
  },
  ambience: { preset: "bamboo", volume: 0.3 },
  updated_at: "2026-11-06T23:40:00.000Z",
};

test("a warm request on a cool light calls set_lights and does not claim it is already warm", async () => {
  const ask = "deixa a luz bem quente e coloca som de bambu";
  assert.equal(
    fallbackReply([], { transcript: ask, state: COOL_BAMBOO }),
    "Vou tentar de novo.",
  );
  assert.doesNotMatch(
    fallbackReply([], { transcript: ask, state: COOL_BAMBOO }),
    /#[0-9A-Fa-f]{6}|já tá/i,
  );

  const store = createMemoryHouseStore();
  await seedHouse(store, COOL_BAMBOO);
  const handler = createChatHandler({
    loadSession: activeSession(),
    env: { GROQ_API_KEY: "groq-secret-do-not-leak" },
    store,
    chatLimiter: limiter(),
    ipLimiter: limiter(),
    commandLimiter: limiter(),
    now: () => Date.parse("2026-11-06T23:50:00.000Z"),
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{
        message: {
          role: "assistant",
          content: "A luz principal já tá em #00BFFF e com bambu tocando.",
          tool_calls: [],
        },
      }],
    }), { status: 200 }),
  });
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { text: ask },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.actions.length, 1);
  assert.equal(res.body.actions[0].tool, "set_lights");
  assert.equal(res.body.actions[0].status, "accepted");
  assert.equal(res.body.actions[0].args.color, "#FFAA00");
  assert.equal(res.body.actions[0].args.zone, "main");
  assert.equal(res.body.actions[0].args.intensity, 0.8);
  assert.equal(res.body.state.lights.main.color, "#FFAA00");
  assert.equal(res.body.state.lights.main.intensity, 0.8);
  assert.equal(res.body.state.ambience.preset, "bamboo");
  assert.equal(res.body.state.version, 5);
  assert.match(res.body.reply_text, /quentinha/i);
  assert.match(res.body.reply_text, /bambu/i);
  assert.doesNotMatch(res.body.reply_text, /#[0-9A-Fa-f]{3,6}/i);
  assert.doesNotMatch(res.body.reply_text, /já tá em/i);
  assert.doesNotMatch(res.body.reply_text, /pode repetir/i);
});

test("chat JSON path and missing session do not call Groq", async () => {
  let calls = 0;
  const handler = createChatHandler({
    loadSession: noSession(),
    env: { GROQ_API_KEY: "groq" },
    store: createMemoryHouseStore(),
    chatLimiter: limiter(),
    ipLimiter: limiter(),
    commandLimiter: limiter(),
    fetchImpl: async () => { calls += 1; throw new Error("nope"); },
  });
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { text: "oi" },
  }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(calls, 0);
});

test("service role writes do not send the anon key", async () => {
  await withEnv({
    SUPABASE_URL: "https://ahzsvjimyfzjcfuhgdgw.supabase.co",
    SUPABASE_ANON_KEY: "anon-key-do-not-use-for-writes",
    SUPABASE_SERVICE_ROLE: "service-key-server-only",
  }, async () => {
    let auth = "";
    let called = false;
    global.fetch = async (_url, opts) => {
      called = true;
      auth = opts.headers.Authorization;
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    };
    const store = createSupabaseHouseStore();
    const loaded = await store.load("AB3K7Q");
    assert.equal(loaded.state, null);
    assert.equal(auth, "Bearer service-key-server-only");
    assert.equal(auth.includes("anon-key"), false);

    global.fetch = async () => { called = true; throw new Error("should not fetch"); };
    called = false;
    delete process.env.SUPABASE_SERVICE_ROLE;
    const blocked = await store.load("AB3K7Q");
    assert.equal(blocked.error, "missing_config");
    assert.equal(called, false);
  });
});

test("house SQL resets to the hub, locks RLS, and broadcasts without quiz data", () => {
  const sql = fs.readFileSync(new URL("../sql/house_state.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /house_state_changed/);
  assert.match(sql, /'house:' \|\| NEW\.session_id/);
  assert.match(sql, /private => false/);
  assert.match(sql, /mode = 'hub'/);
  assert.match(sql, /grant select on public\.house_state to anon, authenticated/);
  assert.match(sql, /revoke all on public\.house_commands from anon, authenticated, public/);
  assert.doesNotMatch(sql, /'display_name'|'personality_text'|'clima_ambiente'/);
  assert.doesNotMatch(sql, /grant insert|grant all/i);
  const lights = sql.match(/function genjutsu_internal\.default_lights\(\)[\s\S]*?'(\{[^']+\})'::jsonb/);
  const ambience = sql.match(/function genjutsu_internal\.default_ambience\(\)[\s\S]*?'(\{[^']+\})'::jsonb/);
  assert.deepEqual(JSON.parse(lights[1]), DEFAULT_LIGHTS);
  assert.deepEqual(JSON.parse(ambience[1]), DEFAULT_AMBIENCE);
});

test("pages wire the phone, the provider, and the session contract", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const gen = fs.readFileSync(new URL("../gen.html", import.meta.url), "utf8");
  const phone = fs.readFileSync(new URL("../js/gen-phone.js", import.meta.url), "utf8");
  const provider = fs.readFileSync(new URL("../js/house-state.js", import.meta.url), "utf8");
  const vercel = fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
  const env = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(html, /id="house-veil"/);
  assert.match(html, /js\/house-state\.js/);
  assert.match(html, /href="\/gen"/);
  assert.match(provider, /HouseStateProvider/);
  assert.match(provider, /house:/);
  assert.match(provider, /house_state_changed/);
  assert.match(provider, /private:\s*false/);
  assert.match(provider, /2000/);
  assert.match(provider, /prefers-reduced-motion|house-veil/);
  assert.match(gen, /id="ptt"/);
  assert.match(gen, /lang="pt-BR"/);
  assert.match(phone, /\/api\/gen\/voice-session/);
  assert.match(phone, /\/api\/gen\/chat/);
  assert.match(phone, /\/api\/gen\/commands/);
  assert.match(phone, /speechSynthesis/);
  assert.match(phone, /voiceName/);
  assert.match(phone, /SPEECH_FALLBACK_PITCH/);
  assert.doesNotMatch(phone, /Aoede/);
  assert.match(env, /GEN_VOICE_NAME=/);
  assert.match(phone, /AudioWorklet/);
  assert.match(phone, /pt-BR/);
  assert.match(phone, /audio\/pcm;rate=16000/);
  assert.match(vercel, /\/gen/);
  assert.match(env, /GEMINI_API_KEY=/);
  assert.match(env, /GROQ_API_KEY=/);
  assert.doesNotMatch(phone, /GEMINI_API_KEY|GROQ_API_KEY/);
});

test("supabase helper still exports the CommonJS functions", () => {
  assert.equal(typeof supabaseRest, "function");
});

test("live voice defaults to Charon and can be overridden", async () => {
  assert.equal(resolveVoiceName({}), "Charon");
  assert.equal(resolveVoiceName({ GEN_VOICE_NAME: "  " }), "Charon");
  assert.equal(resolveVoiceName({ GEN_VOICE_NAME: "bad voice" }), "Charon");
  assert.equal(resolveVoiceName({ GEN_VOICE_NAME: "Fenrir" }), "Fenrir");

  let voice = "";
  const handler = createVoiceHandler({
    loadSession: activeSession(),
    store: createMemoryHouseStore(),
    env: { GEMINI_API_KEY: "gemini-secret-do-not-leak", GEN_VOICE_NAME: "Fenrir" },
    limiter: limiter(),
    ipLimiter: limiter(),
    fetchImpl: async (_url, opts) => {
      voice = JSON.parse(opts.body).bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName;
      return new Response(JSON.stringify({ name: "ephemeral-token-voice" }), { status: 200 });
    },
  });
  const res = mockRes();
  await handler({ method: "POST", headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.voiceName, "Fenrir");
  assert.equal(voice, "Fenrir");
  assert.equal(
    JSON.parse(JSON.stringify(res.body)).voiceName,
    "Fenrir",
  );
});

test("speech fallback prefers a pt-BR male voice and otherwise lowers pitch", () => {
  assert.equal(SPEECH_FALLBACK_PITCH, 0.85);
  const voices = [
    { name: "Luciana", lang: "pt-BR", voiceURI: "Luciana" },
    { name: "Google US English", lang: "en-US", voiceURI: "male" },
    { name: "Google português do Brasil", lang: "pt-BR", voiceURI: "google-pt" },
    { name: "Daniel", lang: "pt-BR", voiceURI: "Daniel" },
  ];
  assert.equal(pickPtBrMaleVoice(voices).name, "Daniel");
  assert.equal(pickPtBrMaleVoice([
    { name: "Google português masculino", lang: "pt-BR" },
  ]).name, "Google português masculino");
  assert.equal(pickPtBrMaleVoice([
    { name: "Ricardo", lang: "pt-PT" },
  ]).name, "Ricardo");
  assert.equal(pickPtBrMaleVoice([
    { name: "Antônio", lang: "pt-BR" },
  ]).name, "Antônio");
  assert.equal(pickPtBrMaleVoice([
    { name: "Female", lang: "pt-BR" },
    { name: "Google português do Brasil", lang: "pt-BR" },
  ]), null);
  assert.equal(pickPtBrMaleVoice([
    { name: "Daniel", lang: "en-US" },
  ]), null);
});
