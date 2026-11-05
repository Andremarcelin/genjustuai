import { readSupabaseConfig, supabaseRest } from "../../lib/supabase-rest.cjs";

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/i;

// MVP: /admin is intentionally open. ADMIN_SECRET is not read, and this
// handler does not require a PIN, Authorization, x-admin-secret, or the
// gj_admin cookie. To re-lock, compare those values with ADMIN_SECRET
// (fallback "genjutsu" when the env var is empty), answer 401
// { error: "bad_password" } on mismatch, set the HttpOnly gj_admin cookie
// only after a match, and put the PIN field back in admin.html.

function rest(path, options = {}) {
  return supabaseRest(path, {
    method: options.method,
    body: options.body,
    allowServiceRole: true,
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
}

function isSchema(result) {
  return !result.ok && result.error === "schema";
}

function isHardFailure(result) {
  return !result.ok && !isSchema(result);
}

function publicFailure(result) {
  return result?.error === "missing_config" ? "missing_config" : "supabase_unreachable";
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
  if (isHardFailure(rpc) && isHardFailure(pub)) {
    return { rows: [], unreachable: true, error: publicFailure(pub.ok ? rpc : pub) };
  }
  return {
    rows: [],
    source: "none",
    missing: isSchema(rpc) || isSchema(pub),
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const cfg = readSupabaseConfig(process.env, { allowServiceRole: true });
    if (!cfg.supabaseUrl || !cfg.key) {
      res.status(503).json({
        error: "missing_config",
        hint: "Na Vercel: SUPABASE_URL + SUPABASE_ANON_KEY (chave publishable / anon de leitura). Redeploy.",
      });
      return;
    }

    if (req.method === "GET") {
      const listed = await listRecent();
      if (listed.unreachable) {
        res.status(503).json({ error: listed.error || "supabase_unreachable" });
        return;
      }
      const current = await rest("app_state?id=eq.1&select=current_session_code");
      if (isHardFailure(current)) {
        res.status(503).json({ error: publicFailure(current) });
        return;
      }
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
        hint: listed.missing || (!recent.length && isSchema(current))
          ? "SQL ainda não rodou neste Supabase. No SQL Editor, nesta ordem: sql/dossiers.sql, sql/sessions.sql, sql/app_state.sql, sql/admin_read.sql, sql/anonymous_auth.sql e sql/profile_id.sql. Em Authentication → Providers, ative Anonymous sign-ins."
          : (!recent.length
            ? "Banco ok, mas nenhum dossier com código. No site, responda as duas perguntas e salve sem conta."
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
        const value = typeof set.json === "string" ? set.json : code;
        res.status(200).json({ current_session_code: String(value).replace(/"/g, "") });
        return;
      }
      if (isSchema(set)) {
        res.status(502).json({
          error: "need_sql",
          hint: "Rode sql/admin_read.sql no SQL Editor do Supabase.",
        });
        return;
      }
      res.status(503).json({ error: publicFailure(set) });
      return;
    }

    res.status(405).json({ error: "method_not_allowed" });
  } catch {
    if (!res.headersSent) res.status(503).json({ error: "supabase_unreachable" });
  }
}
