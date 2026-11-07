import { supabaseRest } from "../lib/supabase-rest.cjs";

const PROFILE_IDS = new Set(["Zen", "Cyber", "Excentrico", "Acolhedor"]);
const SESSION_STATUSES = new Set(["ready", "active", "ended"]);

export function sanitizeProfileId(value) {
  return PROFILE_IDS.has(value) ? value : null;
}

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/i;
const SUMMARY_FIELDS = ["session_code", "display_name", "personality_text", "archetype", "profile_id", "status"];

function cors(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Origin", "*");
}

function sendError(res, status, error) {
  res.status(status).json({ error });
}

function summaryQuery(select, code) {
  return `session_summaries?session_code=eq.${encodeURIComponent(code)}&select=${select}`;
}

function publicError(result) {
  if (result.error === "missing_config") return "missing_config";
  return "supabase_unreachable";
}

function isMissingColumn(result) {
  return !result.ok && result.error === "schema" && (result.code === "PGRST204" || result.code === "42703");
}

const ARCHETYPE_ALIAS = {
  Zen: "Zen",
  Cyber: "Cyber",
  Excentrico: "Excentrico",
  "Excêntrico": "Excentrico",
  Acolhedor: "Acolhedor",
};

export function profileIdFromRow(row) {
  const direct = sanitizeProfileId(row?.profile_id);
  if (direct) return direct;
  return sanitizeProfileId(ARCHETYPE_ALIAS[String(row?.archetype || "").trim()]);
}

export function toPublicSession(row, fallbackStatus) {
  const code = String(row?.session_code || "").toUpperCase();
  const raw = String(row?.status || "").trim().toLowerCase();
  const status = SESSION_STATUSES.has(raw) ? raw : (fallbackStatus || "ready");
  return {
    id: code,
    session_code: code,
    display_name: row?.display_name ?? null,
    personality_text: row?.personality_text ?? null,
    archetype: row?.archetype ?? null,
    profile_id: profileIdFromRow(row),
    status,
  };
}

async function summaryFor(code, fallbackStatus) {
  const fields = SUMMARY_FIELDS.slice();
  while (fields.length >= 4) {
    const result = await supabaseRest(summaryQuery(fields.join(","), code));
    if (result.ok) {
      const row = Array.isArray(result.json) ? result.json[0] : null;
      if (!row) return { error: "not_found", status: 404 };
      return { data: toPublicSession(row, fallbackStatus) };
    }
    if (!isMissingColumn(result)) return { error: publicError(result), status: result.status || 503 };
    if (fields.includes("status")) {
      fields.splice(fields.indexOf("status"), 1);
      continue;
    }
    if (fields.includes("profile_id")) {
      fields.splice(fields.indexOf("profile_id"), 1);
      continue;
    }
    return { error: publicError(result), status: result.status || 503 };
  }
  return { error: "supabase_unreachable", status: 503 };
}

export async function loadActiveSession() {
  const state = await supabaseRest("app_state?id=eq.1&select=current_session_code");
  if (!state.ok) return { error: publicError(state), status: state.status || 503 };
  const row = Array.isArray(state.json) ? state.json[0] : null;
  const code = row?.current_session_code ? String(row.current_session_code).toUpperCase() : "";
  if (!code) return { session: null };
  if (!CODE_RE.test(code)) return { error: "invalid_code", status: 400 };
  const found = await summaryFor(code, "active");
  if (found.error === "not_found") return { session: null };
  if (found.error) return { error: found.error, status: found.status };
  if (found.data.status === "ended") return { session: null };
  found.data.status = "active";
  return { session: found.data };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    sendError(res, 405, "method_not_allowed");
    return;
  }

  try {
    let code = String(req.query?.code || "").trim().toUpperCase();
    const polling = !code;
    if (polling) {
      const active = await loadActiveSession();
      if (active.error) {
        sendError(res, active.status || 503, active.error);
        return;
      }
      res.status(200).json({ session: active.session });
      return;
    }

    if (!CODE_RE.test(code)) {
      sendError(res, 400, "invalid_code");
      return;
    }

    const found = await summaryFor(code, "ready");
    if (found.error) {
      sendError(res, found.status, found.error);
      return;
    }
    res.status(200).json({ session: found.data });
  } catch {
    if (!res.headersSent) sendError(res, 503, "supabase_unreachable");
  }
}
