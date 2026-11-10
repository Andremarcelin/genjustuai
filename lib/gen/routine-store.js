import { supabaseRest } from "../supabase-rest.cjs";
import { publicRoutine } from "./routines.js";

function fail(result) {
  return {
    error: result?.error || "supabase_unreachable",
    status: result?.status || 503,
    code: result?.code || "",
  };
}

async function raw(path, options = {}) {
  return supabaseRest(path, {
    method: options.method || "GET",
    body: options.body,
    serviceRoleOnly: true,
    raw: true,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
  });
}

function mapRows(json) {
  const rows = Array.isArray(json) ? json : [];
  return rows.map(publicRoutine).filter(Boolean);
}

function ownerFilter(userId, sessionId) {
  if (userId) return `user_id=eq.${encodeURIComponent(userId)}`;
  if (sessionId) return `session_id=eq.${encodeURIComponent(sessionId)}`;
  return "";
}

export function createRoutineStore() {
  return {
    async list(userId, sessionId) {
      const filter = ownerFilter(userId, sessionId);
      if (!filter) return { routines: [] };
      const result = await raw(
        `house_routines?${filter}&select=*&order=created_at.desc`
      );
      if (!result.ok) return fail(result);
      return { routines: mapRows(result.json) };
    },
    async create(userId, sessionId, args) {
      if (!userId && !sessionId) return { error: "missing_session", status: 400 };
      const payload = {
        user_id: userId || null,
        session_id: sessionId || null,
        name: String(args.name || "Rotina").slice(0, 80),
        schedule: {
          hour: Number(args.hour),
          minute: Number(args.minute) || 0,
          days: Array.isArray(args.days) && args.days.length ? args.days : [0, 1, 2, 3, 4, 5, 6],
          tz: "America/Sao_Paulo",
          once: args.once === true,
          ...(args.at ? { at: String(args.at) } : {}),
        },
        actions: args.actions,
        enabled: args.enabled !== false,
        created_by: args.created_by === "gen_suggestion" ? "gen_suggestion" : "user",
        hint: args.hint || null,
      };
      const result = await raw("house_routines", {
        method: "POST",
        body: JSON.stringify(payload),
        prefer: "return=representation",
      });
      if (!result.ok) return fail(result);
      const listed = await this.list(userId, sessionId);
      return listed.error ? listed : { routines: listed.routines, created: publicRoutine(Array.isArray(result.json) ? result.json[0] : result.json) };
    },
    async update(userId, id, patch, sessionId) {
      const filter = ownerFilter(userId, sessionId);
      if (!filter) return { error: "missing_session", status: 400 };
      const result = await raw(
        `house_routines?id=eq.${encodeURIComponent(id)}&${filter}`,
        { method: "PATCH", body: JSON.stringify(patch), prefer: "return=representation" }
      );
      if (!result.ok) return fail(result);
      return this.list(userId, sessionId);
    },
    async remove(userId, id, sessionId) {
      const filter = ownerFilter(userId, sessionId);
      if (!filter) return { error: "missing_session", status: 400 };
      const result = await raw(
        `house_routines?id=eq.${encodeURIComponent(id)}&${filter}`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      if (!result.ok) return fail(result);
      return this.list(userId, sessionId);
    },
    async listDue(nowIso) {
      const result = await raw("house_routines?enabled=eq.true&select=*");
      if (!result.ok) return fail(result);
      return { routines: Array.isArray(result.json) ? result.json : [] };
    },
    async listCommands(sessionId, sinceIso) {
      const result = await raw(
        `house_commands?session_id=eq.${encodeURIComponent(sessionId)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=tool,args,status,created_at&order=created_at.desc&limit=400`
      );
      if (!result.ok) return fail(result);
      return { commands: Array.isArray(result.json) ? result.json : [] };
    },
    async markRun(id, whenIso) {
      return raw(`house_routines?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ last_run_at: whenIso }),
        prefer: "return=minimal",
      });
    },
  };
}

function matchesOwner(row, userId, sessionId) {
  if (userId) return row.user_id === userId;
  if (sessionId) return row.session_id === sessionId && !row.user_id;
  return false;
}

export function createMemoryRoutineStore() {
  const rows = [];
  return {
    rows,
    async list(userId, sessionId) {
      return { routines: rows.filter((row) => matchesOwner(row, userId, sessionId)).map(publicRoutine) };
    },
    async create(userId, sessionId, args) {
      if (!userId && !sessionId) return { error: "missing_session", status: 400 };
      const row = {
        id: `r${rows.length + 1}`,
        user_id: userId || null,
        session_id: sessionId,
        name: args.name,
        schedule: {
          hour: Number(args.hour),
          minute: Number(args.minute) || 0,
          days: args.days || [0, 1, 2, 3, 4, 5, 6],
          tz: "America/Sao_Paulo",
          once: args.once === true,
          ...(args.at ? { at: String(args.at) } : {}),
        },
        actions: args.actions,
        enabled: args.enabled !== false,
        created_by: args.created_by || "user",
        hint: args.hint || null,
        last_run_at: null,
        created_at: new Date().toISOString(),
      };
      rows.push(row);
      return { routines: rows.filter((item) => matchesOwner(item, userId, sessionId)).map(publicRoutine), created: publicRoutine(row) };
    },
    async update(userId, id, patch, sessionId) {
      const row = rows.find((item) => item.id === id && matchesOwner(item, userId, sessionId));
      if (row) Object.assign(row, patch);
      return this.list(userId, sessionId);
    },
    async remove(userId, id, sessionId) {
      const at = rows.findIndex((item) => item.id === id && matchesOwner(item, userId, sessionId));
      if (at >= 0) rows.splice(at, 1);
      return this.list(userId, sessionId);
    },
    async listDue() {
      return { routines: rows.filter((row) => row.enabled !== false) };
    },
    async markRun(id, whenIso) {
      const row = rows.find((item) => item.id === id);
      if (row) {
        row.last_run_at = whenIso;
        if (row.schedule?.once) row.enabled = false;
      }
      return { ok: true };
    },
  };
}
