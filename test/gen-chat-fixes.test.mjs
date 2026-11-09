import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createChatHandler } from "../api/gen/chat.js";
import { createRoutinesHandler } from "../api/routines/index.js";
import { executeHouseTool } from "../lib/gen/executor.js";
import { createMemoryHouseStore } from "../lib/gen/house-store.js";
import { chooseReply, needsWebSearch } from "../lib/gen/persona.js";
import { completeChat, geminiKeys } from "../lib/gen/providers.js";
import { createRateLimiter } from "../lib/gen/rate-limit.js";
import { createMemoryRoutineStore } from "../lib/gen/routine-store.js";
import { parseClock, parseDays, parseRoutineActions, parseRoutineRequest } from "../lib/gen/routines.js";
import { validateToolCall } from "../lib/gen/tools.js";
import { describeWeather, fetchWeather, isWeatherQuestion } from "../lib/gen/weather.js";
import { GEMINI_GENERATE_URL, GEMINI_TEXT_MODEL, GROQ_CHAT_URL } from "../lib/gen/constants.js";

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

function groqText(text) {
  return new Response(JSON.stringify({
    choices: [{ message: { role: "assistant", content: text, tool_calls: [] } }],
  }), { status: 200 });
}

test("anonymous session can create list and delete routines", async () => {
  const house = createMemoryHouseStore();
  const routines = createMemoryRoutineStore();
  const created = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "create_routine",
    args: {
      name: "Alarme",
      hour: 6,
      minute: 30,
      actions: [
        { tool: "play_music", args: { query: "alarm bell", mood: "alarme" } },
        { tool: "set_device", args: { device_id: "quarto_luz", on: true } },
      ],
    },
    store: house,
    routineStore: routines,
    userId: null,
    limiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: Date.parse("2026-11-09T01:00:00.000Z"),
  });
  assert.equal(created.status, "accepted");
  assert.equal(created.reason, undefined);
  assert.equal(created.routines.length, 1);
  assert.equal(routines.rows[0].user_id, null);
  assert.equal(routines.rows[0].session_id, "AB3K7Q");

  const listed = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "list_routines",
    args: {},
    store: house,
    routineStore: routines,
    userId: null,
    limiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: Date.parse("2026-11-09T01:00:01.000Z"),
  });
  assert.equal(listed.status, "accepted");
  assert.equal(listed.routines.length, 1);

  const missing = await executeHouseTool({
    sessionId: "",
    tool: "create_routine",
    args: { name: "x", hour: 7, actions: [{ tool: "play_music", args: {} }] },
    store: house,
    routineStore: routines,
    userId: null,
  });
  assert.equal(missing.status, "rejected");
  assert.equal(missing.reason, "missing_session");

  const bad = validateToolCall("create_routine", { name: "x" });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "invalid_args");

  const handler = createRoutinesHandler({
    loadSession: async () => ({ session: SESSION }),
    store: routines,
    houseStore: house,
    now: () => Date.parse("2026-11-09T01:00:02.000Z"),
  });
  const getRes = mockRes();
  await handler({ method: "GET", headers: {} }, getRes);
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.body.routines.length, 1);

  const delRes = mockRes();
  await handler({
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: { id: created.routines[0].id },
  }, delRes);
  assert.equal(delRes.statusCode, 200);
  assert.equal(delRes.body.routines.length, 0);

  const sql = fs.readFileSync(new URL("../sql/house_routines_session.sql", import.meta.url), "utf8");
  assert.match(sql, /alter column user_id drop not null/i);
  assert.match(sql, /house_routines_session_idx/);
  const js = fs.readFileSync(new URL("../js/casa.js", import.meta.url), "utf8");
  assert.match(js, /loadRoutines/);
  assert.doesNotMatch(js, /if \(!user \|\| !token\)/);
  assert.doesNotMatch(js, /GROQ_API_KEY|GEMINI_API_KEY|SUPABASE_SERVICE_ROLE/);
});

test("alarm phrasing parses one-shot, weekdays and default sound plus lights", () => {
  const wake = parseRoutineRequest("me acorda às 6:30");
  assert.equal(parseClock("me acorda às 6:30").hour, 6);
  assert.equal(parseClock("me acorda às 6:30").minute, 30);
  assert.equal(wake.schedule.hour, 6);
  assert.equal(wake.schedule.minute, 30);
  assert.equal(wake.schedule.once, false);
  assert.ok(wake.actions.some((item) => item.tool === "play_music" && item.args.mood === "alarme"));
  assert.ok(wake.actions.some((item) => item.args?.device_id === "quarto_luz" && item.args.on === true));
  assert.ok(wake.actions.some((item) => item.args?.device_id === "sala_luz"));

  const tomorrow = parseRoutineRequest("me acorda amanhã 6h", new Date("2026-11-09T15:00:00.000Z"));
  assert.equal(tomorrow.schedule.hour, 6);
  assert.equal(tomorrow.schedule.once, true);
  assert.deepEqual(tomorrow.schedule.days, [2]);

  const remind = parseRoutineRequest("me lembra de ligar o ar às 18h");
  assert.equal(remind.schedule.hour, 18);
  assert.equal(remind.schedule.once, true);
  assert.ok(remind.actions.some((item) => item.tool === "play_music"));

  assert.deepEqual(parseDays("todo dia"), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(parseDays("dias úteis"), [1, 2, 3, 4, 5]);
  const actions = parseRoutineActions("me acorda às 6:30");
  assert.ok(actions.length >= 2);
});

test("get_weather uses Open-Meteo and describes pt-BR", async () => {
  assert.equal(isWeatherQuestion("vai chover? preciso sair"), true);
  assert.equal(isWeatherQuestion("liga a sala"), false);
  assert.match(describeWeather({ name: "Taboão da Serra" }, {
    temp: 18, condition: "nublado", humidity: 80, wind: 12, rainChance: 20,
  }), /Em Taboão da Serra agora: 18 °C, nublado/);
  assert.match(describeWeather({ name: "Taboão da Serra" }, {
    temp: 18, condition: "nublado", humidity: 80, wind: 12, rainChance: 20,
  }), /casaco/);

  const weather = await fetchWeather({
    city: "Taboão da Serra",
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes("geocoding-api.open-meteo.com")) {
        return new Response(JSON.stringify({
          results: [{ name: "Taboão da Serra", latitude: -23.6, longitude: -46.78, country_code: "BR" }],
        }), { status: 200 });
      }
      if (href.includes("api.open-meteo.com")) {
        return new Response(JSON.stringify({
          current: { temperature_2m: 18.2, relative_humidity_2m: 81, weather_code: 3, wind_speed_10m: 11.4 },
          hourly: { precipitation_probability: [20, 30, 40] },
        }), { status: 200 });
      }
      throw new Error(href);
    },
  });
  assert.equal(weather.error, undefined);
  assert.match(weather.summary, /18 °C/);
  assert.match(weather.summary, /nublado/);

  const store = createMemoryHouseStore();
  const outcome = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "get_weather",
    args: {},
    store,
    env: { GEN_DEFAULT_CITY: "Taboão da Serra" },
    sessionCity: "",
    limiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: Date.parse("2026-11-09T01:00:00.000Z"),
    fetchImpl: async (url) => {
      if (String(url).includes("geocoding")) {
        return new Response(JSON.stringify({
          results: [{ name: "Taboão da Serra", latitude: -23.6, longitude: -46.78, country_code: "BR" }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        current: { temperature_2m: 18, relative_humidity_2m: 70, weather_code: 3, wind_speed_10m: 10 },
        hourly: { precipitation_probability: [10] },
      }), { status: 200 });
    },
  });
  assert.equal(outcome.status, "accepted");
  assert.match(outcome.weather.summary, /Taboão da Serra/);

  const chat = createChatHandler({
    loadSession: async () => ({ session: SESSION }),
    env: { GROQ_API_KEY: "groq-secret-do-not-leak", GEN_DEFAULT_CITY: "Taboão da Serra" },
    store: createMemoryHouseStore(),
    routineStore: createMemoryRoutineStore(),
    loadPrefs: async () => true,
    chatLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    ipLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    commandLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: () => Date.parse("2026-11-09T01:00:00.000Z"),
    fetchImpl: async (url) => {
      if (String(url).includes("open-meteo")) {
        if (String(url).includes("geocoding")) {
          return new Response(JSON.stringify({
            results: [{ name: "Taboão da Serra", latitude: -23.6, longitude: -46.78, country_code: "BR" }],
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          current: { temperature_2m: 18, relative_humidity_2m: 70, weather_code: 3, wind_speed_10m: 10 },
          hourly: { precipitation_probability: [15] },
        }), { status: 200 });
      }
      return groqText("Em Taboão da Serra agora: 18 °C, nublado… leva um casaco.");
    },
  });
  const res = mockRes();
  await chat({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { text: "qual o clima? preciso sair" },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.actions[0].tool, "get_weather");
  assert.match(res.body.reply_text, /casaco|nublado|18/);
  assert.equal(JSON.stringify(res.body).includes("groq-secret-do-not-leak"), false);
});

test("Groq 429 after retry falls back to Gemini flash lite keys", async () => {
  assert.deepEqual(geminiKeys({
    GEMINI_API_KEY: "k1",
    GEMINI_API_KEY_2: "k2",
    GEMINI_API_KEY_3: "k3",
  }), ["k1", "k2", "k3"]);

  const seen = [];
  const result = await completeChat({
    env: { GROQ_API_KEY: "groq-secret", GEMINI_API_KEY: "bad", GEMINI_API_KEY_2: "good-gemini" },
    messages: [{ role: "system", content: "Você é Gen." }, { role: "user", content: "oi" }],
    fetchImpl: async (url, opts) => {
      seen.push(String(url));
      if (String(url) === GROQ_CHAT_URL) return new Response("rate", { status: 429 });
      if (String(url) === GEMINI_GENERATE_URL) {
        const key = opts.headers["x-goog-api-key"];
        if (key === "bad") return new Response("{}", { status: 429 });
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Oi, Lina. Tô aqui." }] } }],
        }), { status: 200 });
      }
      throw new Error(String(url));
    },
  });
  assert.equal(result.message.content, "Oi, Lina. Tô aqui.");
  assert.equal(result.provider, "gemini");
  assert.equal(result.model, GEMINI_TEXT_MODEL);
  assert.equal(seen.filter((url) => url === GROQ_CHAT_URL).length, 2);
  assert.ok(seen.includes(GEMINI_GENERATE_URL));
  assert.equal(JSON.stringify(result).includes("groq-secret"), false);
  assert.equal(JSON.stringify(result).includes("good-gemini"), false);
});

test("empty search suffix only when search was needed", () => {
  assert.equal(needsWebSearch("oi, tudo bem?"), false);
  assert.equal(needsWebSearch("pesquisa quem é Machado de Assis"), true);
  const hello = chooseReply({
    modelText: "Oi, Lina. Tô por aqui.",
    actions: [{ tool: "web_search", status: "accepted", search: [] }],
    transcript: "oi, tudo bem?",
    state: { lights: { main: { color: "#FF1A1A", intensity: 0.3 } }, ambience: { preset: "quiet" } },
  });
  assert.equal(hello, "Oi, Lina. Tô por aqui.");
  assert.doesNotMatch(hello, /Olhei na internet/);
  const needed = chooseReply({
    modelText: "",
    actions: [{ tool: "web_search", status: "accepted", search: [] }],
    transcript: "pesquisa quem é Machado de Assis",
    state: {},
  });
  assert.equal(needed, "Olhei na internet e não achei uma fonte.");
});

test("anonymous chat creates a wake routine without login", async () => {
  const store = createMemoryHouseStore();
  const routines = createMemoryRoutineStore();
  const handler = createChatHandler({
    loadSession: async () => ({ session: SESSION }),
    env: { GROQ_API_KEY: "groq-secret-do-not-leak" },
    store,
    routineStore: routines,
    loadPrefs: async () => true,
    chatLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    ipLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    commandLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: () => Date.parse("2026-11-09T01:00:00.000Z"),
    fetchImpl: async () => groqText(" combinado, te acordo às 6:30."),
  });
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { text: "me acorda às 6:30" },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.actions[0].tool, "create_routine");
  assert.equal(res.body.actions[0].status, "accepted");
  assert.equal(routines.rows[0].user_id, null);
  assert.equal(JSON.stringify(res.body).includes("groq-secret-do-not-leak"), false);
});
