export function emptyUsage() {
  return { tokens_in: 0, tokens_out: 0, tokens_total: 0, calls: 0, estimated: false };
}

export function estimateTokensFromText(text) {
  const chars = String(text || "").length;
  if (!chars) return 0;
  return Math.max(1, Math.ceil(chars / 4));
}

function serializeMessages(messages) {
  if (!messages) return "";
  if (typeof messages === "string") return messages;
  try {
    return JSON.stringify(messages);
  } catch {
    return String(messages);
  }
}

export function normalizeUsage(raw = {}) {
  const tokensIn = Math.max(0, Math.floor(Number(raw.tokens_in) || 0));
  const tokensOut = Math.max(0, Math.floor(Number(raw.tokens_out) || 0));
  let tokensTotal = Math.max(0, Math.floor(Number(raw.tokens_total) || 0));
  if (!tokensTotal) tokensTotal = tokensIn + tokensOut;
  let calls = Math.max(0, Math.floor(Number(raw.calls) || 0));
  if (!calls && tokensTotal > 0) calls = 1;
  return {
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    tokens_total: tokensTotal,
    calls,
    estimated: Boolean(raw.estimated),
  };
}

export function addUsage(left, right) {
  const a = normalizeUsage(left || emptyUsage());
  const b = normalizeUsage(right || emptyUsage());
  return {
    tokens_in: a.tokens_in + b.tokens_in,
    tokens_out: a.tokens_out + b.tokens_out,
    tokens_total: a.tokens_total + b.tokens_total,
    calls: a.calls + b.calls,
    estimated: Boolean(a.estimated || b.estimated),
  };
}

export function parseUsageMetadata(json) {
  if (!json || typeof json !== "object") return null;
  const meta = json.usageMetadata || json.usage_metadata || json.usage;
  if (!meta || typeof meta !== "object") return null;
  if (meta.type === "duration") return null;
  if (meta.seconds != null && meta.prompt_tokens == null && meta.promptTokenCount == null
    && meta.total_tokens == null && meta.totalTokenCount == null) {
    return null;
  }
  const tokensIn = meta.promptTokenCount ?? meta.prompt_token_count ?? meta.prompt_tokens
    ?? meta.inputTokenCount ?? meta.input_tokens;
  const tokensOut = meta.candidatesTokenCount ?? meta.candidates_token_count
    ?? meta.responseTokenCount ?? meta.response_token_count
    ?? meta.completion_tokens ?? meta.output_tokens;
  const tokensTotal = meta.totalTokenCount ?? meta.total_token_count ?? meta.total_tokens;
  if (tokensIn == null && tokensOut == null && tokensTotal == null) return null;
  return normalizeUsage({
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    tokens_total: tokensTotal,
    calls: 1,
    estimated: false,
  });
}

export function estimateFromMessages(messages, reply) {
  const input = estimateTokensFromText(serializeMessages(messages));
  let replyText = "";
  if (typeof reply === "string") replyText = reply;
  else if (reply && typeof reply === "object") {
    if (typeof reply.content === "string") replyText = reply.content;
    else replyText = serializeMessages(reply);
  }
  const output = estimateTokensFromText(replyText);
  return normalizeUsage({
    tokens_in: input,
    tokens_out: output,
    tokens_total: input + output,
    calls: 1,
    estimated: true,
  });
}

export function usageFromProvider(json, { messages, reply } = {}) {
  const real = parseUsageMetadata(json);
  if (real) return real;
  return estimateFromMessages(messages, reply);
}

export function formatPtInt(value) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString("pt-BR");
}

export function formatSessionTokens(usage) {
  const u = normalizeUsage(usage || emptyUsage());
  let line = `Esta sessão usou ${formatPtInt(u.tokens_total)} tokens (entrada ${formatPtInt(u.tokens_in)} · saída ${formatPtInt(u.tokens_out)})`;
  if (u.estimated) line += " · parte estimada";
  return line;
}

export function publicTokenFields(usage) {
  const u = normalizeUsage(usage || emptyUsage());
  return {
    tokens_in: u.tokens_in,
    tokens_out: u.tokens_out,
    tokens_total: u.tokens_total,
    calls: u.calls,
  };
}
