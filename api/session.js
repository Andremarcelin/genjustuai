import { supabaseRest } from "../lib/supabase-rest.cjs";

const PROFILE_IDS = new Set(["Zen", "Cyber", "Excentrico", "Acolhedor"]);

export function sanitizeProfileId(value) {
  return PROFILE_IDS.has(value) ? value : null;
}

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/i;
const SUMMARY_WITH_PROFILE = "session_code,display_name,personality_text,archetype,profile_id";
const SUMMARY_LEGACY = "session_code,display_name,personality_text,archetype";

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

function toPublicSummary(row) {
  return {
    session_code: row.session_code,
    display_name: row.display_name ?? null,
    personality_text: row.personality_text ?? null,
    archetype: row.archetype ?? null,
    profile_id: sanitizeProfileId(row.profile_id),
  };
}

async function summaryFor(code) {
  let result = await supabaseRest(summaryQuery(SUMMARY_WITH_PROFILE, code));
  if (!result.ok && result.error === "schema" && (result.code === "PGRST204" || result.code === "42703")) {
    result = await supabaseRest(summaryQuery(SUMMARY_LEGACY, code));
  }
  if (!result.ok) return { error: publicError(result), status: result.status || 503 };
  const row = Array.isArray(result.json) ? result.json[0] : null;
  if (!row) return { error: "not_found", status: 404 };
  return { data: toPublicSummary(row) };
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
    if (!code) {
      const state = await supabaseRest("app_state?id=eq.1&select=current_session_code");
      if (!state.ok) {
        sendError(res, state.status || 503, publicError(state));
        return;
      }
      const row = Array.isArray(state.json) ? state.json[0] : null;
      code = row?.current_session_code ? String(row.current_session_code).toUpperCase() : "";
      if (!code) {
        sendError(res, 404, "no_current_session");
        return;
      }
    }

    if (!CODE_RE.test(code)) {
      sendError(res, 400, "invalid_code");
      return;
    }

    const found = await summaryFor(code);
    if (found.error) {
      sendError(res, found.status, found.error);
      return;
    }
    res.status(200).json(found.data);
  } catch {
    if (!res.headersSent) sendError(res, 503, "supabase_unreachable");
  }
}
