import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { AC_ID, acCell, applyAcPatch, clampTemp } from "../lib/gen/ac.js";
import { DEVICE_IDS, applyDevicePatch, normalizeLights } from "../lib/gen/devices.js";
import { validateToolCall } from "../lib/gen/tools.js";
import { executeHouseTool } from "../lib/gen/executor.js";
import { createMemoryHouseStore } from "../lib/gen/house-store.js";
import { createMemoryRoutineStore } from "../lib/gen/routine-store.js";
import { createDeviceHandler } from "../api/house/device.js";
import { createChatHandler } from "../api/gen/chat.js";
import { createRoutinesRunHandler } from "../api/routines/run.js";
import { defaultHouseState } from "../lib/gen/defaults.js";
import { parseHouseIntent, plannedActions } from "../lib/gen/intent.js";
import { parseRoutineRequest, isRoutineDue, detectRoutinePatterns } from "../lib/gen/routines.js";
import { searchWeb, parseDuckDuckGo } from "../lib/gen/media.js";
import { buildSystemInstruction } from "../lib/gen/persona.js";
import { envAllowsProfanity, personalityLines, profanityAllowed } from "../lib/gen/profanity.js";
import { createRateLimiter } from "../lib/gen/rate-limit.js";

const SESSION = {
  id: "AB3K7Q",
  session_code: "AB3K7Q",
  display_name: "André",
  profile_id: "Acolhedor",
  status: "active",
  user_id: "user-1",
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

test("ar_condicionado is a first-class device with temp mode fan", () => {
  assert.ok(DEVICE_IDS.includes(AC_ID));
  assert.equal(clampTemp(20), 20);
  assert.equal(clampTemp(9), 16);
  const on = applyAcPatch(acCell({}), { on: true, temp: 20, mode: "frio", fan: "2" });
  assert.equal(on.on, true);
  assert.equal(on.temp, 20);
  assert.equal(on.mode, "frio");
  assert.equal(on.fan, "2");
  const lights = normalizeLights({});
  assert.equal(lights.ar_condicionado.on, false);
  const patched = applyDevicePatch(defaultHouseState("AB3K7Q"), { device_id: "ar_condicionado", on: true, temp: 20 });
  assert.equal(patched.lights.ar_condicionado.on, true);
  assert.equal(patched.lights.ar_condicionado.temp, 20);
});

test("set_device and Gen intent understand liga o ar no 20", async () => {
  assert.equal(validateToolCall("set_device", { device_id: "ar_condicionado", on: true, temp: 20 }).ok, true);
  const intent = parseHouseIntent("liga o ar no 20");
  assert.equal(intent.device, "ar_condicionado");
  assert.equal(intent.acTemp, 20);
  const plan = plannedActions(intent, defaultHouseState("AB3K7Q"));
  assert.equal(plan[0].args.device_id, "ar_condicionado");
  assert.equal(plan[0].args.temp, 20);
  const off = parseHouseIntent("desliga o ar");
  assert.equal(off.acOff, true);

  const store = createMemoryHouseStore();
  const painted = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "set_device",
    args: { device_id: "ar_condicionado", on: true, temp: 20, mode: "frio" },
    store,
    limiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: Date.parse("2026-11-09T01:00:00.000Z"),
  });
  assert.equal(painted.status, "accepted");
  assert.equal(painted.state.lights.ar_condicionado.temp, 20);

  const handler = createDeviceHandler({
    loadSession: async () => ({ session: SESSION }),
    store,
    limiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: () => Date.parse("2026-11-09T01:00:00.000Z"),
  });
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { device_id: "ar_condicionado", on: false },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state.lights.ar_condicionado.on, false);
});

test("GEN_PROFANITY and per-user toggle change the system prompt", () => {
  assert.equal(envAllowsProfanity({}), true);
  assert.equal(envAllowsProfanity({ GEN_PROFANITY: "off" }), false);
  assert.equal(profanityAllowed({ GEN_PROFANITY: "on" }, false), false);
  assert.match(personalityLines(true).join(" "), /Palavrões leves/);
  assert.match(personalityLines(false).join(" "), /Não use palavrão/);
  const hot = buildSystemInstruction(SESSION, defaultHouseState("AB3K7Q"), "", { profanity: true });
  const cool = buildSystemInstruction(SESSION, defaultHouseState("AB3K7Q"), "", { profanity: false });
  assert.match(hot, /nunca xingue ela|Palavrões leves/i);
  assert.match(cool, /Não use palavrão/);
  assert.match(hot, /Não invente/);
  assert.match(hot, /ar_condicionado/);
});

test("web_search uses DuckDuckGo then Wikipedia and cites titles", async () => {
  const ddg = parseDuckDuckGo({
    Heading: "Brasil",
    AbstractText: "País da América do Sul.",
    AbstractURL: "https://pt.wikipedia.org/wiki/Brasil",
    RelatedTopics: [],
  });
  assert.equal(ddg[0].title, "Brasil");
  const hits = await searchWeb({
    query: "capital do Brasil",
    fetchImpl: async (url) => {
      if (String(url).includes("duckduckgo")) {
        return new Response(JSON.stringify({
          Heading: "Brasília",
          AbstractText: "Capital federal.",
          AbstractURL: "https://pt.wikipedia.org/wiki/Brasília",
        }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(hits[0].title, "Brasília");
  const sql = fs.readFileSync(new URL("../sql/house_ac_routines.sql", import.meta.url), "utf8");
  assert.match(sql, /ac_cell_valid/);
  assert.match(sql, /grant execute on function genjutsu_internal.ac_cell_valid/i);
  assert.match(sql, /house_routines/);
  assert.match(sql, /owner reads house routines/);
  assert.doesNotMatch(sql, /SERVICE_ROLE_KEY|GROQ_API_KEY/);
});

test("routines parse Portuguese, run in Sao Paulo, and detect 3-day patterns", async () => {
  const parsed = parseRoutineRequest("todo dia às 7h acende o quarto e toca algo calmo");
  assert.equal(parsed.schedule.hour, 7);
  assert.equal(parsed.schedule.tz, "America/Sao_Paulo");
  assert.ok(parsed.actions.some((item) => item.args.device_id === "quarto_luz"));
  assert.ok(parsed.actions.some((item) => item.tool === "play_music"));

  const due = isRoutineDue({
    enabled: true,
    schedule: { hour: 7, minute: 0, days: [0, 1, 2, 3, 4, 5, 6], tz: "America/Sao_Paulo" },
    last_run_at: null,
  }, new Date("2026-11-09T10:00:00.000Z"));
  assert.equal(due, true);

  const patterns = detectRoutinePatterns([
    { tool: "set_device", status: "accepted", args: { device_id: "quarto_luz", on: true }, created_at: "2026-11-07T10:02:00.000Z" },
    { tool: "set_device", status: "accepted", args: { device_id: "quarto_luz", on: true }, created_at: "2026-11-08T10:01:00.000Z" },
    { tool: "set_device", status: "accepted", args: { device_id: "quarto_luz", on: true }, created_at: "2026-11-09T10:00:00.000Z" },
  ]);
  assert.ok(patterns.length >= 1);
  assert.match(patterns[0].hint, /Quer virar rotina/);

  const house = createMemoryHouseStore();
  const routines = createMemoryRoutineStore();
  await routines.create("user-1", "AB3K7Q", {
    name: "Manhã",
    hour: 7,
    minute: 0,
    days: [0, 1, 2, 3, 4, 5, 6],
    actions: [{ tool: "set_device", args: { device_id: "quarto_luz", on: true, intensity: 0.7 } }],
  });
  const run = createRoutinesRunHandler({
    env: { CRON_SECRET: "cron-secret" },
    store: house,
    routineStore: routines,
    limiter: createRateLimiter({ limit: 40, windowMs: 60_000 }),
    now: () => Date.parse("2026-11-09T10:00:00.000Z"),
  });
  const blocked = mockRes();
  await run({ method: "POST", headers: {} }, blocked);
  assert.equal(blocked.statusCode, 401);
  const ok = mockRes();
  await run({ method: "POST", headers: { authorization: "Bearer cron-secret" } }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.ran, 1);
  const state = await house.load("AB3K7Q");
  assert.equal(state.state.lights.quarto_luz.on, true);

  const created = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "create_routine",
    args: {
      name: "Ar 22",
      hour: 22,
      actions: [{ tool: "set_device", args: { device_id: "ar_condicionado", on: true, temp: 22 } }],
    },
    store: house,
    routineStore: routines,
    userId: "user-1",
    limiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: Date.parse("2026-11-09T01:00:00.000Z"),
  });
  assert.equal(created.status, "accepted");
  assert.ok(created.routines.length >= 1);
});

test("chat planned liga o ar no 20 and does not leak secrets", async () => {
  const store = createMemoryHouseStore();
  const handler = createChatHandler({
    loadSession: async () => ({ session: SESSION }),
    env: { GROQ_API_KEY: "groq-secret-do-not-leak" },
    store,
    routineStore: createMemoryRoutineStore(),
    loadPrefs: async () => true,
    chatLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    ipLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    commandLimiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: () => Date.parse("2026-11-09T01:00:00.000Z"),
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "Pronto — ar no 20 °C.", tool_calls: [] } }],
    }), { status: 200 }),
  });
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { text: "liga o ar no 20" },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state.lights.ar_condicionado.on, true);
  assert.equal(res.body.state.lights.ar_condicionado.temp, 20);
  assert.equal(JSON.stringify(res.body).includes("groq-secret-do-not-leak"), false);

  const js = fs.readFileSync(new URL("../js/casa.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../casa.html", import.meta.url), "utf8");
  assert.match(html, /Ar-condicionado|ar_condicionado|data-ac-temp|Rotinas/);
  assert.match(js, /ar_condicionado/);
  assert.doesNotMatch(js, /SUPABASE_SERVICE_ROLE|GROQ_API_KEY|TAVILY_API_KEY|BRAVE_API_KEY|CRON_SECRET/);
  const vercel = fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
  assert.match(vercel, /\/api\/routines\/run/);
});
