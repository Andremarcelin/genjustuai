import { COMMAND_LIMIT, COMMAND_WINDOW_MS } from "./constants.js";
import { clone, defaultHouseState, toPublicState } from "./defaults.js";
import { applyDevicePatch, listPublicDevices, syncAliasesFromZones } from "./devices.js";
import {
  resolveAudio,
  resolvePlaylistTrack,
  resolveVideo,
  searchWeb,
  toPublicMedia,
} from "./media.js";
import { validateToolCall } from "./tools.js";
import { defaultCityFromSession, fetchWeather } from "./weather.js";

function applyClip(next, clip, device, playing, nowIso) {
  const media = toPublicMedia(clip, device, playing, nowIso);
  if (!media) return next;
  next.media = media;
  const patched = applyDevicePatch(next, { device_id: media.device, on: playing !== false });
  next.lights = patched.lights;
  next.ambience = patched.ambience;
  return next;
}

function applyTool(state, tool, args, nowIso) {
  const next = clone(state);
  if (tool === "set_lights") {
    next.lights[args.zone] = {
      intensity: args.intensity,
      color: String(args.color).toUpperCase(),
      transition_ms: args.transition_ms,
    };
    next.lights = syncAliasesFromZones(next.lights);
  } else if (tool === "set_device") {
    const patched = applyDevicePatch(next, args);
    next.lights = patched.lights;
    next.ambience = patched.ambience;
    if (args.clip) applyClip(next, args.clip, "ambiente", true, nowIso);
  } else if (tool === "set_ambience") {
    next.ambience = {
      preset: args.preset,
      volume: args.volume,
      transition_ms: args.transition_ms,
    };
  } else if (tool === "switch_dojo") {
    next.mode = "dojo";
    next.dojo = args.dojo;
  } else if (tool === "play_music" || tool === "open_video") {
    applyClip(next, args.clip, "tv", true, nowIso);
  } else if (tool === "stop_media") {
    if (next.media) next.media = { ...next.media, playing: false, updated_at: nowIso };
  } else if (tool === "control_media") {
    if (args.stop) {
      if (next.media) next.media = { ...next.media, playing: false, updated_at: nowIso };
    } else if (typeof args.playing === "boolean" && next.media) {
      next.media = { ...next.media, playing: args.playing, updated_at: nowIso };
      if (args.playing) {
        const patched = applyDevicePatch(next, { device_id: next.media.device || "tv", on: true });
        next.lights = patched.lights;
        next.ambience = patched.ambience;
      }
    }
  }
  next.version = state.version + 1;
  next.updated_at = nowIso;
  return next;
}

function publicArgs(args) {
  if (!args || typeof args !== "object") return {};
  const copy = { ...args };
  delete copy.clip;
  return copy;
}

async function safeLog(store, entry) {
  try {
    return await store.log(entry);
  } catch {
    return { error: "supabase_unreachable" };
  }
}

async function resolveClip(tool, args, { fetchImpl, env, profileId }) {
  if (tool === "play_music") {
    return resolveAudio({
      fetchImpl,
      env,
      query: args.query,
      mood: args.mood,
      profileId,
    });
  }
  if (tool === "open_video") {
    return resolveVideo({ fetchImpl, query: args.query });
  }
  if (tool === "set_device" && args.device_id === "ambiente" && args.on !== false) {
    return resolvePlaylistTrack({ fetchImpl, env, profileId });
  }
  return null;
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
  fetchImpl,
  env,
  profileId,
  userId,
  routineStore,
  sessionCity,
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

  if (validated.tool === "get_house_state" || validated.tool === "list_devices" || validated.tool === "web_search" || validated.tool === "get_weather") {
    if (limiter && !limiter.allow(`${sessionId}:read`, now)) {
      return { status: "rejected", reason: "rate_limited", state: toPublicState(base) };
    }
    const state = toPublicState(base);
    if (validated.tool === "list_devices") {
      return { status: "accepted", state, devices: listPublicDevices(state) };
    }
    if (validated.tool === "web_search") {
      let search = [];
      try {
        search = await searchWeb({ fetchImpl, env, query: validated.args.query });
      } catch {
        search = [];
      }
      return {
        status: "accepted",
        state,
        search,
        grounded: Boolean(search?.grounded),
        grounded_text: search?.answer || "",
      };
    }
    if (validated.tool === "get_weather") {
      const city = String(validated.args.city || "").trim() || defaultCityFromSession({ city: sessionCity }, env);
      const weather = await fetchWeather({ fetchImpl, city });
      if (weather.error) {
        return { status: "rejected", reason: weather.reason || weather.error, state };
      }
      return { status: "accepted", state, weather };
    }
    return { status: "accepted", state };
  }

  if (validated.tool === "list_routines" || validated.tool === "create_routine" || validated.tool === "delete_routine") {
    if (!routineStore) {
      return { status: "rejected", reason: "missing_store", state: toPublicState(base) };
    }
    if (!userId && !sessionId) {
      return { status: "rejected", reason: "missing_session", state: toPublicState(base) };
    }
    if (limiter && !limiter.allow(`${sessionId}:routines`, now)) {
      return { status: "rejected", reason: "rate_limited", state: toPublicState(base) };
    }
    if (validated.tool === "list_routines") {
      const listed = await routineStore.list(userId, sessionId);
      if (listed.error) return { error: listed.error, status: listed.status, code: listed.code };
      return { status: "accepted", state: toPublicState(base), routines: listed.routines || [] };
    }
    if (validated.tool === "delete_routine") {
      const removed = await routineStore.remove(userId, validated.args.id, sessionId);
      if (removed.error) return { error: removed.error, status: removed.status, code: removed.code };
      return { status: "accepted", state: toPublicState(base), routines: removed.routines || [] };
    }
    const created = await routineStore.create(userId, sessionId, validated.args);
    if (created.error) return { error: created.error, status: created.status, code: created.code };
    return { status: "accepted", state: toPublicState(base), routines: created.routines || [] };
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
      args: publicArgs(validated.args),
      status: "rejected",
      reason: "rate_limited",
      created_at: new Date(now).toISOString(),
    });
    return { status: "rejected", reason: "rate_limited", state: toPublicState(base) };
  }

  const needsClip = validated.tool === "play_music"
    || validated.tool === "open_video"
    || (validated.tool === "set_device" && validated.args.device_id === "ambiente" && validated.args.on !== false);
  let clip = null;
  if (needsClip) {
    try {
      clip = await resolveClip(validated.tool, validated.args, { fetchImpl, env, profileId });
    } catch {
      clip = null;
    }
    if ((validated.tool === "play_music" || validated.tool === "open_video") && !clip) {
      await safeLog(store, {
        sessionId,
        version: base.version,
        tool: validated.tool,
        args: publicArgs(validated.args),
        status: "rejected",
        reason: "not_found",
        created_at: new Date(now).toISOString(),
      });
      return { status: "rejected", reason: "not_found", state: toPublicState(base) };
    }
  }

  const workArgs = clip ? { ...validated.args, clip } : validated.args;
  let expected = base;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nowIso = new Date(now).toISOString();
    const next = applyTool(expected, validated.tool, workArgs, nowIso);
    const saved = await store.save(next, expected.version);
    if (saved.error) return { error: saved.error, status: saved.status, code: saved.code };
    if (!saved.conflict) {
      await safeLog(store, {
        sessionId,
        version: saved.state.version,
        tool: validated.tool,
        args: publicArgs(validated.args),
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
