import { COMMAND_LIMIT, COMMAND_WINDOW_MS } from "./constants.js";
import { clone, defaultHouseState, toPublicState } from "./defaults.js";
import { validateToolCall } from "./tools.js";

function applyTool(state, tool, args, nowIso) {
  const next = clone(state);
  if (tool === "set_lights") {
    next.lights[args.zone] = {
      intensity: args.intensity,
      color: String(args.color).toUpperCase(),
      transition_ms: args.transition_ms,
    };
  } else if (tool === "set_ambience") {
    next.ambience = {
      preset: args.preset,
      volume: args.volume,
      transition_ms: args.transition_ms,
    };
  } else if (tool === "switch_dojo") {
    next.mode = "dojo";
    next.dojo = args.dojo;
  }
  next.version = state.version + 1;
  next.updated_at = nowIso;
  return next;
}

async function safeLog(store, entry) {
  try {
    return await store.log(entry);
  } catch {
    return { error: "supabase_unreachable" };
  }
}

export async function executeHouseTool({
  sessionId,
  tool,
  args,
  store,
  limiter,
  now = Date.now(),
  limit = COMMAND_LIMIT,
  windowMs = COMMAND_WINDOW_MS,
}) {
  const validated = validateToolCall(tool, args);
  const loaded = await store.load(sessionId);
  if (loaded.error) return { error: loaded.error, status: loaded.status, code: loaded.code };
  const base = loaded.state || defaultHouseState(sessionId);

  if (!validated.ok) {
    await safeLog(store, {
      sessionId,
      version: base.version,
      tool,
      args: args && typeof args === "object" ? args : {},
      status: "rejected",
      reason: validated.reason,
      created_at: new Date(now).toISOString(),
    });
    return { status: "rejected", reason: validated.reason, state: toPublicState(base) };
  }

  if (validated.tool === "get_house_state") {
    if (limiter && !limiter.allow(`${sessionId}:read`, now)) {
      return { status: "rejected", reason: "rate_limited", state: toPublicState(base) };
    }
    return { status: "accepted", state: toPublicState(base) };
  }

  const since = new Date(now - windowMs).toISOString();
  const recent = await store.countRecent(sessionId, since);
  if (recent.error) return { error: recent.error, status: recent.status, code: recent.code };
  const allowed = !limiter || limiter.allow(sessionId, now);
  if (!allowed || recent.count >= limit) {
    await safeLog(store, {
      sessionId,
      version: base.version,
      tool: validated.tool,
      args: validated.args,
      status: "rejected",
      reason: "rate_limited",
      created_at: new Date(now).toISOString(),
    });
    return { status: "rejected", reason: "rate_limited", state: toPublicState(base) };
  }

  let expected = base;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nowIso = new Date(now).toISOString();
    const next = applyTool(expected, validated.tool, validated.args, nowIso);
    const saved = await store.save(next, expected.version);
    if (saved.error) return { error: saved.error, status: saved.status, code: saved.code };
    if (!saved.conflict) {
      await safeLog(store, {
        sessionId,
        version: saved.state.version,
        tool: validated.tool,
        args: validated.args,
        status: "accepted",
        reason: null,
        created_at: nowIso,
      });
      return { status: "accepted", state: saved.state };
    }
    const again = await store.load(sessionId);
    if (again.error) return { error: again.error, status: again.status, code: again.code };
    expected = again.state || defaultHouseState(sessionId);
  }

  return { status: "rejected", reason: "conflict", state: toPublicState(expected) };
}
