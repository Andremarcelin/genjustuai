import { loadSessionForRequest } from "../session.js";
import { header, initApi, readRequestBody, requireActiveSession } from "../../lib/gen/http.js";
import { createSupabaseHouseStore } from "../../lib/gen/house-store.js";
import { createRoutineStore } from "../../lib/gen/routine-store.js";
import { parseRoutineRequest } from "../../lib/gen/routines.js";
import { runDueRoutines } from "../../lib/gen/run-routines.js";
import { createRateLimiter } from "../../lib/gen/rate-limit.js";

function isCron(req, env) {
  const secret = String(env.CRON_SECRET || "").trim();
  const auth = String(header(req, "authorization") || "");
  if (secret && auth === `Bearer ${secret}`) return true;
  if (String(header(req, "x-vercel-cron") || "") === "1") return true;
  return false;
}

export function createRoutinesHandler(deps = {}) {
  const env = deps.env || process.env;
  const loadSession = deps.loadSession || ((req) => loadSessionForRequest(req, deps.env, deps.fetchImpl));
  const store = deps.store || createRoutineStore();
  const houseStore = deps.houseStore || deps.house || createSupabaseHouseStore();
  const limiter = deps.limiter || createRateLimiter({ limit: 40, windowMs: 60_000 });
  const now = deps.now || (() => Date.now());

  return async function handler(req, res) {
    if (initApi(req, res, ["GET", "POST", "PATCH", "DELETE"])) return;
    try {
      if (isCron(req, env)) {
        const result = await runDueRoutines({
          houseStore,
          routineStore: store,
          env,
          fetchImpl: deps.fetchImpl,
          limiter,
          now: now(),
          suggest: true,
        });
        if (result.error) {
          res.status(result.status || 503).json({ error: result.error });
          return;
        }
        res.status(200).json({ ran: result.ran, suggestions: result.suggestions });
        return;
      }

      const session = await requireActiveSession(res, loadSession, req);
      if (!session) return;
      const userId = session.user_id;
      if (!userId) {
        res.status(409).json({ error: "no_active_session" });
        return;
      }
      if (req.method === "GET") {
        try {
          await runDueRoutines({
            houseStore,
            routineStore: store,
            env,
            fetchImpl: deps.fetchImpl,
            limiter,
            now: now(),
            userId,
            sessionId: session.id,
          });
        } catch { /* tick não derruba o GET */ }
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
