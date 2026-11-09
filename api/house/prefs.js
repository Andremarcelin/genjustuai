import { loadSessionForRequest } from "../session.js";
import { initApi, requireActiveSession } from "../../lib/gen/http.js";
import { supabaseRest } from "../../lib/supabase-rest.cjs";
import { envAllowsProfanity } from "../../lib/gen/profanity.js";

export function createPrefsHandler(deps = {}) {
  const loadSession = deps.loadSession || ((req) => loadSessionForRequest(req, deps.env, deps.fetchImpl));
  const env = deps.env || process.env;
  const rest = deps.rest || supabaseRest;

  return async function handler(req, res) {
    if (initApi(req, res, ["GET", "POST"])) return;
    try {
      const session = await requireActiveSession(res, loadSession, req);
      if (!session) return;
      const userId = session.user_id;
      if (!userId) {
        res.status(409).json({ error: "no_active_session" });
        return;
      }
      if (req.method === "GET") {
        const result = await rest(
          `house_prefs?user_id=eq.${encodeURIComponent(userId)}&select=profanity`,
          { serviceRoleOnly: true, raw: true }
        );
        const row = result.ok && Array.isArray(result.json) ? result.json[0] : null;
        res.status(200).json({
          profanity: row?.profanity !== false,
          server: envAllowsProfanity(env),
        });
        return;
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const profanity = body.profanity !== false;
      const result = await rest("house_prefs", {
        method: "POST",
        serviceRoleOnly: true,
        raw: true,
        body: JSON.stringify({ user_id: userId, profanity, updated_at: new Date().toISOString() }),
        headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      });
      if (!result.ok) {
        res.status(503).json({ error: result.error || "supabase_unreachable" });
        return;
      }
      res.status(200).json({ profanity, server: envAllowsProfanity(env) });
    } catch {
      if (!res.headersSent) res.status(503).json({ error: "supabase_unreachable" });
    }
  };
}

export default createPrefsHandler();
