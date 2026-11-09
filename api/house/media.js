import { loadSessionForRequest } from "../session.js";
import { COMMAND_LIMIT, COMMAND_WINDOW_MS } from "../../lib/gen/constants.js";
import { executeHouseTool } from "../../lib/gen/executor.js";
import { infraFromStore, initApi, readRequestBody, requireActiveSession } from "../../lib/gen/http.js";
import { createSupabaseHouseStore } from "../../lib/gen/house-store.js";
import { createRateLimiter } from "../../lib/gen/rate-limit.js";
import { recordSessionHistory } from "../../lib/gen/history.js";

const sharedLimiter = createRateLimiter({ limit: COMMAND_LIMIT, windowMs: COMMAND_WINDOW_MS });

function asBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function createMediaHandler(deps = {}) {
  const loadSession = deps.loadSession || ((req) => loadSessionForRequest(req, deps.env, deps.fetchImpl));
  const store = deps.store || createSupabaseHouseStore();
  const limiter = deps.limiter || sharedLimiter;
  const now = deps.now || (() => Date.now());

  return async function handler(req, res) {
    if (initApi(req, res, ["POST"])) return;
    try {
      const session = await requireActiveSession(res, loadSession, req);
      if (!session) return;
      const raw = await readRequestBody(req, 32_000);
      if (raw.tooLarge) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      let payload = raw.body;
      if (Buffer.isBuffer(payload)) {
        try {
          payload = JSON.parse(payload.toString("utf8") || "{}");
        } catch {
          res.status(400).json({ error: "invalid_request" });
          return;
        }
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }

      const env = deps.env || process.env;
      const fetchImpl = deps.fetchImpl || globalThis.fetch;
      const profileId = session.profile_id || session.profileId;
      const query = typeof payload.query === "string" ? payload.query.trim().slice(0, 120) : "";
      let tool = "control_media";
      let args = {};
      if (payload.stop === true || payload.action === "stop") {
        tool = "stop_media";
        args = {};
      } else if (payload.action === "play_music" || (query && payload.type !== "video")) {
        tool = "play_music";
        args = { query: query || undefined, mood: typeof payload.mood === "string" ? payload.mood : undefined };
      } else if (payload.action === "open_video" || payload.type === "video") {
        tool = "open_video";
        args = { query: query || "creative commons short film" };
      } else {
        const playing = asBoolean(payload.playing);
        if (playing === undefined) {
          res.status(400).json({ error: "invalid_request" });
          return;
        }
        args = { playing };
      }

      const result = await executeHouseTool({
        sessionId: session.id,
        tool,
        args,
        store,
        limiter,
        now: now(),
        fetchImpl,
        env,
        profileId,
      });
      if (result.error) {
        const infra = infraFromStore(result);
        res.status(infra.status).json(infra.body);
        return;
      }
      if (result.status === "accepted") {
        try {
          await recordSessionHistory({
            env,
            sessionCode: session.id,
            source: "house",
            actions: [{ tool, args, status: "accepted" }],
          });
        } catch {
          /* histórico não derruba a mídia */
        }
      }
      const body = { status: result.status, state: result.state };
      if (result.reason) body.reason = result.reason;
      res.status(200).json(body);
    } catch {
      if (!res.headersSent) res.status(503).json({ error: "supabase_unreachable" });
    }
  };
}

export default createMediaHandler();
