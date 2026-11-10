import test from "node:test";
import assert from "node:assert/strict";
import { createChatHandler } from "../api/gen/chat.js";
import { createVoiceHandler } from "../api/gen/voice-session.js";
import { createCommandsHandler } from "../api/gen/commands.js";
import { createMemoryHouseStore } from "../lib/gen/house-store.js";
import { createMemoryRoutineStore } from "../lib/gen/routine-store.js";
import { createMemorySessionStore } from "../lib/gen/session-memory.js";
import { buildSystemInstruction } from "../lib/gen/persona.js";
import { personalityLines } from "../lib/gen/profanity.js";
import { createLiveToken } from "../lib/gen/providers.js";
import { createRateLimiter } from "../lib/gen/rate-limit.js";
import {
  parseStyleRequest,
  styleAllowsSwearing,
  voiceForStyle,
  STYLE_VOICES,
} from "../lib/gen/style.js";
import { validateToolCall } from "../lib/gen/tools.js";
import { defaultHouseState } from "../lib/gen/defaults.js";

const SESSION = {
  id: "AB3K7Q",
  session_code: "AB3K7Q",
  display_name: "Lina",
  profile_id: "Zen",
  status: "active",
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

test("style prompt and Gemini Live voices map comum/ironica/zen", () => {
  assert.equal(parseStyleRequest("Gen, muda pra personalidade irônica"), "ironica");
  assert.equal(parseStyleRequest("fica no tom zen"), "zen");
  assert.equal(parseStyleRequest("na hora do jogo do Corinthians"), "");
  assert.equal(voiceForStyle("comum"), "Charon");
  assert.equal(voiceForStyle("ironica"), "Fenrir");
  assert.equal(voiceForStyle("zen"), "Kore");
  assert.equal(STYLE_VOICES.ironica, "Fenrir");
  assert.equal(validateToolCall("set_gen_style", { style: "ironica" }).ok, true);
  assert.equal(validateToolCall("set_gen_style", { style: "irônica" }).args.style, "ironica");

  const ironica = buildSystemInstruction(SESSION, defaultHouseState("AB3K7Q"), "", { style: "ironica", profanity: true });
  assert.match(ironica, /sarcástic|irônic/i);
  assert.match(ironica, /caralho|porra|merda/);
  assert.match(ironica, /perfil dela é Zen/);
  assert.doesNotMatch(ironica, /switch_dojo muda o perfil/);

  const zen = buildSystemInstruction(SESSION, defaultHouseState("AB3K7Q"), "", { style: "zen", profanity: true });
  assert.match(zen, /calmo|poético/);
  assert.doesNotMatch(zen, /caralho|porra/);
  assert.match(personalityLines(true, "zen").join(" "), /Não use palavrão/);
});

test("Irônica swears only when allowed", () => {
  assert.equal(styleAllowsSwearing("ironica", true), true);
  assert.equal(styleAllowsSwearing("ironica", false), false);
  assert.equal(styleAllowsSwearing("zen", true), false);
  assert.match(personalityLines(true, "ironica").join(" "), /caralho/);
  assert.match(personalityLines(false, "ironica").join(" "), /Não use palavrão/);
  assert.doesNotMatch(personalityLines(false, "ironica").join(" "), /caralho/);
});

test("set_gen_style persists on the session and appears on house_state", async () => {
  const store = createMemoryHouseStore();
  const handler = createCommandsHandler({
    loadSession: async () => ({ session: SESSION }),
    store,
    limiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
  });
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { tool: "set_gen_style", args: { style: "ironica" } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "accepted");
  assert.equal(res.body.state.gen_style, "ironica");
  assert.ok(res.body.state.voice_reload_at);
});

test("chat style change applies on the next reply", async () => {
  const store = createMemoryHouseStore();
  const handler = createChatHandler({
    loadSession: async () => ({ session: SESSION }),
    env: { GEMINI_API_KEY: "g" },
    store,
    routineStore: createMemoryRoutineStore(),
    sessionMemory: createMemorySessionStore(),
    loadPrefs: async () => true,
    chatLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    ipLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    commandLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: () => Date.parse("2026-11-09T18:00:00.000Z"),
    fetchImpl: async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "ok" }] } }],
    }), { status: 200 }),
  });
  const first = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { text: "Gen, muda pra personalidade irônica" },
  }, first);
  assert.equal(first.body.actions[0].tool, "set_gen_style");
  assert.equal(first.body.actions[0].status, "accepted");
  assert.match(first.body.reply_text, /irônic|reconect/i);
  const loaded = await store.load(SESSION.id);
  assert.equal(loaded.state.gen_style, "ironica");
});

test("voice session uses session facts, selected style and matching voice", async () => {
  const store = createMemoryHouseStore();
  await store.save({ ...defaultHouseState(SESSION.id), gen_style: "zen", version: 1 }, 0);
  const sessionMemory = createMemorySessionStore();
  await sessionMemory.remember(SESSION.id, {
    fact: {
      kind: "match",
      event: "Corinthians x Botafogo",
      team: "Corinthians",
      opponent: "Botafogo",
      weekday: 3,
      hour: 21,
      minute: 30,
      weekdayName: "quarta",
      datetime: "2026-11-18T21:30:00.000-03:00",
    },
  });
  let locked = "";
  let voice = "";
  const handler = createVoiceHandler({
    loadSession: async () => ({ session: SESSION }),
    store,
    sessionMemory,
    loadPrefs: async () => true,
    env: { GEMINI_API_KEY: "gemini-secret-do-not-leak" },
    limiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    ipLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    fetchImpl: async (_url, opts) => {
      const body = JSON.parse(opts.body);
      locked = body.bidiGenerateContentSetup.systemInstruction.parts[0].text;
      voice = body.bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName;
      return new Response(JSON.stringify({ name: "ephemeral-token-style" }), { status: 200 });
    },
  });
  const res = mockRes();
  await handler({ method: "POST", headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.voiceName, "Kore");
  assert.equal(voice, "Kore");
  assert.match(locked, /calmo|poético|Não use palavrão/);
  assert.match(locked, /kickoff ISO|21h30|Botafogo/);
  assert.equal(JSON.stringify(res.body).includes("gemini-secret-do-not-leak"), false);
});

test("createLiveToken ironica uses Fenrir", async () => {
  const token = await createLiveToken({
    env: { GEMINI_API_KEY: "g" },
    session: SESSION,
    state: { ...defaultHouseState(SESSION.id), gen_style: "ironica" },
    style: "ironica",
    fetchImpl: async (_url, opts) => {
      const voice = JSON.parse(opts.body).bidiGenerateContentSetup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName;
      assert.equal(voice, "Fenrir");
      return new Response(JSON.stringify({ name: "tok" }), { status: 200 });
    },
  });
  assert.equal(token.voiceName, "Fenrir");
});
