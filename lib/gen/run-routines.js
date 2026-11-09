import { executeHouseTool } from "./executor.js";
import { detectRoutinePatterns, isRoutineDue } from "./routines.js";
import { createRateLimiter } from "./rate-limit.js";

export async function runDueRoutines({
  houseStore,
  routineStore,
  env,
  fetchImpl,
  limiter,
  now = Date.now(),
  userId,
  sessionId,
  suggest = false,
} = {}) {
  const stamp = typeof now === "function" ? now() : now;
  const listed = userId
    ? await routineStore.list(userId, sessionId)
    : sessionId
      ? await routineStore.list(null, sessionId)
      : await routineStore.listDue(new Date(stamp).toISOString());
  if (listed.error) return { error: listed.error, status: listed.status, ran: 0 };
  const cap = createRateLimiter({ limit: 40, windowMs: 60_000 });
  const gate = limiter || cap;
  const ran = [];
  for (const row of listed.routines || []) {
    if (!isRoutineDue(row, new Date(stamp))) continue;
    const sid = row.session_id || sessionId;
    if (!sid) continue;
    for (const action of row.actions || []) {
      await executeHouseTool({
        sessionId: sid,
        tool: action.tool,
        args: action.args || {},
        store: houseStore,
        limiter: gate,
        now: stamp,
        env,
        fetchImpl,
      });
    }
    const whenIso = new Date(stamp).toISOString();
    await routineStore.markRun(row.id, whenIso);
    if (row.schedule?.once) {
      const uid = row.user_id || userId || null;
      await routineStore.update?.(uid, row.id, { enabled: false }, row.session_id || sessionId);
    }
    ran.push(row.id);
  }

  let suggestions = 0;
  if (suggest) {
    try {
      const rows = listed.routines || [];
      const sessions = [...new Set(rows.map((row) => row.session_id).filter(Boolean))];
      const since = new Date(stamp - 14 * 24 * 60 * 60 * 1000).toISOString();
      for (const sid of sessions) {
        const logs = await routineStore.listCommands?.(sid, since);
        if (!logs?.commands) continue;
        const found = detectRoutinePatterns(logs.commands, new Date(stamp));
        for (const hint of found) {
          const uid = userId || rows.find((row) => row.session_id === sid)?.user_id || null;
          if (!uid && !sid) continue;
          const existing = await routineStore.list(uid, sid);
          const already = (existing.routines || []).some((item) => item.hint === hint.hint || item.name === hint.name);
          if (already) continue;
          await routineStore.create(uid, sid, {
            name: hint.name,
            hour: hint.schedule.hour,
            minute: hint.schedule.minute,
            days: hint.schedule.days,
            actions: hint.actions,
            enabled: false,
            created_by: "gen_suggestion",
            hint: hint.hint,
          });
          suggestions += 1;
        }
      }
    } catch {
      /* sugestões não derrubam o tick */
    }
  }
  return { ran: ran.length, suggestions, ids: ran };
}
