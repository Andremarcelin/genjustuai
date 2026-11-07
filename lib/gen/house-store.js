import { supabaseRest } from "../supabase-rest.cjs";
import { clone, toPublicState } from "./defaults.js";

function firstRow(json) {
  if (Array.isArray(json)) return json[0] || null;
  if (json && typeof json === "object") return json;
  return null;
}

function fail(result) {
  return {
    error: result?.error || "supabase_unreachable",
    status: result?.status || 503,
    code: result?.code || result?.error || "",
  };
}

async function serviceRaw(path, options = {}) {
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

export function createSupabaseHouseStore() {
  return {
    async load(sessionId) {
      const result = await serviceRaw(
        `house_state?session_id=eq.${encodeURIComponent(sessionId)}&select=session_id,version,mode,dojo,lights,ambience,updated_at`
      );
      if (!result.ok) return fail(result);
      return { state: toPublicState(firstRow(result.json)) };
    },
    async save(next, expectedVersion) {
      const body = JSON.stringify({
        session_id: next.session_id,
        version: next.version,
        mode: next.mode,
        dojo: next.dojo,
        lights: next.lights,
        ambience: next.ambience,
        updated_at: next.updated_at,
      });
      if (expectedVersion === 0) {
        const inserted = await serviceRaw("house_state", {
          method: "POST",
          body,
          prefer: "return=representation",
        });
        if (inserted.code === "23505") return { conflict: true };
        if (!inserted.ok) return fail(inserted);
        const row = firstRow(inserted.json);
        if (!row) return { conflict: true };
        return { state: toPublicState(row) };
      }
      const patched = await serviceRaw(
        `house_state?session_id=eq.${encodeURIComponent(next.session_id)}&version=eq.${expectedVersion}`,
        { method: "PATCH", body, prefer: "return=representation" }
      );
      if (!patched.ok) return fail(patched);
      const row = firstRow(patched.json);
      if (!row) return { conflict: true };
      return { state: toPublicState(row) };
    },
    async log(entry) {
      const result = await serviceRaw("house_commands", {
        method: "POST",
        prefer: "return=minimal",
        body: JSON.stringify({
          session_id: entry.sessionId,
          version: entry.version ?? null,
          tool: String(entry.tool || "unknown").slice(0, 64),
          args: entry.args && typeof entry.args === "object" ? entry.args : {},
          status: entry.status,
          reason: entry.reason || null,
        }),
      });
      if (!result.ok) return fail(result);
      return { ok: true };
    },
    async countRecent(sessionId, sinceIso) {
      const result = await serviceRaw(
        `house_commands?session_id=eq.${encodeURIComponent(sessionId)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id&limit=21`
      );
      if (!result.ok) return fail(result);
      const rows = Array.isArray(result.json) ? result.json : [];
      return { count: rows.length };
    },
  };
}

export async function readHouseState(sessionId) {
  const path = `house_state?session_id=eq.${encodeURIComponent(sessionId)}&select=session_id,version,mode,dojo,lights,ambience,updated_at`;
  let result = await supabaseRest(path, { serviceRoleOnly: true, raw: true });
  if (!result.ok && result.error === "missing_config") {
    result = await supabaseRest(path, { raw: true });
  }
  if (!result.ok) {
    if (result.error === "schema") return { missing: true };
    return fail(result);
  }
  return { state: toPublicState(firstRow(result.json)) };
}

export function createMemoryHouseStore() {
  const states = new Map();
  const commands = [];
  return {
    commands,
    async load(sessionId) {
      return { state: states.has(sessionId) ? clone(states.get(sessionId)) : null };
    },
    async save(next, expectedVersion) {
      const current = states.get(next.session_id) || null;
      const currentVersion = current ? current.version : 0;
      if (currentVersion !== expectedVersion) return { conflict: true };
      states.set(next.session_id, clone(next));
      return { state: clone(next) };
    },
    async log(entry) {
      commands.push({
        ...entry,
        created_at: entry.created_at || new Date().toISOString(),
      });
      return { ok: true };
    },
    async countRecent(sessionId, sinceIso) {
      const since = Date.parse(sinceIso);
      const count = commands.filter((entry) => entry.sessionId === sessionId && Date.parse(entry.created_at) >= since).length;
      return { count };
    },
  };
}
