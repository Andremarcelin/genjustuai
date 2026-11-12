import { loadSessionForRequest } from "../session.js";
import { initApi, requireActiveSession, userIdFromBearer } from "../../lib/gen/http.js";
import { listHistory, questLine, recordSessionHistory, voiceLine } from "../../lib/gen/history.js";

export function createHistoryHandler(deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const loadSession = deps.loadSession || ((req) => loadSessionForRequest(req, env, fetchImpl));
  const list = deps.listHistory || listHistory;
  const record = deps.recordSessionHistory || recordSessionHistory;

  return async function handler(req, res) {
    if (initApi(req, res, ["GET", "POST"])) return;
    try {
      if (req.method === "GET") {
        const userId = await userIdFromBearer(req, env, fetchImpl);
        if (!userId) {
          res.status(401).json({ error: "unauthorized" });
          return;
        }
        const code = String(req.query?.code || "").trim();
        const found = await list({ env, userId, sessionCode: code });
        if (!found.ok) {
          res.status(found.error === "invalid_code" ? 400 : 503).json({ error: found.error === "invalid_code" ? "invalid_code" : "supabase_unreachable" });
          return;
        }
        res.status(200).json({ entries: found.entries });
        return;
      }

      const userId = await userIdFromBearer(req, env, fetchImpl);
      const session = await requireActiveSession(res, loadSession, req);
      if (!session) return;

      if (userId) {
        const line = voiceLine(req.body);
        if (!line) {
          res.status(400).json({ error: "invalid_request" });
          return;
        }
        const saved = await record({
          env,
          sessionCode: session.id,
          rows: [line],
          expectedUserId: userId,
        });
        return sendSaved(res, saved);
      }

      const line = questLine(req.body);
      if (!line) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      if (line.session_id !== String(session.id || "").toUpperCase()) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const saved = await record({
        env,
        sessionCode: session.id,
        rows: [line],
      });
      return sendSaved(res, saved);
    } catch {
      if (!res.headersSent) res.status(503).json({ error: "supabase_unreachable" });
    }
  };
}

function sendSaved(res, saved) {
  if (!saved.ok) {
    res.status(saved.error === "forbidden" ? 403 : 503).json({
      error: saved.error === "forbidden" ? "forbidden" : "supabase_unreachable",
    });
    return;
  }
  if (saved.skipped) {
    res.status(409).json({ error: "no_active_session" });
    return;
  }
  res.status(200).json({ ok: true });
}

export default createHistoryHandler();
