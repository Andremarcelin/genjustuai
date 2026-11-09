import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createDeviceHandler } from "../api/house/device.js";
import { createHouseStateHandler } from "../api/house/state.js";
import { createChatHandler } from "../api/gen/chat.js";
import { createMemoryHouseStore } from "../lib/gen/house-store.js";
import { executeHouseTool } from "../lib/gen/executor.js";
import { defaultHouseState } from "../lib/gen/defaults.js";
import { DEVICE_IDS, normalizeLights } from "../lib/gen/devices.js";
import { validateToolCall } from "../lib/gen/tools.js";
import { parseHouseIntent, plannedActions } from "../lib/gen/intent.js";
import { chooseReply } from "../lib/gen/persona.js";
import { createRateLimiter } from "../lib/gen/rate-limit.js";
import { loadSessionForUser } from "../api/session.js";
import { readSupabaseConfig } from "../lib/supabase-rest.cjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { suggestionsFor } = require("../js/casa-suggestions.js");
const { houseTitle, overlayLights } = require("../js/casa-view.js");

const SESSION = {
  id: "AB3K7Q",
  session_code: "AB3K7Q",
  display_name: "André",
  profile_id: "Acolhedor",
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

function limiter() {
  return createRateLimiter({ limit: 20, windowMs: 60_000 });
}

test("device ids are stable and aliases keep Quest main/lanterns", () => {
  assert.deepEqual(DEVICE_IDS, ["sala_luz", "quarto_luz", "abajur", "fita_led", "tv", "ambiente"]);
  const lights = normalizeLights({
    main: { intensity: 0.8, color: "#00ffaa" },
    lanterns: { intensity: 0.1, color: "#112233" },
  });
  assert.equal(lights.main.color, "#00FFAA");
  assert.equal(lights.sala_luz.on, true);
  assert.equal(lights.sala_luz.color, "#00FFAA");
  assert.equal(lights.sala_luz.intensity, 0.8);
  assert.equal(lights.quarto_luz.on, true);
  const off = normalizeLights({
    sala_luz: { on: false, color: "#FF1A1A", intensity: 0.9 },
    lanterns: { intensity: 0, color: "#FF1A1A" },
  });
  assert.equal(off.main.intensity, 0);
  assert.equal(off.sala_luz.on, false);
  assert.equal(off.sala_luz.intensity, 0.9);
});

test("set_device paints sala_luz and mirrors main for the Quest", async () => {
  const store = createMemoryHouseStore();
  const painted = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "set_device",
    args: { device_id: "sala_luz", on: true, color: "#ff1a1a", intensity: 0.85 },
    store,
    limiter: limiter(),
    now: Date.parse("2026-11-09T01:00:00.000Z"),
  });
  assert.equal(painted.status, "accepted");
  assert.equal(painted.state.lights.sala_luz.on, true);
  assert.equal(painted.state.lights.sala_luz.color, "#FF1A1A");
  assert.equal(painted.state.lights.main.color, "#FF1A1A");
  assert.equal(painted.state.lights.main.intensity, 0.85);
  assert.equal(validateToolCall("set_device", { device_id: "hall", on: true }).ok, false);
  assert.equal(validateToolCall("set_device", { device_id: "sala_luz" }).ok, false);
  assert.equal(validateToolCall("list_devices", {}).ok, true);
});

test("POST /api/house/device toggles a device on the visitor session", async () => {
  const store = createMemoryHouseStore();
  await store.save(defaultHouseState("AB3K7Q"), 0);
  const handler = createDeviceHandler({
    loadSession: async () => ({ session: SESSION }),
    store,
    limiter: limiter(),
    now: () => Date.parse("2026-11-09T01:00:00.000Z"),
  });
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { device_id: "abajur", on: true, color: "#FFF4E0", intensity: 0.4 },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "accepted");
  assert.equal(res.body.state.lights.abajur.on, true);
  assert.equal(res.body.state.lights.abajur.color, "#FFF4E0");
  assert.equal(res.body.state.lights.main.color, "#FF1A1A");

  const idle = createDeviceHandler({
    loadSession: async () => ({ session: null }),
    store,
    limiter: limiter(),
  });
  const blocked = mockRes();
  await idle({ method: "POST", headers: {}, body: { device_id: "tv", on: true } }, blocked);
  assert.equal(blocked.statusCode, 409);
});

test("GET /api/house/state still returns null without a session and includes devices with one", async () => {
  const empty = createHouseStateHandler({ loadSession: async () => ({ session: null }) });
  const res = mockRes();
  await empty({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state, null);

  const ready = createHouseStateHandler({
    loadSession: async () => ({ session: SESSION }),
    readState: async () => ({ state: null }),
  });
  const res2 = mockRes();
  await ready({ method: "GET", headers: {} }, res2);
  assert.equal(res2.body.state.lights.sala_luz.on, true);
  assert.equal(res2.body.devices.length, 6);
  assert.equal(res2.body.session.display_name, "André");
});

test("Gen planned set_device for deixa a sala vermelha and chat runs the tool", async () => {
  const intent = parseHouseIntent("deixa a sala vermelha");
  assert.equal(intent.device, "sala_luz");
  assert.equal(intent.hex, "#FF1A1A");
  const plan = plannedActions(intent, defaultHouseState("AB3K7Q"));
  assert.equal(plan[0].tool, "set_device");
  assert.equal(plan[0].args.device_id, "sala_luz");
  assert.equal(plan[0].args.color, "#FF1A1A");

  const store = createMemoryHouseStore();
  const handler = createChatHandler({
    loadSession: async () => ({ session: SESSION }),
    env: { GROQ_API_KEY: "groq-secret-do-not-leak" },
    store,
    chatLimiter: limiter(),
    ipLimiter: limiter(),
    commandLimiter: limiter(),
    now: () => Date.parse("2026-11-09T01:00:00.000Z"),
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{
        message: {
          role: "assistant",
          content: "Pronto — pintei a Luz Sala de vermelho (#FF1A1A).",
          tool_calls: [],
        },
      }],
    }), { status: 200 }),
  });
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { text: "deixa a sala vermelha" },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.actions[0].tool, "set_device");
  assert.equal(res.body.actions[0].status, "accepted");
  assert.equal(res.body.state.lights.sala_luz.color, "#FF1A1A");
  assert.equal(res.body.state.lights.main.color, "#FF1A1A");
  assert.match(res.body.reply_text, /#FF1A1A/);
  assert.equal(JSON.stringify(res.body).includes("groq-secret-do-not-leak"), false);
  assert.match(chooseReply({
    modelText: "Pronto — pintei a Luz Sala de vermelho (#FF1A1A).",
    actions: res.body.actions,
    transcript: "deixa a sala vermelha",
    state: res.body.state,
  }), /#FF1A1A/);
});

test("casa SQL keeps Quest aliases and locks owner read", () => {
  const sql = fs.readFileSync(new URL("../sql/house_devices.sql", import.meta.url), "utf8");
  assert.match(sql, /sala_luz/);
  assert.match(sql, /owner reads house state/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /revoke all on public\.house_state from anon/);
  assert.match(sql, /grant select on public\.house_state to authenticated/);
  assert.doesNotMatch(sql, /SUPABASE_SERVICE_ROLE|service_role key/i);
});

test("suggestions depend on profile and can be applied as device patches", () => {
  const night = suggestionsFor("Acolhedor", new Date("2026-11-09T22:00:00"));
  assert.ok(night.some((item) => item.patches[0].device_id === "abajur"));
  assert.ok(night.every((item) => item.patches.every((patch) => DEVICE_IDS.includes(patch.device_id))));
});

test("casa page is Portuguese and has the Gen pill", () => {
  const html = fs.readFileSync(new URL("../casa.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../casa.css", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../js/casa.js", import.meta.url), "utf8");
  assert.match(html, /lang="pt-BR"/);
  assert.match(html, /Pergunte para o Gen/);
  assert.match(html, /Dispositivos/);
  assert.match(html, /Grupos/);
  assert.match(css, /#ff1a1a/i);
  assert.doesNotMatch(js, /SUPABASE_SERVICE_ROLE|GROQ_API_KEY|GEMINI_API_KEY/);
  assert.match(html, /js\/casa-view\.js/);
  assert.match(js, /deviceFromState\(item\.id\)/);
  assert.match(js, /overlayLights|houseTitle/);
});

test("overlay uses stateful devices so color and intensity exist", () => {
  const meta = [
    { id: "sala_luz", overlay: "sala" },
    { id: "abajur", overlay: "quarto" },
  ];
  const mapped = meta.map((item) => item.id === "sala_luz"
    ? { id: "sala_luz", overlay: "sala", on: true, color: "#FF1A1A", intensity: 0.85 }
    : { id: "abajur", overlay: "quarto", on: false, color: "#FFAA00", intensity: 0.4 });
  const sala = overlayLights(mapped, "sala");
  assert.equal(sala.length, 1);
  assert.equal(sala[0].color, "#FF1A1A");
  assert.equal(Number.isFinite(sala[0].intensity), true);
  assert.equal(overlayLights(meta, "sala").length, 0);
});

test("header uses the full typed name", () => {
  assert.equal(houseTitle("André Teste"), "Casa de André Teste");
  assert.equal(houseTitle("  André   Teste  "), "Casa de André Teste");
  assert.equal(houseTitle(""), "Sua casa");
});

test("visitor session lookup uses the anon key and does not require a service role", async () => {
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  delete process.env.SUPABASE_SERVICE_ROLE;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-for-session-read";
  let auth = "";
  let path = "";
  global.fetch = async (url, opts) => {
    path = String(url);
    auth = opts.headers.Authorization;
    return new Response(JSON.stringify([{
      session_code: "AB3K7Q",
      display_name: "André Teste",
      personality_text: "ok",
      archetype: "Acolhedor",
      profile_id: "Acolhedor",
      status: "ready",
    }]), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const found = await loadSessionForUser("user-1");
    assert.equal(found.session.display_name, "André Teste");
    assert.equal(auth, "Bearer anon-for-session-read");
    assert.match(path, /session_summaries/);
    assert.doesNotMatch(auth, /service/i);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("service role aliases match the names already used on Vercel", () => {
  const fromAlias = readSupabaseConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "role-alias",
  }, { serviceRoleOnly: true });
  assert.equal(fromAlias.key, "role-alias");
  const fromLegacy = readSupabaseConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE: "role-legacy",
  }, { serviceRoleOnly: true });
  assert.equal(fromLegacy.key, "role-legacy");
  const secret = readSupabaseConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "secret-alias",
  }, { serviceRoleOnly: true });
  assert.equal(secret.key, "secret-alias");
});

