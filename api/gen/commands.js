import { loadActiveSession } from "../session.js";
import { COMMAND_LIMIT, COMMAND_WINDOW_MS } from "../../lib/gen/constants.js";
import { executeHouseTool } from "../../lib/gen/executor.js";
import { infraFromStore, initApi, requireActiveSession } from "../../lib/gen/http.js";
import { createSupabaseHouseStore } from "../../lib/gen/house-store.js";
import { createRateLimiter } from "../../lib/gen/rate-limit.js";
import { recordSessionHistory } from "../../lib/gen/history.js";

const sharedLimiter = createRateLimiter({ limit: COMMAND_LIMIT, windowMs: COMMAND_WINDOW_MS });

export function createCommandsHandler(deps = {}) {
  const loadSession = deps.loadSession || loadActiveSession;
  const store = deps.store || createSupabaseHouseStore();
  const limiter = deps.limiter || sharedLimiter;
  const limit = deps.limit ?? COMMAND_LIMIT;
  const windowMs = deps.windowMs ?? COMMAND_WINDOW_MS;
  const now = deps.now || (() => Date.now());

  return async function handler(req, res) {
    if (initApi(req, res, ["POST"])) return;
    try {
      const session = await requireActiveSession(res, loadSession);
      if (!session) return;
      const tool = req.body?.tool;
      const args = req.body?.args ?? {};
      if (typeof tool !== "string" || !tool.trim() || !args || typeof args !== "object" || Array.isArray(args)) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      const result = await executeHouseTool({
        sessionId: session.id,
        tool,
        args,
        store,
        limiter,
        now: now(),
        limit,
        windowMs,
      });
      if (result.error) {
        const infra = infraFromStore(result);
        res.status(infra.status).json(infra.body);
        return;
      }
      if (result.status === "accepted" && tool !== "get_house_state") {
        const source = req.body?.source === "voice" ? "voice" : "quest";
        try {
          await recordSessionHistory({
            env: deps.env || process.env,
            sessionCode: session.id,
            source,
            actions: [{ tool, args, status: "accepted" }],
          });
        } catch {
          /* o histórico não pode derrubar o comando */
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

export default createCommandsHandler();
