"use strict";

// api/*.js is compiled to CommonJS on Vercel, and the runtime passes
// --no-experimental-require-module. Requiring this file as .mjs throws
// ERR_REQUIRE_ESM while the module is loading, which Vercel surfaces as
// FUNCTION_INVOCATION_FAILED. Keep this helper CommonJS.

const SCHEMA_CODES = new Set(["PGRST202", "PGRST205", "PGRST204", "42703"]);

function readSupabaseConfig(env = process.env, options = {}) {
  const supabaseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const anon = String(
    env.SUPABASE_ANON_KEY
    || env.SUPABASE_PUBLISHABLE_KEY
    || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || ""
  ).trim();
  const service = String(env.SUPABASE_SERVICE_ROLE || "").trim();
  // serviceRoleOnly never falls back to the anon key. House writes need that.
  const key = options.serviceRoleOnly
    ? service
    : (anon || (options.allowServiceRole ? service : ""));
  return { supabaseUrl, key };
}

function errorCode(json) {
  if (!json || typeof json !== "object") return "";
  return String(json.code || "");
}

async function supabaseRest(path, options = {}) {
  const { supabaseUrl, key } = readSupabaseConfig(options.env || process.env, {
    allowServiceRole: options.allowServiceRole === true,
    serviceRoleOnly: options.serviceRoleOnly === true,
  });
  if (!supabaseUrl || !key) {
    return { ok: false, status: 503, error: "missing_config" };
  }

  let upstream;
  try {
    upstream = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method: options.method || "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...(options.headers || {}),
      },
      body: options.body,
      signal: options.signal || AbortSignal.timeout(options.timeoutMs || 8000),
    });
  } catch {
    return { ok: false, status: 503, error: "supabase_unreachable" };
  }

  const text = await upstream.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  const code = errorCode(json);
  if (upstream.ok && text && json === null) {
    return { ok: false, status: 503, error: "supabase_unreachable", code, json: null };
  }

  if (options.raw) {
    let error = null;
    if (!upstream.ok) {
      if (SCHEMA_CODES.has(code)) error = "schema";
      else if (upstream.status === 401 || upstream.status === 403) error = "missing_config";
      else error = "supabase_unreachable";
    }
    return { ok: upstream.ok, status: upstream.status, json, code, error };
  }

  if (!upstream.ok) {
    if (SCHEMA_CODES.has(code)) {
      return { ok: false, status: 503, error: "schema", code };
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return { ok: false, status: 503, error: "missing_config" };
    }
    return { ok: false, status: 503, error: "supabase_unreachable" };
  }

  return { ok: true, status: upstream.status, json };
}

module.exports = { readSupabaseConfig, supabaseRest };
