import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import sessionHandler, { sanitizeProfileId } from "../api/session.js";
import zcea from "../js/zcea-profile.js";
import adminHandler from "../api/admin/session.js";

const HOST = "ahzsvjimyfzjcfuhgdgw.supabase.co";
const ANON = "sb_test_anon_key_do_not_leak";
const SERVICE = "sb_test_service_role_do_not_leak";

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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function leaked(res) {
  return JSON.stringify({ status: res.statusCode, body: res.body, headers: res.headers });
}

async function withEnv(env, fn) {
  const previous = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE,
    ADMIN_SECRET: process.env.ADMIN_SECRET,
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

test("GET /api/session without config is missing_config and does not call fetch", async () => {
  let called = false;
  global.fetch = async () => { called = true; throw new Error("nope"); };
  await withEnv({}, async () => {
    const res = mockRes();
    await sessionHandler({ method: "GET", query: { code: "AB3K7Q" }, headers: {} }, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: "missing_config" });
    assert.equal(called, false);
  });
});

test("dead Supabase DNS becomes supabase_unreachable without leaking host or key", async () => {
  global.fetch = async () => {
    throw new Error(`getaddrinfo ENOTFOUND ${HOST} key=${ANON}`);
  };
  await withEnv({ SUPABASE_URL: `https://${HOST}`, SUPABASE_ANON_KEY: ANON }, async () => {
    const res = mockRes();
    await sessionHandler({ method: "GET", query: {}, headers: {} }, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: "supabase_unreachable" });
    const raw = leaked(res);
    assert.equal(raw.includes(HOST), false);
    assert.equal(raw.includes(ANON), false);
    assert.equal(raw.includes("ENOTFOUND"), false);
  });
});

test("empty app_state is no_current_session and a missing summary is not_found", async () => {
  global.fetch = async (url) => {
    if (String(url).includes("app_state")) return jsonResponse([]);
    return jsonResponse([]);
  };
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: ANON }, async () => {
    const empty = mockRes();
    await sessionHandler({ method: "GET", query: {}, headers: {} }, empty);
    assert.equal(empty.statusCode, 404);
    assert.deepEqual(empty.body, { error: "no_current_session" });

    const missing = mockRes();
    await sessionHandler({ method: "GET", query: { code: "AB3K7Q" }, headers: {} }, missing);
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.body, { error: "not_found" });
  });
});

test("summary JSON includes a sanitized profile_id and keeps archetype", async () => {
  global.fetch = async () => jsonResponse([{
    session_code: "AB3K7Q",
    display_name: "Ana",
    personality_text: "Ana está no perfil Excêntrico (E).",
    archetype: "Excêntrico",
    profile_id: "Excentrico",
  }]);
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: ANON }, async () => {
    const res = mockRes();
    await sessionHandler({ method: "GET", query: { code: "ab3k7q" }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.profile_id, "Excentrico");
    assert.equal(res.body.archetype, "Excêntrico");
    assert.equal(res.body.session_code, "AB3K7Q");
  });
});

test("unknown profile_id is returned as null and a missing column falls back", async () => {
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    if (String(url).includes("profile_id")) {
      return jsonResponse({
        code: "PGRST204",
        message: `Could not find the 'profile_id' column. key=${ANON}`,
      }, 400);
    }
    return jsonResponse([{
      session_code: "AB3K7Q",
      display_name: "Ana",
      personality_text: "texto",
      archetype: "Ritmo ativo",
      profile_id: "Zenith",
    }]);
  };
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: ANON }, async () => {
    const res = mockRes();
    await sessionHandler({ method: "GET", query: { code: "AB3K7Q" }, headers: {} }, res);
    assert.equal(calls, 2);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.profile_id, null);
    assert.equal(res.body.archetype, "Ritmo ativo");
    assert.equal(leaked(res).includes(ANON), false);
  });
});

test("public session ignores service role and a rejected anon key is missing_config", async () => {
  let called = false;
  global.fetch = async () => { called = true; return jsonResponse({ message: "no" }, 401); };
  await withEnv({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE: SERVICE,
  }, async () => {
    const res = mockRes();
    await sessionHandler({ method: "GET", query: { code: "AB3K7Q" }, headers: {} }, res);
    assert.equal(called, false);
    assert.deepEqual(res.body, { error: "missing_config" });
  });

  global.fetch = async () => jsonResponse({ message: SERVICE, hint: ANON }, 401);
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: ANON }, async () => {
    const res = mockRes();
    await sessionHandler({ method: "GET", query: { code: "AB3K7Q" }, headers: {} }, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: "missing_config" });
    assert.equal(leaked(res).includes(ANON), false);
    assert.equal(leaked(res).includes(SERVICE), false);
  });
});

test("admin session reports unreachable and does not echo upstream detail", async () => {
  global.fetch = async () => {
    throw new Error(`connect ${HOST} ${SERVICE}`);
  };
  await withEnv({
    SUPABASE_URL: `https://${HOST}`,
    SUPABASE_ANON_KEY: ANON,
    SUPABASE_SERVICE_ROLE: SERVICE,
  }, async () => {
    const res = mockRes();
    await adminHandler({
      method: "GET",
      headers: { authorization: "Bearer genjutsu" },
    }, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: "supabase_unreachable" });
    const raw = leaked(res);
    assert.equal(raw.includes(HOST), false);
    assert.equal(raw.includes(ANON), false);
    assert.equal(raw.includes(SERVICE), false);
    assert.equal(Object.hasOwn(res.body, "detail"), false);
  });
});

test("admin POST schema miss is need_sql without the postgres payload", async () => {
  global.fetch = async () => jsonResponse({
    code: "PGRST202",
    message: `function genjutsu_set_current_session does not exist ${ANON}`,
  }, 404);
  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: ANON }, async () => {
    const res = mockRes();
    await adminHandler({
      method: "POST",
      headers: { authorization: "Bearer genjutsu", "content-type": "application/json" },
      body: { code: "AB3K7Q" },
    }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, "need_sql");
    assert.equal(Object.hasOwn(res.body, "detail"), false);
    assert.equal(leaked(res).includes(ANON), false);
  });
});

test("admin without env is missing_config and a bad pin does not reach Supabase", async () => {
  let called = false;
  global.fetch = async () => { called = true; return jsonResponse([]); };
  await withEnv({}, async () => {
    const res = mockRes();
    await adminHandler({
      method: "GET",
      headers: { authorization: "Bearer genjutsu" },
    }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, "missing_config");
    assert.equal(called, false);
    assert.equal(leaked(res).includes("service_role"), false);
  });

  await withEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: ANON }, async () => {
    const res = mockRes();
    await adminHandler({ method: "GET", headers: { authorization: "Bearer nope" } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, "bad_password");
    assert.equal(called, false);
  });
});

test("server allowlist matches the quiz profile ids", () => {
  for (const id of zcea.PROFILE_IDS) assert.equal(sanitizeProfileId(id), id);
  assert.equal(sanitizeProfileId("Excêntrico"), null);
  assert.equal(sanitizeProfileId("Ritmo ativo"), null);
});

test("site still signs in with Google and persists profile_id", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const portal = fs.readFileSync(new URL("../js/portal.js", import.meta.url), "utf8");
  const sql = fs.readFileSync(new URL("../sql/profile_id.sql", import.meta.url), "utf8");
  assert.match(portal, /signInWithOAuth/);
  assert.match(portal, /calendar\.readonly/);
  assert.match(portal, /saveWithoutLogin/);
  assert.match(html, /js\/zcea-profile\.js/);
  assert.match(html, /Salvar sem conta e gerar o código/);
  assert.doesNotMatch(html, /Ritmo recolhido/);
  assert.doesNotMatch(html, /Acolhedora|Elétrica|Ardente/);
  assert.match(sql, /add column if not exists profile_id/);
  assert.match(sql, /public read summary/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /drop policy/i);
});
