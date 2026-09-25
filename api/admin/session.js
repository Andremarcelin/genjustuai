const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/i;
const DEFAULT_PIN = "genjutsu";

function envSecret() {
  return String(process.env.ADMIN_SECRET || "").trim().replace(/^["']|["']$/g, "") || DEFAULT_PIN;
}

function cookieSecret(req) {
  const raw = req.headers.cookie || "";
  const m = raw.match(/(?:^|;\s*)gj_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function requestSecret(req) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const custom = req.headers["x-admin-secret"];
  return String(bearer || custom || cookieSecret(req) || "").trim();
}

function authError(req) {
  if (requestSecret(req) !== envSecret()) return "bad_password";
  return null;
}

function grantCookie(res, secret) {
  res.setHeader(
    "Set-Cookie",
    `gj_admin=${encodeURIComponent(secret)}; Path=/; Max-Age=2592000; SameSite=Lax; Secure; HttpOnly`
  );
}

function readKey() {
  return (
    process.env.SUPABASE_ANON_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.SUPABASE_SERVICE_ROLE
    || ""
  );
}

function restHeaders() {
  const key = readKey();
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
}

function supabaseUrl() {
  return String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
}

async function rest(path, options) {
  const url = `${supabaseUrl()}/rest/v1/${path}`;
  const upstream = await fetch(url, { ...options, headers: { ...restHeaders(), ...(options?.headers || {}) } });
  const text = await upstream.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
  return { ok: upstream.ok, status: upstream.status, json };
}

function isMissing(result) {
  const code = result?.json?.code;
  return !result.ok && (code === "PGRST202" || code === "PGRST205");
}

async function listRecent() {
  const rpc = await rest("rpc/genjutsu_recent_signups", { method: "POST", body: "{}" });
  if (rpc.ok && Array.isArray(rpc.json)) {
    return { rows: rpc.json, source: "rpc", missing: false };
  }
  const pub = await rest(
    "session_summaries?select=session_code,display_name,updated_at&order=updated_at.desc&limit=30"
  );
  if (pub.ok && Array.isArray(pub.json)) {
    return {
      rows: pub.json.map((d) => ({
        session_code: d.session_code,
        display_name: d.display_name || "Sem nome",
        email: "",
        updated_at: d.updated_at,
      })),
      source: "summaries",
      missing: false,
    };
  }
  const dossiers = await rest("dossiers?select=session_code&limit=1");
  return {
    rows: [],
    source: "none",
    missing: isMissing(rpc) || isMissing(pub),
    detail: rpc.json?.message || pub.json?.message || dossiers.json?.message || null,
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const denied = authError(req);
  if (denied) {
    res.status(401).json({
      error: denied,
      hint: "PIN padrão: genjutsu.",
    });
    return;
  }
  grantCookie(res, envSecret());
  if (!supabaseUrl() || !readKey()) {
    res.status(501).json({
      error: "missing_read_key",
      hint: "Na Vercel: SUPABASE_URL + SUPABASE_ANON_KEY (chave publishable / anon de leitura). Redeploy.",
    });
    return;
  }

  if (req.method === "GET") {
    const listed = await listRecent();
    const current = await rest("app_state?id=eq.1&select=current_session_code");
    const stateRows = current.ok && Array.isArray(current.json) ? current.json : [];
    const recent = listed.rows.map((d) => ({
      session_code: d.session_code,
      display_name: d.display_name || d.email || "Sem nome",
      email: d.email || "",
      updated_at: d.updated_at,
    }));
    res.status(200).json({
      current_session_code: stateRows[0]?.current_session_code || null,
      recent,
      hint: listed.missing || (!recent.length && isMissing(current))
        ? "SQL ainda não rodou neste Supabase. No SQL Editor, cole o arquivo sql/admin_read.sql e clique Run."
        : (!recent.length
          ? "Banco ok, mas nenhum dossier com código. Entre em genjutsuai.vercel.app com Google uma vez."
          : null),
    });
    return;
  }

  if (req.method === "POST") {
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      res.status(400).json({ error: "invalid_code" });
      return;
    }
    const set = await rest("rpc/genjutsu_set_current_session", {
      method: "POST",
      body: JSON.stringify({ p_code: code }),
    });
    if (set.ok) {
      res.status(200).json({ current_session_code: typeof set.json === "string" ? set.json.replace(/"/g, "") : code });
      return;
    }
    res.status(502).json({
      error: "need_sql",
      hint: "Rode sql/admin_read.sql no SQL Editor do Supabase.",
      detail: set.json,
    });
    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
}
