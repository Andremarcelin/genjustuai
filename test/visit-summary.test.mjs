import assert from "node:assert/strict";
import test from "node:test";
import { summarizeVisit, truncateQuote, isRejectedCommand } from "../lib/gen/visit-summary.js";
import summaryHandler from "../api/codigo/summary.js";

const HOST = "ahzsvjimyfzjcfuhgdgw.supabase.co";
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
  assert.deepEqual(visit.routines, ["Jogo"]);
  assert.ok(visit.durationLabel);
});

test("empty visit copy payload", () => {
  const visit = summarizeVisit({ history: [], commands: [{ tool: "set_device", status: "rejected", args: { device_id: "tv", on: true } }] });
  assert.equal(visit.empty, true);
  assert.equal(visit.conversations, 0);
  assert.equal(visit.devices.length, 0);
});

test("GET /api/codigo/summary uses the service role and hides rejected commands", async () => {
  const urls = [];
  global.fetch = async (url, options) => {
    urls.push({ url: String(url), auth: options.headers.Authorization });
    const path = String(url);
    if (path.includes("session_summaries")) return jsonResponse([{ session_code: "LRANG5" }]);
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
    SUPABASE_ANON_KEY: "anon-must-not-be-used",
    SUPABASE_SERVICE_ROLE: SERVICE,
  }, async () => {
    const res = mockRes();
    await summaryHandler({ method: "GET", url: "/api/codigo/summary?code=lrang5", query: { code: "lrang5" }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.session_code, "LRANG5");
    assert.equal(res.body.visit.conversations, 2);
    assert.equal(res.body.visit.devices.some((d) => d.id === "tv"), false);
    assert.equal(res.body.visit.devices.find((d) => d.id === "sala_luz").name, "Luz da sala");
    assert.deepEqual(res.body.visit.routines, ["Alarme 7h"]);
    assert.ok(urls.every((u) => u.auth === `Bearer ${SERVICE}`));
    assert.ok(urls.some((u) => u.url.includes("house_commands?session_id=eq.LRANG5")));
    assert.ok(urls.some((u) => u.url.includes("gen_history?session_code=eq.LRANG5")));
    const dumped = JSON.stringify(res.body);
    assert.equal(dumped.includes(SERVICE), false);
    assert.equal(dumped.includes(HOST), false);
  });
});

test("invalid or missing session codes fail closed", async () => {
  global.fetch = async () => jsonResponse([]);
  await withEnv({ SUPABASE_URL: `https://${HOST}`, SUPABASE_SERVICE_ROLE: SERVICE }, async () => {
    const bad = mockRes();
    await summaryHandler({ method: "GET", url: "/api/codigo/summary?code=NOPE", query: { code: "NOPE" }, headers: {} }, bad);
    assert.equal(bad.statusCode, 400);
    const missing = mockRes();
    await summaryHandler({ method: "GET", url: "/api/codigo/summary?code=AB3K7Q", query: { code: "AB3K7Q" }, headers: {} }, missing);
    assert.equal(missing.statusCode, 404);
  });
});
