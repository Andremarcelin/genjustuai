import assert from "node:assert/strict";
import test from "node:test";
import { summarizeVisit, truncateQuote, isRejectedCommand } from "../lib/gen/visit-summary.js";
import sessionHandler from "../api/session.js";

const HOST = "ahzsvjimyfzjcfuhgdgw.supabase.co";
const ANON = "sb_test_anon_key_do_not_leak";
const SERVICE = "sb_test_service_role_do_not_leak";

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function withEnv(env, fn) {
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  for (const key of Object.keys(previous)) delete process.env[key];
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

test("quotes truncate and rejected commands are skipped", () => {
  assert.equal(truncateQuote("oi"), "oi");
  assert.ok(truncateQuote("x".repeat(90)).endsWith("…"));
  assert.equal(isRejectedCommand({ status: "rejected" }), true);
  const visit = summarizeVisit({
    history: [
      { kind: "transcript", role: "visitor", body: "liga a luz", created_at: "2026-11-09T10:00:00Z" },
      { kind: "transcript", role: "gen", body: "beleza", created_at: "2026-11-09T10:00:01Z" },
    ],
    commands: [
      { tool: "set_device", status: "rejected", args: { device_id: "sala_luz", on: true }, created_at: "2026-11-09T10:00:02Z" },
      { tool: "set_device", status: "accepted", args: { device_id: "sala_luz", on: true }, created_at: "2026-11-09T10:00:03Z" },
      { tool: "set_device", status: "accepted", args: { device_id: "ar_condicionado", on: true, temp: 20 }, created_at: "2026-11-09T10:00:04Z" },
      { tool: "play_music", status: "accepted", args: { query: "rock" }, created_at: "2026-11-09T10:00:05Z" },
      { tool: "create_routine", status: "accepted", args: { name: "Jogo" }, created_at: "2026-11-09T10:00:06Z" },
    ],
  });
  assert.equal(visit.empty, false);
  assert.equal(visit.conversations, 2);
  assert.deepEqual(visit.quotes, ["liga a luz"]);
  assert.equal(visit.devices.find((d) => d.id === "sala_luz").name, "Luz da sala");
  assert.equal(visit.devices.find((d) => d.id === "ar_condicionado").value, "20 °C");
  assert.deepEqual(visit.music, ["rock"]);
  assert.equal(visit.routines[0].name, "Jogo");
  assert.ok(visit.durationLabel);
  assert.equal(visit.devices.find((d) => d.id === "sala_luz").changes, 1);
});

test("insights stay deterministic and omit guesses", () => {
  const visit = summarizeVisit({
    profileId: "Zen",
    history: [
      { kind: "transcript", role: "visitor", source: "chat", body: "qual o clima em Taboão?", created_at: "2026-11-09T10:00:00Z" },
      { kind: "transcript", role: "visitor", source: "chat", body: "e o jogo do Corinthians?", created_at: "2026-11-09T10:00:10Z" },
      { kind: "transcript", role: "visitor", source: "chat", body: "clima de novo", created_at: "2026-11-09T10:00:20Z" },
      { kind: "transcript", role: "visitor", source: "chat", body: "me acorda às 7h", created_at: "2026-11-09T10:00:30Z" },
      { kind: "action", source: "chat", tool: "get_weather", args: { city: "Taboão da Serra" }, created_at: "2026-11-09T10:00:05Z" },
      { kind: "action", source: "chat", tool: "create_routine", args: { name: "Alarme 7h", hour: 7 }, created_at: "2026-11-09T10:00:40Z" },
    ],
    commands: [
      { tool: "set_device", status: "accepted", args: { device_id: "ar_condicionado", on: true, temp: 20 }, created_at: "2026-11-09T10:01:00Z" },
      { tool: "set_device", status: "accepted", args: { device_id: "ar_condicionado", on: true, temp: 20 }, created_at: "2026-11-09T10:01:10Z" },
      { tool: "set_device", status: "accepted", args: { device_id: "ar_condicionado", on: true, temp: 21 }, created_at: "2026-11-09T10:01:20Z" },
      { tool: "set_device", status: "accepted", args: { device_id: "ar_condicionado", on: true, temp: 20 }, created_at: "2026-11-09T10:01:30Z" },
      { tool: "set_device", status: "accepted", args: { device_id: "sala_luz", on: true, intensity: 0.2 }, created_at: "2026-11-09T10:01:40Z" },
      { tool: "set_device", status: "accepted", args: { device_id: "sala_luz", on: true, intensity: 0.25 }, created_at: "2026-11-09T10:01:50Z" },
    ],
  });
  const texts = visit.insights.map((i) => i.text).join(" ");
  assert.match(texts, /fresco|luz baixa|chat|clima|rotina|Zen/i);
  assert.ok(visit.insights.every((i) => i.basis));
  assert.ok(visit.insights.length <= 4);
  assert.equal(visit.questions.some((q) => /Taboão/i.test(q)), true);
});

test("empty visit copy payload", () => {
  const visit = summarizeVisit({ history: [], commands: [{ tool: "set_device", status: "rejected", args: { device_id: "tv", on: true } }] });
  assert.equal(visit.empty, true);
  assert.equal(visit.conversations, 0);
  assert.equal(visit.devices.length, 0);
});

test("GET /api/session?code= attaches a visit summary via the service role and hides rejected commands", async () => {
  const urls = [];
  global.fetch = async (url, options) => {
    urls.push({ url: String(url), auth: options.headers.Authorization });
    const path = String(url);
    if (path.includes("session_summaries")) {
      return jsonResponse([{
        session_code: "LRANG5",
        display_name: "QA Prod26",
        personality_text: "ok",
        archetype: "Zen",
        profile_id: "Zen",
        status: "ready",
      }]);
    }
    if (path.includes("gen_history")) {
      return jsonResponse([
        { kind: "transcript", role: "visitor", body: "Oi Gen", created_at: "2026-11-09T19:00:00Z" },
        { kind: "transcript", role: "visitor", body: "me acorda às 7h", created_at: "2026-11-09T19:01:00Z" },
      ]);
    }
    if (path.includes("house_commands")) {
      return jsonResponse([
        { tool: "set_device", status: "rejected", args: { device_id: "tv", on: true }, created_at: "2026-11-09T19:02:00Z" },
        { tool: "set_lights", status: "accepted", args: { main: { on: true, intensity: 0.4 } }, created_at: "2026-11-09T19:03:00Z" },
      ]);
    }
    if (path.includes("house_routines")) return jsonResponse([{ name: "Alarme 7h", created_at: "2026-11-09T19:04:00Z" }]);
    return jsonResponse([]);
  };
  await withEnv({
    SUPABASE_URL: `https://${HOST}`,
    SUPABASE_ANON_KEY: ANON,
    SUPABASE_SERVICE_ROLE: SERVICE,
  }, async () => {
    const res = mockRes();
    await sessionHandler({ method: "GET", url: "/api/session?code=lrang5", query: { code: "lrang5" }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.session.session_code, "LRANG5");
    assert.equal(res.body.visit.conversations, 2);
    assert.equal(res.body.visit.devices.some((d) => d.id === "tv"), false);
    assert.equal(res.body.visit.devices.find((d) => d.id === "sala_luz").name, "Luz da sala");
    assert.equal(res.body.visit.routines[0].name, "Alarme 7h");
    assert.ok(urls.some((u) => u.url.includes("house_commands?session_id=eq.LRANG5") && u.auth === `Bearer ${SERVICE}`));
    assert.ok(urls.some((u) => u.url.includes("gen_history?session_code=eq.LRANG5") && u.auth === `Bearer ${SERVICE}`));
    assert.ok(urls.some((u) => u.url.includes("session_summaries") && u.auth === `Bearer ${ANON}`));
    const dumped = JSON.stringify(res.body);
    assert.equal(dumped.includes(SERVICE), false);
    assert.equal(dumped.includes(HOST), false);
  });
});

test("invalid or missing session codes fail closed before visit lookup", async () => {
  global.fetch = async () => jsonResponse([]);
  await withEnv({ SUPABASE_URL: `https://${HOST}`, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE: SERVICE }, async () => {
    const bad = mockRes();
    await sessionHandler({ method: "GET", url: "/api/session?code=NOPE", query: { code: "NOPE" }, headers: {} }, bad);
    assert.equal(bad.statusCode, 400);
    const missing = mockRes();
    await sessionHandler({ method: "GET", url: "/api/session?code=AB3K7Q", query: { code: "AB3K7Q" }, headers: {} }, missing);
    assert.equal(missing.statusCode, 404);
  });
});
