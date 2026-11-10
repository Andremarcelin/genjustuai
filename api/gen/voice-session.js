import { loadSessionForRequest } from "../session.js";
import { IP_LIMIT, IP_WINDOW_MS, VOICE_TOKEN_LIMIT, VOICE_TOKEN_WINDOW_MS } from "../../lib/gen/constants.js";
import { executeHouseTool } from "../../lib/gen/executor.js";
import { infraFromStore, initApi, requireActiveSession } from "../../lib/gen/http.js";
import { createSupabaseHouseStore } from "../../lib/gen/house-store.js";
import { createLiveToken } from "../../lib/gen/providers.js";
import { loadMemoryForSession } from "../../lib/gen/history.js";
import { createSessionMemoryStore } from "../../lib/gen/session-memory.js";
import { clientIp, createRateLimiter } from "../../lib/gen/rate-limit.js";
import { profanityAllowed } from "../../lib/gen/profanity.js";
import { normalizeGenStyle } from "../../lib/gen/style.js";
import { supabaseRest } from "../../lib/supabase-rest.cjs";

const sharedSessionLimiter = createRateLimiter({ limit: VOICE_TOKEN_LIMIT, windowMs: VOICE_TOKEN_WINDOW_MS });
const sharedIpLimiter = createRateLimiter({ limit: IP_LIMIT, windowMs: IP_WINDOW_MS });

export function createVoiceHandler(deps = {}) {
  const loadSession = deps.loadSession || ((req) => loadSessionForRequest(req, deps.env, deps.fetchImpl));
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const env = deps.env || process.env;
  const sessionLimiter = deps.limiter || sharedSessionLimiter;
  const ipLimiter = deps.ipLimiter || sharedIpLimiter;
  const store = deps.store || createSupabaseHouseStore();
  const now = deps.now || (() => Date.now());
  const loadMemory = deps.loadMemory || loadMemoryForSession;
  const sessionMemory = deps.sessionMemory || createSessionMemoryStore();
  const loadPrefs = deps.loadPrefs || (async (userId) => {
    if (!userId) return true;
    const result = await supabaseRest(
      `house_prefs?user_id=eq.${encodeURIComponent(userId)}&select=profanity`,
      { serviceRoleOnly: true, raw: true }
    );
    if (!result.ok) return true;
    const row = Array.isArray(result.json) ? result.json[0] : result.json;
    return row?.profanity !== false;
  });

  return async function handler(req, res) {
    if (initApi(req, res, ["POST"])) return;
    try {
      const session = await requireActiveSession(res, loadSession, req);
      if (!session) return;
      const stamp = now();
      if (!sessionLimiter.allow(session.id, stamp) || !ipLimiter.allow(clientIp(req), stamp)) {
        res.status(429).json({ error: "rate_limited" });
        return;
      }
      const current = await executeHouseTool({
        sessionId: session.id,
        tool: "get_house_state",
        args: {},
        store,
        limiter: { allow: () => true },
        now: stamp,
      });
      if (current.error) {
        const infra = infraFromStore(current);
        res.status(infra.status).json(infra.body);
        return;
      }
      let memory = "";
      try {
        memory = await loadMemory({ env, sessionCode: session.id });
      } catch {
        memory = "";
      }
      try {
        const recalled = await sessionMemory.load(session.id);
        if (recalled?.text) memory = [memory, recalled.text].filter(Boolean).join("\n");
      } catch {
        /* memória curta opcional */
      }
      let userPref = true;
      try { userPref = await loadPrefs(session.user_id); } catch { userPref = true; }
      const allowSwear = profanityAllowed(env, userPref);
      const style = normalizeGenStyle(current.state?.gen_style);
      const token = await createLiveToken({
        fetchImpl,
        env,
        session,
        state: current.state,
        memory,
        now: stamp,
        profanity: allowSwear,
        style,
      });
      if (token.error === "missing_config") {
        res.status(503).json({ error: "missing_config", hint: token.hint });
        return;
      }
      if (token.error === "gemini_unavailable") {
        res.status(502).json({ error: "gemini_unavailable", fallback: "groq" });
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
        voiceName: token.voiceName,
        gen_style: style,
      });
    } catch {
      if (!res.headersSent) res.status(503).json({ error: "supabase_unreachable" });
    }
  };
}

export default createVoiceHandler();
