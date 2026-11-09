import { loadActiveSession } from "../session.js";
import { initApi, userIdFromBearer } from "../../lib/gen/http.js";
import { listHistory, recordSessionHistory, voiceLine } from "../../lib/gen/history.js";

export function createHistoryHandler(deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const loadSession = deps.loadSession || loadActiveSession;
  const list = deps.listHistory || listHistory;
  const record = deps.recordSessionHistory || recordSessionHistory;

  return async function handler(req, res) {
    if (initApi(req, res, ["GET", "POST"])) return;
    try {
      const userId = await userIdFromBearer(req, env, fetchImpl);
      if (!userId) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      if (req.method === "GET") {
        const code = String(req.query?.code || "").trim();
        const found = await list({ env, userId, sessionCode: code });
        if (!found.ok) {
          res.status(found.error === "invalid_code" ? 400 : 503).json({ error: found.error === "invalid_code" ? "invalid_code" : "supabase_unreachable" });
          return;
        }
        res.status(200).json({ entries: found.entries });
        return;
      }
      const line = voiceLine(req.body);
      if (!line) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      const active = await loadSession();
      if (active?.error) {
        res.status(active.status || 503).json({ error: active.error });
        return;
      }
      if (!active?.session) {
        res.status(409).json({ error: "no_active_session" });
        return;
      }
      const saved = await record({
        env,
        sessionCode: active.session.id,
        rows: [line],
        expectedUserId: userId,
      });
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
    } catch {
      if (!res.headersSent) res.status(503).json({ error: "supabase_unreachable" });
    }
  };
}

export default createHistoryHandler();
