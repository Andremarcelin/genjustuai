import { loadActiveSession } from "../session.js";
import { CHAT_LIMIT, CHAT_WINDOW_MS, IP_LIMIT, IP_WINDOW_MS, MAX_AUDIO_BYTES } from "../../lib/gen/constants.js";
import { defaultHouseState } from "../../lib/gen/defaults.js";
import { executeHouseTool } from "../../lib/gen/executor.js";
import { header, infraFromStore, initApi, readRequestBody, requireActiveSession } from "../../lib/gen/http.js";
import { createSupabaseHouseStore } from "../../lib/gen/house-store.js";
import { audioExtension, isAllowedAudio, parseMultipart } from "../../lib/gen/multipart.js";
import { buildSystemInstruction } from "../../lib/gen/persona.js";
import { completeChat, parseToolArguments, transcribeAudio, visibleReply } from "../../lib/gen/providers.js";
import { clientIp, createRateLimiter } from "../../lib/gen/rate-limit.js";
import { toGroqTools } from "../../lib/gen/tools.js";

const sharedChatLimiter = createRateLimiter({ limit: CHAT_LIMIT, windowMs: CHAT_WINDOW_MS });
const sharedIpLimiter = createRateLimiter({ limit: IP_LIMIT, windowMs: IP_WINDOW_MS });
const sharedCommandLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

function fallbackReply(actions) {
  const accepted = actions.some((action) => action.status === "accepted" && action.tool !== "get_house_state");
  const rejected = actions.some((action) => action.status === "rejected");
  if (accepted) return "A casa atualizou.";
  if (rejected) return "Não consegui mudar a casa.";
  return "Pode repetir?";
}

async function readTurn(req) {
  const type = header(req, "content-type");
  const raw = await readRequestBody(req, MAX_AUDIO_BYTES);
  if (raw.tooLarge) return { error: "audio_too_large", status: 413 };
  if (type.includes("multipart/form-data")) {
    const parts = parseMultipart(raw.body, type);
    if (!parts) return { error: "invalid_audio", status: 400 };
    const file = parts.find((part) => part.kind === "file" && (part.name === "audio" || part.name === "file"));
    if (!file || !file.data?.length) return { error: "invalid_audio", status: 400 };
    if (!isAllowedAudio(file.mime)) return { error: "invalid_audio", status: 400 };
    return { audio: file.data, mime: file.mime, filename: file.filename || `audio.${audioExtension(file.mime)}` };
  }
  let payload = raw.body;
  if (Buffer.isBuffer(payload)) {
    try {
      payload = JSON.parse(payload.toString("utf8") || "{}");
    } catch {
      return { error: "invalid_request", status: 400 };
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "invalid_request", status: 400 };
  }
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) return { error: "invalid_request", status: 400 };
  return { text: text.slice(0, 2000) };
}

export function createChatHandler(deps = {}) {
  const loadSession = deps.loadSession || loadActiveSession;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const env = deps.env || process.env;
  const store = deps.store || createSupabaseHouseStore();
  const chatLimiter = deps.chatLimiter || sharedChatLimiter;
  const ipLimiter = deps.ipLimiter || sharedIpLimiter;
  const commandLimiter = deps.commandLimiter || sharedCommandLimiter;
  const now = deps.now || (() => Date.now());

  return async function handler(req, res) {
    if (initApi(req, res, ["POST"])) return;
    try {
      const session = await requireActiveSession(res, loadSession);
      if (!session) return;
      const stamp = now();
      if (!chatLimiter.allow(session.id, stamp) || !ipLimiter.allow(clientIp(req), stamp)) {
        res.status(429).json({ error: "rate_limited" });
        return;
      }
      const turn = await readTurn(req);
      if (turn.error) {
        res.status(turn.status).json({ error: turn.error });
        return;
      }

      let transcript = turn.text || "";
      if (turn.audio) {
        const heard = await transcribeAudio({
          fetchImpl,
          env,
          audio: turn.audio,
          mime: turn.mime,
        });
        if (heard.error === "missing_config") {
          res.status(503).json({ error: "missing_config", hint: heard.hint });
          return;
        }
        if (heard.error) {
          res.status(502).json({ error: "provider_unreachable", provider: "groq" });
          return;
        }
        transcript = heard.text.slice(0, 2000);
      }

      const current = await executeHouseTool({
        sessionId: session.id,
        tool: "get_house_state",
        args: {},
        store,
        limiter: commandLimiter,
        now: stamp,
      });
      if (current.error) {
        const infra = infraFromStore(current);
        res.status(infra.status).json(infra.body);
        return;
      }

      if (!transcript) {
        res.status(200).json({
          transcript: "",
          reply_text: "Não ouvi nada. Pode repetir?",
          actions: [],
          state: current.state,
        });
        return;
      }

      const groqKey = String(env.GROQ_API_KEY || "").trim();
      if (!groqKey) {
        res.status(503).json({
          error: "missing_config",
          hint: "Defina GROQ_API_KEY na Vercel. A chave fica só no servidor.",
        });
        return;
      }

      const messages = [
        { role: "system", content: buildSystemInstruction(session) },
        { role: "user", content: transcript },
      ];
      const actions = [];
      let state = current.state || defaultHouseState(session.id);
      const tools = toGroqTools();

      for (let round = 0; round < 2; round += 1) {
        const completion = await completeChat({
          fetchImpl,
          env,
          messages,
          tools,
          toolChoice: "auto",
        });
        if (completion.error === "missing_config") {
          res.status(503).json({ error: "missing_config", hint: completion.hint });
          return;
        }
        if (completion.error) {
          res.status(502).json({ error: "provider_unreachable", provider: "groq" });
          return;
        }
        const message = completion.message;
        const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
        if (!calls.length) {
          const reply = visibleReply(message.content) || fallbackReply(actions);
          res.status(200).json({ transcript, reply_text: reply, actions, state });
          return;
        }
        messages.push({
          role: "assistant",
          content: typeof message.content === "string" ? message.content : "",
          tool_calls: calls,
        });
        for (const call of calls) {
          const name = call?.function?.name;
          const parsed = parseToolArguments(call?.function?.arguments);
          let outcome;
          if (parsed === null) {
            outcome = { status: "rejected", reason: "invalid_args", state };
          } else {
            outcome = await executeHouseTool({
              sessionId: session.id,
              tool: name,
              args: parsed,
              store,
              limiter: commandLimiter,
              now: stamp,
            });
            if (outcome.error) {
              const infra = infraFromStore(outcome);
              res.status(infra.status).json(infra.body);
              return;
            }
          }
          if (outcome.state) state = outcome.state;
          actions.push({
            tool: typeof name === "string" ? name : "unknown",
            args: parsed && typeof parsed === "object" ? parsed : {},
            status: outcome.status,
            reason: outcome.reason || null,
          });
          messages.push({
            role: "tool",
            tool_call_id: call?.id || `call_${actions.length}`,
            content: JSON.stringify({
              status: outcome.status,
              reason: outcome.reason || null,
              state: outcome.state || state,
            }),
          });
        }
      }

      const finalTurn = await completeChat({ fetchImpl, env, messages, toolChoice: "none" });
      if (finalTurn.error) {
        res.status(200).json({
          transcript,
          reply_text: fallbackReply(actions),
          actions,
          state,
        });
        return;
      }
      res.status(200).json({
        transcript,
        reply_text: visibleReply(finalTurn.message?.content) || fallbackReply(actions),
        actions,
        state,
      });
    } catch {
      if (!res.headersSent) res.status(503).json({ error: "supabase_unreachable" });
    }
  };
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default createChatHandler();
