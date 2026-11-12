import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { historyRows, questLine, voiceLine } from "../lib/gen/history.js";
import { createHistoryHandler } from "../api/gen/history.js";

const SESSION = { id: "AB3K7Q", session_code: "AB3K7Q", status: "active" };

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

function headsetBody(overrides = {}) {
  return {
    session_id: "AB3K7Q",
    role: "quest",
    text: "COMEÇAR",
    kind: "start",
    source: "quest",
    ...overrides,
  };
}

test("history rows keep the visitor, Gen and accepted house actions", () => {
  const rows = historyRows({
    source: "chat",
    transcript: "deixa a luz quente",
    reply: "Pronto. Deixei a luz quentinha.",
    actions: [
      { tool: "get_house_state", status: "accepted", args: {} },
      { tool: "set_lights", status: "accepted", args: { color: "#FFAA00" } },
      { tool: "set_ambience", status: "rejected", args: { preset: "bamboo" } },
    ],
  });
  assert.deepEqual(rows.map((row) => row.role), ["visitor", "gen", "house"]);
  assert.equal(rows[2].body, "Ajustou a luz da casa.");
  assert.doesNotMatch(rows[2].body, /#FFAA00/);
  assert.equal(voiceLine({ source: "voice", role: "visitor", body: "oi" }).kind, "transcript");
  assert.equal(voiceLine({ source: "quest", role: "visitor", body: "oi" }), null);
});

test("quest history line maps Unity HistoryBody onto gen_history columns", () => {
  const start = questLine(headsetBody());
  assert.equal(start.source, "quest");
  assert.equal(start.role, "visitor");
  assert.equal(start.kind, "transcript");
  assert.equal(start.body, "COMEÇAR");
  assert.equal(start.session_id, "AB3K7Q");

  const spoken = questLine(headsetBody({ role: "gen", text: "Oi, eu sou a Gen.", kind: "voice" }));
  assert.equal(spoken.role, "gen");
  assert.equal(spoken.kind, "reply");

  const tool = questLine(headsetBody({ role: "quest", text: "set_lights {\"zone\":\"main\"}", kind: "tool" }));
  assert.equal(tool.role, "house");
  assert.equal(tool.kind, "action");
  assert.equal(tool.tool, "set_lights");

  const house = questLine(headsetBody({ role: "quest", text: "house version 4", kind: "house" }));
  assert.equal(house.role, "house");
  assert.equal(house.kind, "action");

  assert.equal(questLine({ source: "voice", role: "visitor", body: "oi" }), null);
  assert.equal(questLine(headsetBody({ session_id: "bad" })), null);
});

test("gen history sql lets the owner read and nobody else write from the client", () => {
  const sql = fs.readFileSync(new URL("../sql/gen_history.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /auth\.uid\(\) = user_id/);
  assert.match(sql, /for select/);
  assert.match(sql, /grant select on public\.gen_history to authenticated/);
  assert.match(sql, /revoke all on public\.gen_history from anon, public/);
  assert.doesNotMatch(sql, /grant insert|grant all on public\.gen_history to anon|service_role/i);
  const client = fs.readFileSync(new URL("../js/gen-phone.js", import.meta.url), "utf8");
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE|service_role/);
  assert.match(client, /\/api\/gen\/history/);
});

test("GET /api/gen/history stays behind a visitor JWT", async () => {
  const listed = [];
  const handler = createHistoryHandler({
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon" },
    fetchImpl: async () => new Response("{}", { status: 401 }),
    listHistory: async (args) => {
      listed.push(args);
      return { ok: true, entries: [] };
    },
  });
  const denied = mockRes();
  await handler({ method: "GET", headers: {}, query: {} }, denied);
  assert.equal(denied.statusCode, 401);
  assert.deepEqual(denied.body, { error: "unauthorized" });
  assert.equal(listed.length, 0);
});

test("POST /api/gen/history accepts the Quest body for the active session without a JWT", async () => {
  const recorded = [];
  const handler = createHistoryHandler({
    loadSession: async () => ({ session: SESSION }),
    recordSessionHistory: async (args) => {
      recorded.push(args);
      return { ok: true };
    },
  });
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: headsetBody({ text: "COMEÇAR", kind: "start" }),
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].sessionCode, "AB3K7Q");
  assert.equal(recorded[0].expectedUserId, undefined);
  assert.equal(recorded[0].rows[0].body, "COMEÇAR");
  assert.equal(recorded[0].rows[0].source, "quest");
});

test("POST /api/gen/history rejects a Quest write for a session that is not active", async () => {
  const recorded = [];
  const handler = createHistoryHandler({
    loadSession: async () => ({ session: SESSION }),
    recordSessionHistory: async (args) => {
      recorded.push(args);
      return { ok: true };
    },
  });
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: headsetBody({ session_id: "ZZZZZ2", text: "sneak" }),
  }, res);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "forbidden" });
  assert.equal(recorded.length, 0);

  const idle = createHistoryHandler({
    loadSession: async () => ({ session: null }),
    recordSessionHistory: async (args) => {
      recorded.push(args);
      return { ok: true };
    },
  });
  const blocked = mockRes();
  await idle({
    method: "POST",
    headers: {},
    body: headsetBody(),
  }, blocked);
  assert.equal(blocked.statusCode, 409);
  assert.deepEqual(blocked.body, { error: "no_active_session" });
});
