import { loadSessionForRequest } from "../session.js";
import { initApi, readRequestBody, requireActiveSession } from "../../lib/gen/http.js";
import { createRoutineStore } from "../../lib/gen/routine-store.js";
import { parseRoutineRequest } from "../../lib/gen/routines.js";

export function createRoutinesHandler(deps = {}) {
  const loadSession = deps.loadSession || ((req) => loadSessionForRequest(req, deps.env, deps.fetchImpl));
  const store = deps.store || createRoutineStore();

  return async function handler(req, res) {
    if (initApi(req, res, ["GET", "POST", "PATCH", "DELETE"])) return;
    try {
      const session = await requireActiveSession(res, loadSession, req);
      if (!session) return;
      const userId = session.user_id;
      if (!userId) {
        res.status(409).json({ error: "no_active_session" });
        return;
      }
      if (req.method === "GET") {
        const listed = await store.list(userId);
        if (listed.error) {
          res.status(listed.status || 503).json({ error: listed.error });
          return;
        }
        res.status(200).json({ routines: listed.routines || [] });
        return;
      }
      const raw = await readRequestBody(req, 16_000);
      let payload = raw.body;
      if (Buffer.isBuffer(payload)) {
        try { payload = JSON.parse(payload.toString("utf8") || "{}"); } catch { payload = {}; }
      }
      payload = payload && typeof payload === "object" ? payload : {};

      if (req.method === "DELETE") {
        const id = String(payload.id || "").trim();
        const removed = await store.remove(userId, id);
        if (removed.error) {
          res.status(removed.status || 503).json({ error: removed.error });
          return;
        }
        res.status(200).json({ routines: removed.routines || [] });
        return;
      }
      if (req.method === "PATCH") {
        const id = String(payload.id || "").trim();
        const patch = {};
        if (typeof payload.enabled === "boolean") patch.enabled = payload.enabled;
        if (payload.created_by === "user") patch.created_by = "user";
        const updated = await store.update(userId, id, patch);
        if (updated.error) {
          res.status(updated.status || 503).json({ error: updated.error });
          return;
        }
        res.status(200).json({ routines: updated.routines || [] });
        return;
      }

      const parsed = payload.hour != null
        ? payload
        : parseRoutineRequest(payload.text || payload.name || "");
      if (!parsed || (parsed.hour == null && !parsed.schedule)) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      const args = parsed.schedule
        ? {
          name: parsed.name,
          hour: parsed.schedule.hour,
          minute: parsed.schedule.minute,
          days: parsed.schedule.days,
          actions: parsed.actions,
          enabled: parsed.enabled,
          created_by: parsed.created_by,
          hint: parsed.hint,
        }
        : parsed;
      const created = await store.create(userId, session.id, args);
      if (created.error) {
        res.status(created.status || 503).json({ error: created.error });
        return;
      }
      res.status(200).json({ routines: created.routines || [], created: created.created || null });
    } catch {
      if (!res.headersSent) res.status(503).json({ error: "supabase_unreachable" });
    }
  };
}

export default createRoutinesHandler();
