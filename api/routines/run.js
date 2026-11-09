import { header, initApi } from "../../lib/gen/http.js";
import { executeHouseTool } from "../../lib/gen/executor.js";
import { createSupabaseHouseStore } from "../../lib/gen/house-store.js";
import { createRoutineStore } from "../../lib/gen/routine-store.js";
import { detectRoutinePatterns, isRoutineDue } from "../../lib/gen/routines.js";
import { createRateLimiter } from "../../lib/gen/rate-limit.js";

function authorized(req, env) {
  const secret = String(env.CRON_SECRET || "").trim();
  const auth = String(header(req, "authorization") || "");
  if (secret && auth === `Bearer ${secret}`) return true;
  if (String(header(req, "x-vercel-cron") || "") === "1") return true;
  return false;
}

export function createRoutinesRunHandler(deps = {}) {
  const env = deps.env || process.env;
  const houseStore = deps.store || createSupabaseHouseStore();
  const routineStore = deps.routineStore || createRoutineStore();
  const limiter = deps.limiter || createRateLimiter({ limit: 40, windowMs: 60_000 });
  const now = deps.now || (() => Date.now());

  return async function handler(req, res) {
    if (initApi(req, res, ["GET", "POST"])) return;
    if (!authorized(req, env)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const stamp = now();
    const listed = await routineStore.listDue(new Date(stamp).toISOString());
    if (listed.error) {
      res.status(listed.status || 503).json({ error: listed.error });
      return;
    }
    const ran = [];
    for (const row of listed.routines || []) {
      if (!isRoutineDue(row, new Date(stamp))) continue;
      const sessionId = row.session_id;
      if (!sessionId) continue;
      for (const action of row.actions || []) {
        await executeHouseTool({
          sessionId,
          tool: action.tool,
          args: action.args || {},
          store: houseStore,
          limiter,
          now: stamp,
          env,
          fetchImpl: deps.fetchImpl,
        });
      }
      await routineStore.markRun(row.id, new Date(stamp).toISOString());
      ran.push(row.id);
    }

    const suggestions = [];
    try {
      const sessions = [...new Set((listed.routines || []).map((row) => row.session_id).filter(Boolean))];
      const since = new Date(stamp - 14 * 24 * 60 * 60 * 1000).toISOString();
      for (const sessionId of sessions) {
        const logs = await routineStore.listCommands?.(sessionId, since);
        if (!logs?.commands) continue;
        const found = detectRoutinePatterns(logs.commands.map((row) => ({
          ...row,
          created_at: row.created_at,
        })), new Date(stamp));
        for (const hint of found) {
          const userId = (listed.routines || []).find((row) => row.session_id === sessionId)?.user_id;
          if (!userId) continue;
          const existing = await routineStore.list(userId);
          const already = (existing.routines || []).some((item) => item.hint === hint.hint || item.name === hint.name);
          if (already) continue;
          await routineStore.create(userId, sessionId, {
            name: hint.name,
            hour: hint.schedule.hour,
            minute: hint.schedule.minute,
            days: hint.schedule.days,
            actions: hint.actions,
            enabled: false,
            created_by: "gen_suggestion",
            hint: hint.hint,
          });
          suggestions.push(hint.hint);
        }
      }
    } catch {
      /* sugestões não derrubam o cron */
    }

    res.status(200).json({ ran: ran.length, suggestions: suggestions.length });
  };
}

export default createRoutinesRunHandler();
