import test from "node:test";
import assert from "node:assert/strict";
import { createChatHandler } from "../api/gen/chat.js";
import { createMemoryHouseStore } from "../lib/gen/house-store.js";
import { chooseReply, routinePhrase } from "../lib/gen/persona.js";
import {
  chatPrimary,
  completeChat,
  geminiKeys,
  openaiToGeminiContents,
  parseGroundingChunks,
  searchGeminiGrounded,
} from "../lib/gen/providers.js";
import { createRateLimiter } from "../lib/gen/rate-limit.js";
import { createMemoryRoutineStore } from "../lib/gen/routine-store.js";
import {
  createMemorySessionStore,
  gameRoutineFromFact,
  hasKickoff,
  isGameTimeRequest,
  parseMatchFact,
} from "../lib/gen/session-memory.js";
import { GEMINI_GENERATE_URL, GEMINI_TEXT_MODEL, GROQ_CHAT_URL } from "../lib/gen/constants.js";
import { searchWeb } from "../lib/gen/media.js";

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

function geminiText(text, extras = {}) {
  return new Response(JSON.stringify({
    candidates: [{
      content: { parts: [{ text }] },
      groundingMetadata: extras.groundingMetadata,
    }],
  }), { status: 200 });
}

test("GEN_CHAT_PRIMARY defaults to gemini and Groq is fallback", async () => {
  assert.equal(chatPrimary({}), "gemini");
  assert.equal(chatPrimary({ GEN_CHAT_PRIMARY: "groq" }), "groq");
  const order = [];
  const geminiFirst = await completeChat({
    env: { GEMINI_API_KEY: "g1", GROQ_API_KEY: "q1" },
    messages: [{ role: "user", content: "oi" }],
    fetchImpl: async (url) => {
      order.push(String(url) === GROQ_CHAT_URL ? "groq" : "gemini");
      if (String(url) === GEMINI_GENERATE_URL) return geminiText("oi do gemini");
      throw new Error("groq should wait");
    },
  });
  assert.equal(geminiFirst.provider, "gemini");
  assert.equal(geminiFirst.model, GEMINI_TEXT_MODEL);
  assert.deepEqual(order, ["gemini"]);

  const fallback = [];
  const afterFail = await completeChat({
    env: {
      GEN_CHAT_PRIMARY: "gemini",
      GEMINI_API_KEY: "bad",
      GEMINI_API_KEY_2: "also-bad",
      GROQ_API_KEY: "groq-secret",
    },
    messages: [{ role: "user", content: "oi" }],
    fetchImpl: async (url) => {
      fallback.push(String(url) === GROQ_CHAT_URL ? "groq" : "gemini");
      if (String(url) === GEMINI_GENERATE_URL) return new Response("{}", { status: 429 });
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "oi do groq" } }],
      }), { status: 200 });
    },
  });
  assert.equal(afterFail.provider, "groq");
  assert.equal(afterFail.message.content, "oi do groq");
  assert.ok(fallback.includes("gemini"));
  assert.ok(fallback.includes("groq"));
  assert.equal(JSON.stringify(afterFail).includes("groq-secret"), false);
});

test("GEN_CHAT_PRIMARY=groq tries Groq first", async () => {
  const seen = [];
  const result = await completeChat({
    env: { GEN_CHAT_PRIMARY: "groq", GROQ_API_KEY: "q", GEMINI_API_KEY: "g" },
    messages: [{ role: "user", content: "oi" }],
    fetchImpl: async (url) => {
      seen.push(String(url) === GROQ_CHAT_URL ? "groq" : "gemini");
      if (String(url) === GROQ_CHAT_URL) {
        return new Response(JSON.stringify({
          choices: [{ message: { role: "assistant", content: "groq primeiro" } }],
        }), { status: 200 });
      }
      throw new Error("gemini should wait");
    },
  });
  assert.equal(result.provider, "groq");
  assert.deepEqual(seen, ["groq"]);
});

test("routine confirmation is natural, not A casa atualizou", () => {
  const sala = routinePhrase({
    tool: "create_routine",
    args: {
      name: "Sala 7h",
      hour: 7,
      minute: 0,
      days: [0, 1, 2, 3, 4, 5, 6],
      actions: [{ tool: "set_device", args: { device_id: "sala_luz", on: true } }],
    },
  });
  assert.match(sala, /Fechado, luz da sala às 7h todo dia/);
  const wake = routinePhrase({
    tool: "create_routine",
    args: {
      name: "me acorda",
      hour: 6,
      minute: 30,
      once: true,
      actions: [
        { tool: "play_music", args: { query: "alarm bell", mood: "alarme" } },
        { tool: "set_device", args: { device_id: "quarto_luz", on: true } },
      ],
    },
  });
  assert.match(wake, /Beleza, te acordo amanhã às 6h30 com música e luz/);
  const reply = chooseReply({
    modelText: "A casa atualizou.",
    actions: [{
      tool: "create_routine",
      status: "accepted",
      args: {
        name: "Sala 7h",
        hour: 7,
        actions: [{ tool: "set_device", args: { device_id: "sala_luz", on: true } }],
      },
    }],
    transcript: "todo dia às 7h acende a sala",
    state: {},
  });
  assert.doesNotMatch(reply, /A casa atualizou/);
  assert.match(reply, /Fechado/);
});

test("openaiToGeminiContents echoes thoughtSignature on functionCall", () => {
  const mapped = openaiToGeminiContents([
    { role: "user", content: "clima" },
    {
      role: "assistant",
      content: "",
      tool_calls: [{
        id: "c1",
        thought_signature: "sig-abc",
        function: { name: "get_weather", arguments: "{}" },
      }],
    },
    { role: "tool", name: "get_weather", content: "{\"status\":\"accepted\"}" },
  ]);
  assert.equal(mapped.contents[1].parts[0].thoughtSignature, "sig-abc");
  assert.equal(mapped.contents[1].parts[0].functionCall.name, "get_weather");
});

test("openaiToGeminiContents uses user/model roles and functionResponse objects", () => {
  const mapped = openaiToGeminiContents([
    { role: "system", content: "sys" },
    { role: "user", content: "clima" },
    {
      role: "assistant",
      content: "",
      tool_calls: [{ id: "c1", function: { name: "get_weather", arguments: "{\"city\":\"SP\"}" } }],
    },
    { role: "tool", name: "get_weather", content: JSON.stringify({ status: "accepted", weather: { temp: 18 } }) },
  ]);
  assert.equal(mapped.system, "sys");
  assert.equal(mapped.contents[0].role, "user");
  assert.equal(mapped.contents[1].role, "model");
  assert.equal(mapped.contents[1].parts[0].functionCall.name, "get_weather");
  assert.equal(mapped.contents[2].role, "user");
  assert.equal(mapped.contents[2].parts[0].functionResponse.name, "get_weather");
  assert.equal(mapped.contents[2].parts[0].functionResponse.response.weather.temp, 18);
});

test("parseMatchFact ignores unrelated 7h routines and stores ISO kickoff", () => {
  assert.equal(parseMatchFact("todo dia às 7h acende a sala"), null);
  const fact = parseMatchFact(
    "O próximo jogo do Corinthians é quarta 18/11/2026 às 21h30 contra o Botafogo na Neo Química Arena.",
    new Date("2026-11-09T18:00:00.000Z"),
  );
  assert.equal(hasKickoff(fact), true);
  assert.equal(fact.hour, 21);
  assert.equal(fact.minute, 30);
  assert.ok(fact.datetime);
  assert.match(fact.event, /Botafogo/i);
  const planned = gameRoutineFromFact(fact);
  assert.equal(planned.hour, 21);
  assert.equal(planned.minute, 30);
});

test("web_search uses Gemini grounding then cites 1-2 sources", async () => {
  const json = {
    candidates: [{
      content: { parts: [{ text: "O Corinthians joga quarta às 21h30 contra o Palmeiras." }] },
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: "https://ge.globo.com/jogo", title: "ge.globo" } },
          { web: { uri: "https://www.corinthians.com.br", title: "Corinthians" } },
        ],
      },
    }],
  };
  const hits = parseGroundingChunks(json);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].title, "ge.globo");

  const grounded = await searchGeminiGrounded({
    env: { GEMINI_API_KEY: "g" },
    query: "próximo jogo Corinthians",
    now: new Date("2026-11-09T18:00:00.000Z"),
    fetchImpl: async (_url, opts) => {
      const body = JSON.parse(opts.body);
      assert.ok(body.tools[0].google_search || body.tools[0].googleSearch);
      const blob = JSON.stringify(body);
      assert.match(blob, /2026/);
      assert.doesNotMatch(blob, /\b2025\b/);
      return new Response(JSON.stringify(json), { status: 200 });
    },
  });
  assert.equal(grounded.grounded, true);
  assert.match(grounded.text, /21h30/);

  const search = await searchWeb({
    env: { GEMINI_API_KEY: "g" },
    query: "próximo jogo Corinthians",
    fetchImpl: async () => new Response(JSON.stringify(json), { status: 200 }),
  });
  assert.equal(search.grounded, true);
  assert.match(search[0].snippet, /21h30/);
  const cited = chooseReply({
    modelText: "",
    actions: [{ tool: "web_search", status: "accepted", search }],
    transcript: "qual o próximo jogo do Corinthians?",
    state: {},
  });
  assert.match(cited, /21h30/);
  assert.match(cited, /Fonte:/);
  assert.match(cited, /ge\.globo/);
});

test("acceptance: Corinthians match then na hora do jogo creates one-shot routine", async () => {
  assert.equal(isGameTimeRequest("na hora do jogo aumenta o ar e muda a iluminação"), true);
  const fact = parseMatchFact("O Corinthians joga quarta às 21h30 contra o Palmeiras.");
  assert.equal(hasKickoff(fact), true);
  assert.equal(fact.weekday, 3);
  assert.equal(fact.hour, 21);
  assert.equal(fact.minute, 30);
  assert.match(fact.opponent, /Palmeiras/i);
  const planned = gameRoutineFromFact(fact);
  assert.equal(planned.once, true);
  assert.equal(planned.hour, 21);
  assert.ok(planned.actions.some((item) => item.args?.device_id === "ar_condicionado" && item.args.temp === 20));

  const sessionMemory = createMemorySessionStore();
  const store = createMemoryHouseStore();
  const routines = createMemoryRoutineStore();
  const env = { GEMINI_API_KEY: "gemini-secret-do-not-leak" };
  const fetchImpl = async (_url, opts) => {
    const body = JSON.parse(opts.body || "{}");
    if (body.tools?.[0]?.google_search || body.tools?.[0]?.googleSearch) {
      return geminiText("O próximo jogo do Corinthians é quarta às 21h30 contra o Palmeiras, no Brasileirão.", {
        groundingMetadata: {
          groundingChunks: [{ web: { uri: "https://ge.globo.com/corinthians", title: "ge.globo" } }],
        },
      });
    }
    return geminiText("Beleza.");
  };
  const handler = createChatHandler({
    loadSession: async () => ({ session: SESSION }),
    env,
    store,
    routineStore: routines,
    sessionMemory,
    loadPrefs: async () => true,
    chatLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    ipLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    commandLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: () => Date.parse("2026-11-09T18:00:00.000Z"),
    fetchImpl,
  });

  const first = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { text: "qual o próximo jogo do Corinthians?" },
  }, first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.meta.provider, "gemini");
  assert.equal(first.body.actions[0].tool, "web_search");
  assert.match(first.body.reply_text, /21h30|Palmeiras/);
  assert.match(first.body.reply_text, /Fonte:/);
  assert.equal(JSON.stringify(first.body).includes("gemini-secret-do-not-leak"), false);

  const second = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { text: "na hora do jogo aumenta o ar e muda a iluminação" },
  }, second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.actions[0].tool, "create_routine");
  assert.equal(second.body.actions[0].status, "accepted");
  assert.equal(second.body.actions[0].args.once, true);
  assert.equal(second.body.actions[0].args.hour, 21);
  assert.equal(second.body.actions[0].args.minute, 30);
  assert.ok(second.body.actions[0].args.actions.some((item) => item.args?.temp === 20));
  assert.match(second.body.reply_text, /Fechado: quarta às 21h30/i);
  assert.match(second.body.reply_text, /20 °C/);
  assert.match(second.body.reply_text, /preto e branco/);
  assert.equal(routines.rows[0].schedule.once, true);

  const emptyMemory = createMemorySessionStore();
  const askTime = createChatHandler({
    loadSession: async () => ({ session: SESSION }),
    env,
    store: createMemoryHouseStore(),
    routineStore: createMemoryRoutineStore(),
    sessionMemory: emptyMemory,
    loadPrefs: async () => true,
    chatLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    ipLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    commandLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: () => Date.parse("2026-11-09T18:00:00.000Z"),
    fetchImpl,
  });
  const missing = mockRes();
  await askTime({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { text: "na hora do jogo aumenta o ar" },
  }, missing);
  assert.match(missing.body.reply_text, /horário do jogo/i);
});

test("live Gemini grounding for a current-news question if keys exist", async (t) => {
  const keys = geminiKeys(process.env);
  if (!keys.length) {
    t.skip("no GEMINI_API_KEY in env");
    return;
  }
  const result = await searchGeminiGrounded({
    env: process.env,
    query: "principal notícia do Brasil hoje",
    fetchImpl: globalThis.fetch,
  });
  assert.equal(typeof result.text, "string");
  if (result.grounded) {
    assert.ok(result.hits.length >= 1);
    assert.match(result.hits[0].url, /^https?:\/\//);
  }
});
