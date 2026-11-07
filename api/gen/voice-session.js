import { loadActiveSession } from "../session.js";
import { IP_LIMIT, IP_WINDOW_MS, VOICE_TOKEN_LIMIT, VOICE_TOKEN_WINDOW_MS } from "../../lib/gen/constants.js";
import { initApi, requireActiveSession } from "../../lib/gen/http.js";
import { createLiveToken } from "../../lib/gen/providers.js";
import { clientIp, createRateLimiter } from "../../lib/gen/rate-limit.js";

const sharedSessionLimiter = createRateLimiter({ limit: VOICE_TOKEN_LIMIT, windowMs: VOICE_TOKEN_WINDOW_MS });
const sharedIpLimiter = createRateLimiter({ limit: IP_LIMIT, windowMs: IP_WINDOW_MS });

export function createVoiceHandler(deps = {}) {
  const loadSession = deps.loadSession || loadActiveSession;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const env = deps.env || process.env;
  const sessionLimiter = deps.limiter || sharedSessionLimiter;
  const ipLimiter = deps.ipLimiter || sharedIpLimiter;
  const now = deps.now || (() => Date.now());

  return async function handler(req, res) {
    if (initApi(req, res, ["POST"])) return;
    try {
      const session = await requireActiveSession(res, loadSession);
      if (!session) return;
      const stamp = now();
      if (!sessionLimiter.allow(session.id, stamp) || !ipLimiter.allow(clientIp(req), stamp)) {
        res.status(429).json({ error: "rate_limited" });
        return;
      }
      const token = await createLiveToken({
        fetchImpl,
        env,
        session,
        now: stamp,
      });
      if (token.error === "missing_config") {
        res.status(503).json({ error: "missing_config", hint: token.hint });
        return;
      }
      if (token.error) {
        res.status(502).json({ error: "provider_unreachable", provider: "gemini" });
        return;
      }
      res.status(200).json({
        provider: token.provider,
        model: token.model,
        token: token.token,
        expiresAt: token.expiresAt,
        wsUrl: token.wsUrl,
        systemInstruction: token.systemInstruction,
        tools: token.tools,
      });
    } catch {
      if (!res.headersSent) res.status(503).json({ error: "supabase_unreachable" });
    }
  };
}

export default createVoiceHandler();
