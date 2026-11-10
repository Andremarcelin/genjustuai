import test from "node:test";
import assert from "node:assert/strict";
import { createChatHandler } from "../api/gen/chat.js";
import { createVoiceHandler } from "../api/gen/voice-session.js";
import { createMemoryHouseStore } from "../lib/gen/house-store.js";
import { createMemoryRoutineStore } from "../lib/gen/routine-store.js";
import { createMemorySessionStore } from "../lib/gen/session-memory.js";
import { defaultHouseState } from "../lib/gen/defaults.js";
import { buildSystemInstruction } from "../lib/gen/persona.js";
import { PROJECT_KNOWLEDGE } from "../lib/gen/project-knowledge.js";
import { createRateLimiter } from "../lib/gen/rate-limit.js";

const SESSION = {
  id: "AB3K7Q",
  session_code: "AB3K7Q",
  display_name: "Lina",
  profile_id: "Zen",
  status: "active",
};

const SECRET_LIKE = [
  /GEMINI_API_KEY/i,
  /GROQ_API_KEY/i,
  /SERVICE_ROLE/i,
  /SUPABASE_ANON/i,
  /CRON_SECRET/i,
  /eyJ[A-Za-z0-9_-]{20,}/,
  /\/admin\b/i,
  /ahzsvjim/i,
  /sk-[A-Za-z0-9]/,
  /AIza[A-Za-z0-9_-]{20,}/,
];

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

function assertNoSecrets(text) {
  const blob = String(text || "");
  for (const pattern of SECRET_LIKE) {
    assert.doesNotMatch(blob, pattern);
  }
}

test("project knowledge is compact, accurate, and has no secret-like strings", () => {
  assert.ok(PROJECT_KNOWLEDGE.length > 400);
  assert.ok(PROJECT_KNOWLEDGE.length < 2200);
  assert.match(PROJECT_KNOWLEDGE, /Unity/);
  assert.match(PROJECT_KNOWLEDGE, /Quest 3/);
  assert.match(PROJECT_KNOWLEDGE, /Vercel/);
  assert.match(PROJECT_KNOWLEDGE, /Supabase/);
  assert.match(PROJECT_KNOWLEDGE, /Gemini Live/);
  assert.match(PROJECT_KNOWLEDGE, /token temporário/);
  assert.match(PROJECT_KNOWLEDGE, /Groq/);
  assert.match(PROJECT_KNOWLEDGE, /Open-Meteo/);
  assert.match(PROJECT_KNOWLEDGE, /Jamendo|Internet Archive/);
  assert.match(PROJECT_KNOWLEDGE, /ZCEA/);
  assert.match(PROJECT_KNOWLEDGE, /house_state/);
  assert.match(PROJECT_KNOWLEDGE, /NFC/);
  assert.match(PROJECT_KNOWLEDGE, /Alexa/);
  assert.match(PROJECT_KNOWLEDGE, /próxima etapa/);
  assert.match(PROJECT_KNOWLEDGE, /ESP32/);
  assert.match(PROJECT_KNOWLEDGE, /irônica|ironica/);
  assertNoSecrets(PROJECT_KNOWLEDGE);
});

test("chat and voice prompts include the project knowledge block", async () => {
  const chatPrompt = buildSystemInstruction(SESSION, defaultHouseState(SESSION.id), "");
  assert.match(chatPrompt, /Conhecimento do projeto GenJutsu/);
  assert.ok(chatPrompt.includes(PROJECT_KNOWLEDGE));
  assertNoSecrets(chatPrompt);

  let chatSystem = "";
  const chat = createChatHandler({
    loadSession: async () => ({ session: SESSION }),
    env: { GEMINI_API_KEY: "gemini-secret-do-not-leak" },
    store: createMemoryHouseStore(),
    routineStore: createMemoryRoutineStore(),
    sessionMemory: createMemorySessionStore(),
    loadPrefs: async () => true,
    chatLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    ipLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    commandLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: () => Date.parse("2026-11-10T18:00:00.000Z"),
    fetchImpl: async (_url, opts) => {
      const body = JSON.parse(opts.body || "{}");
      chatSystem = body.systemInstruction?.parts?.[0]?.text
        || (Array.isArray(body.messages) ? body.messages.find((m) => m.role === "system")?.content : "")
        || "";
      if (!chatSystem && Array.isArray(body.contents)) {
        chatSystem = JSON.stringify(body);
      }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "A stack é Unity no Quest, site na Vercel e Gemini no servidor." }] } }],
      }), { status: 200 });
    },
  });
  const chatRes = mockRes();
  await chat({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { text: "Gen, qual a stack do projeto?" },
  }, chatRes);
  assert.equal(chatRes.statusCode, 200);
  assert.match(chatSystem, /Conhecimento do projeto GenJutsu/);
  assert.match(chatSystem, /token temporário/);
  assert.doesNotMatch(chatSystem, /gemini-secret-do-not-leak/);
  assertNoSecrets(chatSystem);

  let liveSystem = "";
  const voice = createVoiceHandler({
    loadSession: async () => ({ session: SESSION }),
    store: createMemoryHouseStore(),
    sessionMemory: createMemorySessionStore(),
    loadPrefs: async () => true,
    env: { GEMINI_API_KEY: "gemini-secret-do-not-leak" },
    limiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    ipLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    fetchImpl: async (_url, opts) => {
      liveSystem = JSON.parse(opts.body).bidiGenerateContentSetup.systemInstruction.parts[0].text;
      return new Response(JSON.stringify({ name: "ephemeral-token-knowledge" }), { status: 200 });
    },
  });
  const live = mockRes();
  await voice({ method: "POST", headers: {} }, live);
  assert.equal(live.statusCode, 200);
  assert.match(live.body.systemInstruction, /Conhecimento do projeto GenJutsu/);
  assert.ok(live.body.systemInstruction.includes(PROJECT_KNOWLEDGE));
  assert.equal(liveSystem, live.body.systemInstruction);
  assert.doesNotMatch(live.body.systemInstruction, /gemini-secret-do-not-leak/);
  assertNoSecrets(live.body.systemInstruction);
});
