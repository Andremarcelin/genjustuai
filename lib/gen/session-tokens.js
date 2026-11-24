import { supabaseRest } from "../supabase-rest.cjs";
import { emptyUsage, normalizeUsage } from "./token-usage.js";

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/i;

function headers() {
  return { "Content-Type": "application/json", Prefer: "return=representation" };
}

export async function addSessionTokens(sessionCode, usage, rest = supabaseRest) {
  const code = String(sessionCode || "").toUpperCase();
  const delta = normalizeUsage(usage);
  if (!CODE_RE.test(code)) return { ok: false, error: "invalid_code" };
  if (!delta.calls && !delta.tokens_total) return { ok: true, skipped: true };

  const rpc = await rest("rpc/genjutsu_add_session_tokens", {
    method: "POST",
    serviceRoleOnly: true,
    body: JSON.stringify({
      p_code: code,
      p_in: delta.tokens_in,
      p_out: delta.tokens_out,
      p_total: delta.tokens_total,
      p_calls: delta.calls,
      p_estimated: delta.estimated,
    }),
    headers: headers(),
  });
  if (rpc.ok || rpc.error !== "schema") return rpc;

  const select = await rest(
    `session_summaries?session_code=eq.${encodeURIComponent(code)}&select=tokens_in,tokens_out,tokens_total,token_calls,tokens_estimated`,
    { serviceRoleOnly: true }
  );
  if (!select.ok) return select;
  const row = Array.isArray(select.json) ? select.json[0] : null;
  if (!row) return { ok: false, error: "not_found" };
  const next = {
    tokens_in: (Number(row.tokens_in) || 0) + delta.tokens_in,
    tokens_out: (Number(row.tokens_out) || 0) + delta.tokens_out,
    tokens_total: (Number(row.tokens_total) || 0) + delta.tokens_total,
    token_calls: (Number(row.token_calls) || 0) + delta.calls,
    tokens_estimated: Boolean(row.tokens_estimated) || delta.estimated,
  };
  return rest(
    `session_summaries?session_code=eq.${encodeURIComponent(code)}`,
    {
      method: "PATCH",
      serviceRoleOnly: true,
      body: JSON.stringify(next),
      headers: headers(),
    }
  );
}

export function tokensFromSummaryRow(row) {
  if (!row) return emptyUsage();
  return normalizeUsage({
    tokens_in: row.tokens_in,
    tokens_out: row.tokens_out,
    tokens_total: row.tokens_total,
    calls: row.token_calls ?? row.calls,
    estimated: row.tokens_estimated,
  });
}
