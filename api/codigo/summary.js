import { supabaseRest } from "../../lib/supabase-rest.cjs";
import { CODE_RE } from "../session.js";
import { summarizeVisit } from "../../lib/gen/visit-summary.js";

function cors(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Origin", "*");
}

function sendError(res, status, error) {
  res.status(status).json({ error });
}

function rest(path) {
  return supabaseRest(path, {
    serviceRoleOnly: true,
    headers: { Range: "0-999", Prefer: "count=exact" },
  });
}

async function rows(path) {
  const result = await rest(path);
  if (!result.ok) {
    if (result.error === "schema") return [];
    return { error: result.error === "missing_config" ? "missing_config" : "supabase_unreachable" };
  }
  return Array.isArray(result.json) ? result.json : [];
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

  const fromQuery = req.query && req.query.code;
  const url = new URL(req.url || "/", "http://localhost");
  const code = String(fromQuery || url.searchParams.get("code") || "").trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    sendError(res, 400, "invalid_code");
    return;
  }

  const session = await rest(
    `session_summaries?session_code=eq.${encodeURIComponent(code)}&select=session_code&limit=1`
  );
  if (!session.ok) {
    sendError(res, 503, session.error === "missing_config" ? "missing_config" : "supabase_unreachable");
    return;
  }
  if (!Array.isArray(session.json) || !session.json.length) {
    sendError(res, 404, "not_found");
    return;
  }

  const history = await rows(
    `gen_history?session_code=eq.${encodeURIComponent(code)}&select=kind,role,source,tool,args,body,created_at&order=created_at.asc`
  );
  if (history.error) {
    sendError(res, 503, history.error);
    return;
  }
  const commands = await rows(
    `house_commands?session_id=eq.${encodeURIComponent(code)}&select=tool,args,status,created_at&order=created_at.asc`
  );
  if (commands.error) {
    sendError(res, 503, commands.error);
    return;
  }
  const routines = await rows(
    `house_routines?session_id=eq.${encodeURIComponent(code)}&select=name,created_at&order=created_at.asc`
  );
  if (routines.error) {
    sendError(res, 503, routines.error);
    return;
  }

  res.status(200).json({
    session_code: code,
    visit: summarizeVisit({ history, commands, routines }),
  });
}
