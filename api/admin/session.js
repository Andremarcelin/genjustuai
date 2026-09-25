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

function restHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const denied = authError(req);
  if (denied) {
    res.status(401).json({
      error: denied,
      hint: "PIN padrão: genjutsu. Se você criou ADMIN_SECRET na Vercel, use esse valor.",
    });
    return;
  }
  grantCookie(res, envSecret());
  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !key) {
    res.status(501).json({ error: "missing_service_role", hint: "Defina SUPABASE_SERVICE_ROLE e ADMIN_SECRET na Vercel." });
    return;
  }

  if (req.method === "GET") {
    const list = await fetch(
      `${supabaseUrl}/rest/v1/dossiers?select=session_code,full_name,email,updated_at&session_code=not.is.null&order=updated_at.desc&limit=30`,
      { headers: restHeaders() }
    );
    const current = await fetch(`${supabaseUrl}/rest/v1/app_state?id=eq.1&select=current_session_code,updated_at`, {
      headers: restHeaders(),
    });
    const dossiers = list.ok ? await list.json() : [];
    const stateRows = current.ok ? await current.json() : [];
    res.status(200).json({
      current_session_code: stateRows[0]?.current_session_code || null,
      recent: (Array.isArray(dossiers) ? dossiers : []).map((d) => ({
        session_code: d.session_code,
        display_name: d.full_name || d.email || "Sem nome",
        email: d.email || "",
        updated_at: d.updated_at,
      })),
    });
    return;
  }

  if (req.method === "POST") {
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!CODE_RE.test(code)) {
      res.status(400).json({ error: "invalid_code" });
      return;
    }
    const patch = await fetch(`${supabaseUrl}/rest/v1/app_state?id=eq.1`, {
      method: "PATCH",
      headers: restHeaders(),
      body: JSON.stringify({ current_session_code: code, updated_at: new Date().toISOString() }),
    });
    if (!patch.ok) {
      res.status(502).json({ error: "upstream", detail: await patch.text() });
      return;
    }
    res.status(200).json({ current_session_code: code });
    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
}
