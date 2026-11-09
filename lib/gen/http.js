export function initApi(req, res, methods) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", [...methods, "OPTIONS"].join(", "));
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  if (!methods.includes(req.method)) {
    res.status(405).json({ error: "method_not_allowed" });
    return true;
  }
  return false;
}

export async function requireActiveSession(res, loadSession, req) {
  let found;
  try {
    found = await loadSession(req);
  } catch {
    res.status(503).json({ error: "supabase_unreachable" });
    return null;
  }
  if (found?.error) {
    res.status(found.status || 503).json({ error: found.error });
    return null;
  }
  if (!found?.session) {
    res.status(409).json({ error: "no_active_session" });
    return null;
  }
  return found.session;
}

export async function userIdFromBearer(req, env = process.env, fetchImpl = globalThis.fetch) {
  const raw = header(req, "authorization");
  const token = String(raw || "").replace(/^Bearer\s+/i, "").trim();
  const supabaseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const service = String(env.SUPABASE_SERVICE_ROLE || "").trim();
  if (!token || !supabaseUrl || !key) return "";
  if (service && token === service) return "";
  if (token === key) return "";
  let upstream;
  try {
    upstream = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
  } catch {
    return "";
  }
  if (!upstream.ok) return "";
  const json = await upstream.json().catch(() => null);
  return json && typeof json.id === "string" ? json.id : "";
}

export function header(req, name) {
  const headers = req?.headers || {};
  const wanted = name.toLowerCase();
  if (typeof headers.get === "function") return headers.get(name) || headers.get(wanted) || "";
  return headers[wanted] || headers[name] || "";
}

export async function readRequestBody(req, maxBytes) {
  if (Buffer.isBuffer(req?.body)) {
    if (req.body.length > maxBytes) return { tooLarge: true };
    return { body: req.body };
  }
  if (typeof req?.body === "string") {
    const buf = Buffer.from(req.body);
    if (buf.length > maxBytes) return { tooLarge: true };
    return { body: buf };
  }
  if (req?.body && typeof req.body === "object") return { body: req.body };
  const chunks = [];
  let total = 0;
  if (req && req[Symbol.asyncIterator]) {
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) return { tooLarge: true };
      chunks.push(buf);
    }
  }
  return { body: Buffer.concat(chunks) };
}

export function infraFromStore(result) {
  if (!result) return { status: 503, body: { error: "supabase_unreachable" } };
  if (result.error === "schema" || result.code === "PGRST205" || result.code === "PGRST204" || result.code === "42P01") {
    return {
      status: 502,
      body: {
        error: "need_sql",
        hint: "Rode sql/house_state.sql e sql/house_devices.sql no SQL Editor do Supabase.",
      },
    };
  }
  if (result.error === "missing_config") {
    return { status: 503, body: { error: "missing_config" } };
  }
  return { status: 503, body: { error: "supabase_unreachable" } };
}
