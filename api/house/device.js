import { loadSessionForRequest } from "../session.js";
import { COMMAND_LIMIT, COMMAND_WINDOW_MS } from "../../lib/gen/constants.js";
import { DEVICE_IDS } from "../../lib/gen/devices.js";
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

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

export function createDeviceHandler(deps = {}) {
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
      const deviceId = String(payload.device_id || payload.deviceId || "").trim();
      if (!DEVICE_IDS.includes(deviceId)) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      const args = { device_id: deviceId };
      const on = asBoolean(payload.on);
      if (on !== undefined) args.on = on;
      if (payload.color != null) args.color = payload.color;
      const intensity = asNumber(payload.intensity);
      if (intensity !== undefined) args.intensity = intensity;

      const result = await executeHouseTool({
        sessionId: session.id,
        tool: "set_device",
        args,
        store,
        limiter,
        now: now(),
      });
      if (result.error) {
        const infra = infraFromStore(result);
        res.status(infra.status).json(infra.body);
        return;
      }
      if (result.status === "accepted") {
        try {
          await recordSessionHistory({
            env: deps.env || process.env,
            sessionCode: session.id,
            source: "house",
            actions: [{ tool: "set_device", args, status: "accepted" }],
          });
        } catch {
          /* histórico não derruba o toggle */
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

export default createDeviceHandler();
