import { loadSessionForRequest } from "../session.js";
import { executeHouseTool } from "../../lib/gen/executor.js";
import { initApi, requireActiveSession } from "../../lib/gen/http.js";
import { createSupabaseHouseStore } from "../../lib/gen/house-store.js";
import { envAllowsProfanity } from "../../lib/gen/profanity.js";
import { normalizeGenStyle } from "../../lib/gen/style.js";
import { supabaseRest } from "../../lib/supabase-rest.cjs";

export function createPrefsHandler(deps = {}) {
  const loadSession = deps.loadSession || ((req) => loadSessionForRequest(req, deps.env, deps.fetchImpl));
  const env = deps.env || process.env;
  const rest = deps.rest || supabaseRest;
  const store = deps.store || createSupabaseHouseStore();

  return async function handler(req, res) {
    if (initApi(req, res, ["GET", "POST"])) return;
    try {
      const session = await requireActiveSession(res, loadSession, req);
      if (!session) return;
      const userId = session.user_id;
      const current = await executeHouseTool({
        sessionId: session.id,
        tool: "get_house_state",
        args: {},
        store,
        limiter: { allow: () => true },
      });
      const liveStyle = normalizeGenStyle(current.state?.gen_style);

      if (req.method === "GET") {
        let profanity = true;
        let storedStyle = liveStyle;
        if (userId) {
          const result = await rest(
            `house_prefs?user_id=eq.${encodeURIComponent(userId)}&select=profanity,gen_style`,
            { serviceRoleOnly: true, raw: true }
          );
          const row = result.ok && Array.isArray(result.json) ? result.json[0] : null;
          if (row) {
            profanity = row.profanity !== false;
            if (row.gen_style) storedStyle = normalizeGenStyle(row.gen_style);
          }
        }
        res.status(200).json({
          profanity,
          gen_style: liveStyle || storedStyle,
          server: envAllowsProfanity(env),
        });
        return;
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const style = body.gen_style != null || body.style != null
        ? normalizeGenStyle(body.gen_style || body.style)
        : liveStyle;
      let profanity = body.profanity !== false;
      if (body.gen_style != null || body.style != null) {
        const painted = await executeHouseTool({
          sessionId: session.id,
          tool: "set_gen_style",
          args: { style },
          store,
          limiter: { allow: () => true },
        });
        if (painted.error) {
          res.status(503).json({ error: painted.error });
          return;
        }
      }
      if (userId) {
        const payload = {
          user_id: userId,
          profanity,
          gen_style: style,
          updated_at: new Date().toISOString(),
        };
        let result = await rest("house_prefs", {
          method: "POST",
          serviceRoleOnly: true,
          raw: true,
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
        });
        if (!result.ok && (result.code === "PGRST204" || result.error === "schema")) {
          delete payload.gen_style;
          result = await rest("house_prefs", {
            method: "POST",
            serviceRoleOnly: true,
            raw: true,
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
          });
        }
        if (!result.ok && (body.gen_style == null && body.style == null)) {
          res.status(503).json({ error: result.error || "supabase_unreachable" });
          return;
        }
      }
      res.status(200).json({
        profanity,
        gen_style: style,
        server: envAllowsProfanity(env),
      });
    } catch {
      if (!res.headersSent) res.status(503).json({ error: "supabase_unreachable" });
    }
  };
}

export default createPrefsHandler();
