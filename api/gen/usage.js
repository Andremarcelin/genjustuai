import { loadSessionForRequest } from "../session.js";
import { initApi, requireActiveSession } from "../../lib/gen/http.js";
import { addSessionTokens } from "../../lib/gen/session-tokens.js";
import { normalizeUsage, publicTokenFields } from "../../lib/gen/token-usage.js";

export function createUsageHandler(deps = {}) {
  const loadSession = deps.loadSession || ((req) => loadSessionForRequest(req, deps.env, deps.fetchImpl));
  const persist = deps.addSessionTokens || addSessionTokens;

  return async function handler(req, res) {
    if (initApi(req, res, ["POST"])) return;
    try {
      const session = await requireActiveSession(res, loadSession, req);
      if (!session) return;
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const usage = normalizeUsage({
        tokens_in: body.tokens_in ?? body.inputTokens,
        tokens_out: body.tokens_out ?? body.outputTokens,
        tokens_total: body.tokens_total ?? body.totalTokens,
        calls: body.calls ?? 1,
        estimated: body.estimated,
      });
      if (!usage.calls && !usage.tokens_total) {
        res.status(200).json({ ok: true, skipped: true, ...publicTokenFields(usage) });
        return;
      }
      await persist(session.id, usage);
      res.status(200).json({ ok: true, ...publicTokenFields(usage) });
    } catch {
      if (!res.headersSent) res.status(503).json({ error: "supabase_unreachable" });
    }
  };
}

export default createUsageHandler();
