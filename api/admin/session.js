import { readSupabaseConfig, supabaseRest } from "../../lib/supabase-rest.cjs";
import { sanitizeProfileId } from "../session.js";

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/i;
const SQL_HINT = "SQL ainda não rodou neste Supabase. No SQL Editor, nesta ordem: sql/dossiers.sql, sql/sessions.sql, sql/app_state.sql, sql/admin_read.sql, sql/anonymous_auth.sql, sql/profile_id.sql e sql/session_lifecycle.sql. Em Authentication → Providers, ative Anonymous sign-ins.";

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

function resolveStatus(row, currentCode) {
  const raw = String(row?.status || "").trim().toLowerCase();
  const code = String(row?.session_code || "").toUpperCase();
  if (raw === "ended") return "ended";
  if (currentCode && code === currentCode) return "active";
  if (raw === "ready") return "ready";
  return "ready";
}

async function listSummaries() {
  const selects = [
    "session_code,display_name,profile_id,status,ended_at,updated_at",
    "session_code,display_name,profile_id,updated_at",
    "session_code,display_name,updated_at",
  ];
  let last = null;
  for (const select of selects) {
    const result = await rest(
      `session_summaries?select=${select}&order=updated_at.desc&limit=200`
    );
    last = result;
    if (result.ok && Array.isArray(result.json)) {
      return { rows: result.json, missing: false };
    }
    if (!isSchema(result)) break;
  }
  if (last && isHardFailure(last)) {
    const rpc = await rest("rpc/genjutsu_recent_signups", { method: "POST", body: "{}" });
    if (rpc.ok && Array.isArray(rpc.json)) return { rows: rpc.json, missing: false };
    return { rows: [], unreachable: true, error: publicFailure(last) };
  }
  return { rows: [], missing: true };
}

function toAdminRow(row, currentCode) {
  const code = String(row.session_code || "").toUpperCase();
  return {
    session_code: row.session_code,
    display_name: row.display_name || row.email || "Sem nome",
    email: row.email || "",
    profile_id: sanitizeProfileId(row.profile_id),
    status: resolveStatus(row, currentCode),
    ended_at: row.ended_at || null,
    updated_at: row.updated_at,
  };
}

async function currentCode() {
  const current = await rest("app_state?id=eq.1&select=current_session_code");
  if (isHardFailure(current)) return { error: publicFailure(current) };
  const stateRows = current.ok && Array.isArray(current.json) ? current.json : [];
  const code = stateRows[0]?.current_session_code
    ? String(stateRows[0].current_session_code).toUpperCase()
    : null;
  return { code, missingState: isSchema(current) };
}

async function profileFor(code) {
  let result = await rest(
    `session_summaries?session_code=eq.${encodeURIComponent(code)}&select=session_code,display_name,profile_id,status`
  );
  if (isSchema(result)) {
    result = await rest(
      `session_summaries?session_code=eq.${encodeURIComponent(code)}&select=session_code,display_name,profile_id`
    );
  }
  if (isSchema(result)) {
    result = await rest(
      `session_summaries?session_code=eq.${encodeURIComponent(code)}&select=session_code,display_name`
    );
  }
  if (!result.ok || !Array.isArray(result.json) || !result.json[0]) return null;
  const row = result.json[0];
  return {
    display_name: row.display_name ?? null,
    profile_id: sanitizeProfileId(row.profile_id),
    status: resolveStatus(row, code),
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
      const current = await currentCode();
      if (current.error) {
        res.status(503).json({ error: current.error });
        return;
      }
      const listed = await listSummaries();
      if (listed.unreachable) {
        res.status(503).json({ error: listed.error || "supabase_unreachable" });
        return;
      }
      const recent = listed.rows
        .filter((row) => row && row.session_code)
        .map((row) => toAdminRow(row, current.code));
      res.status(200).json({
        current_session_code: current.code,
        recent,
        hint: listed.missing || (!recent.length && current.missingState)
          ? SQL_HINT
          : (!recent.length
            ? "Banco ok, mas nenhuma sessão gravada. No site, responda as três perguntas e salve sem conta."
            : null),
      });
      return;
    }

    if (req.method === "POST") {
      const action = String(req.body?.action || "start").trim().toLowerCase();
      if (action === "end") {
        const requested = String(req.body?.code || "").trim().toUpperCase();
        if (requested && !CODE_RE.test(requested)) {
          res.status(400).json({ error: "invalid_code" });
          return;
        }
        const ended = await rest("rpc/genjutsu_end_session", {
          method: "POST",
          body: JSON.stringify({ p_code: requested || null }),
        });
        if (ended.ok) {
          const value = ended.json == null ? null : String(ended.json).replace(/"/g, "");
          res.status(200).json({
            current_session_code: null,
            ended_session_code: value || null,
            status: "ended",
          });
          return;
        }
        if (isSchema(ended)) {
          res.status(502).json({
            error: "need_sql",
            hint: "Rode sql/session_lifecycle.sql no SQL Editor do Supabase.",
          });
          return;
        }
        res.status(503).json({ error: publicFailure(ended) });
        return;
      }

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
        const currentSessionCode = String(value).replace(/"/g, "");
        const extra = await profileFor(currentSessionCode);
        res.status(200).json({
          current_session_code: currentSessionCode,
          display_name: extra?.display_name ?? null,
          profile_id: extra?.profile_id ?? null,
          status: "active",
        });
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
