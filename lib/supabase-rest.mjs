const SCHEMA_CODES = new Set(["PGRST202", "PGRST205", "PGRST204", "42703"]);

export function readSupabaseConfig(env = process.env, options = {}) {
  const supabaseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(
    env.SUPABASE_ANON_KEY
    || env.SUPABASE_PUBLISHABLE_KEY
    || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || (options.allowServiceRole ? env.SUPABASE_SERVICE_ROLE : "")
    || ""
  ).trim();
  return { supabaseUrl, key };
}

function errorCode(json) {
  if (!json || typeof json !== "object") return "";
  return String(json.code || "");
}

export async function supabaseRest(path, options = {}) {
  const { supabaseUrl, key } = readSupabaseConfig(options.env || process.env, {
    allowServiceRole: options.allowServiceRole === true,
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

  if (!upstream.ok) {
    const code = errorCode(json);
    if (SCHEMA_CODES.has(code)) {
      return { ok: false, status: 503, error: "schema", code };
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return { ok: false, status: 503, error: "missing_config" };
    }
    return { ok: false, status: 503, error: "supabase_unreachable" };
  }

  if (text && json === null) {
    return { ok: false, status: 503, error: "supabase_unreachable" };
  }

  return { ok: true, status: upstream.status, json };
}
