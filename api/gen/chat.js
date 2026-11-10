import { loadSessionForRequest } from "../session.js";
import { CHAT_LIMIT, CHAT_WINDOW_MS, IP_LIMIT, IP_WINDOW_MS, MAX_AUDIO_BYTES } from "../../lib/gen/constants.js";
import { defaultHouseState } from "../../lib/gen/defaults.js";
import { executeHouseTool } from "../../lib/gen/executor.js";
import { header, infraFromStore, initApi, readRequestBody, requireActiveSession } from "../../lib/gen/http.js";
import { createSupabaseHouseStore } from "../../lib/gen/house-store.js";
import { audioExtension, isAllowedAudio, parseMultipart } from "../../lib/gen/multipart.js";
import { parseHouseIntent, plannedActions } from "../../lib/gen/intent.js";
import { buildSystemInstruction, chooseReply } from "../../lib/gen/persona.js";
import { chatPrimary, completeChat, geminiKeys, parseToolArguments, transcribeAudio, visibleReply } from "../../lib/gen/providers.js";
import { clientIp, createRateLimiter } from "../../lib/gen/rate-limit.js";
import { toGroqTools } from "../../lib/gen/tools.js";
import { loadMemoryForSession, recordSessionHistory } from "../../lib/gen/history.js";
import { createRoutineStore } from "../../lib/gen/routine-store.js";
import { parseRoutineRequest } from "../../lib/gen/routines.js";
import {
  confirmGameRoutine,
  createSessionMemoryStore,
  gameRoutineFromFact,
  hasKickoff,
  isGameTimeRequest,
  missingKickoffReply,
  parseMatchFact,
  teamFromText,
} from "../../lib/gen/session-memory.js";
import { normalizeGenStyle, parseStyleRequest, stylePhrase } from "../../lib/gen/style.js";
import { runDueRoutines } from "../../lib/gen/run-routines.js";
import { profanityAllowed } from "../../lib/gen/profanity.js";
import { supabaseRest } from "../../lib/supabase-rest.cjs";

const sharedChatLimiter = createRateLimiter({ limit: CHAT_LIMIT, windowMs: CHAT_WINDOW_MS });
const sharedIpLimiter = createRateLimiter({ limit: IP_LIMIT, windowMs: IP_WINDOW_MS });
const sharedCommandLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

function replyText(modelText, actions, transcript, state, style) {
  const search = (actions || []).find((item) => item.tool === "web_search" && item.search)?.search;
  return chooseReply({ modelText, actions, transcript, state, search, style });
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
  const loadSession = deps.loadSession || ((req) => loadSessionForRequest(req, deps.env, deps.fetchImpl));
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const env = deps.env || process.env;
  const store = deps.store || createSupabaseHouseStore();
  const chatLimiter = deps.chatLimiter || sharedChatLimiter;
  const ipLimiter = deps.ipLimiter || sharedIpLimiter;
  const commandLimiter = deps.commandLimiter || sharedCommandLimiter;
  const now = deps.now || (() => Date.now());
  const loadMemory = deps.loadMemory || loadMemoryForSession;
  const sessionMemory = deps.sessionMemory || createSessionMemoryStore();
  const routineStore = deps.routineStore || createRoutineStore();
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

      const runTool = (tool, args) => executeHouseTool({
        sessionId: session.id,
        tool,
        args,
        store,
        limiter: commandLimiter,
        now: stamp,
        fetchImpl,
        env,
        profileId: session.profile_id || session.profileId,
        userId: session.user_id || null,
        routineStore,
        sessionCity: session.city || session.city_name || session.cidade,
      });

      try {
        await runDueRoutines({
          houseStore: store,
          routineStore,
          env,
          fetchImpl,
          limiter: commandLimiter,
          now: stamp,
          userId: session.user_id || null,
          sessionId: session.id,
        });
      } catch { /* tick não derruba o chat */ }

      const current = await runTool("get_house_state", {});
      if (current.error) {
        const infra = infraFromStore(current);
        res.status(infra.status).json(infra.body);
        return;
      }

      async function sendTurn(payload) {
        const body = {
          ...payload,
          meta: {
            provider: payload.meta?.provider || payload.provider || null,
            model: payload.meta?.model || payload.model || null,
            ...(payload.meta?.gemini_error ? { gemini_error: payload.meta.gemini_error } : {}),
          },
        };
        delete body.provider;
        delete body.model;
        if (body.transcript) {
          try {
            await recordSessionHistory({
              env,
              sessionCode: session.id,
              source: turn.audio ? "voice" : "chat",
              transcript: body.transcript,
              reply: body.reply_text,
              actions: body.actions,
            });
          } catch {
            /* o histórico não pode derrubar a resposta */
          }
          try {
            const searchBlob = (body.actions || [])
              .filter((item) => item.tool === "web_search")
              .map((item) => item.grounded_text || (item.search || []).map((hit) => hit.snippet).join(" "))
              .join(" ");
            const fact = parseMatchFact(`${body.transcript}\n${body.reply_text}\n${searchBlob}`, new Date(stamp));
            await sessionMemory.remember(session.id, {
              transcript: body.transcript,
              reply: body.reply_text,
              fact: hasKickoff(fact) ? fact : null,
            });
          } catch {
            /* memória curta não derruba a resposta */
          }
        }
        res.status(200).json(body);
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
      const hasGemini = geminiKeys(env).length > 0;
      if (!hasGemini && !groqKey) {
        const primary = chatPrimary(env);
        res.status(503).json({
          error: "missing_config",
          hint: primary === "groq"
            ? "Defina GROQ_API_KEY na Vercel. A chave fica só no servidor."
            : "Defina GEMINI_API_KEY na Vercel. A chave fica só no servidor.",
        });
        return;
      }

      const actions = [];
      let used = { provider: null, model: null };
      let state = current.state || defaultHouseState(session.id);
      let memory = "";
      try {
        memory = await loadMemory({ env, sessionCode: session.id });
      } catch {
        memory = "";
      }
      let recalled = { turns: [], facts: {}, text: "" };
      try {
        recalled = await sessionMemory.load(session.id);
      } catch {
        recalled = { turns: [], facts: {}, text: "" };
      }
      if (recalled.text) memory = [memory, recalled.text].filter(Boolean).join("\n");
      let userPref = true;
      try { userPref = await loadPrefs(session.user_id); } catch { userPref = true; }
      const allowSwear = profanityAllowed(env, userPref);
      let style = normalizeGenStyle(state?.gen_style);
      const styleAsk = parseStyleRequest(transcript);
      if (styleAsk) {
        const outcome = await runTool("set_gen_style", { style: styleAsk });
        if (outcome.error) {
          const infra = infraFromStore(outcome);
          res.status(infra.status).json(infra.body);
          return;
        }
        if (outcome.state) state = outcome.state;
        style = normalizeGenStyle(styleAsk);
        actions.push({
          tool: "set_gen_style",
          args: { style: styleAsk },
          status: outcome.status,
          reason: outcome.reason || null,
        });
      }
      const gameAsk = isGameTimeRequest(transcript);
      if (gameAsk) {
        let match = recalled.facts?.match;
        if (!hasKickoff(match)) {
          const team = teamFromText(transcript) || match?.team || "Corinthians";
          const query = `próximo jogo do ${team} horário data`;
          const searched = await runTool("web_search", { query });
          if (searched.error) {
            const infra = infraFromStore(searched);
            res.status(infra.status).json(infra.body);
            return;
          }
          actions.push({
            tool: "web_search",
            args: { query },
            status: searched.status,
            reason: searched.reason || null,
            search: searched.search || undefined,
            grounded_text: searched.grounded_text || undefined,
            grounded: searched.grounded || undefined,
          });
          const blob = [
            searched.grounded_text,
            ...(Array.isArray(searched.search) ? searched.search.map((hit) => `${hit.title} ${hit.snippet}`) : []),
          ].join("\n");
          match = parseMatchFact(`${transcript}\n${blob}`, new Date(stamp))
            || parseMatchFact(blob, new Date(stamp));
          if (hasKickoff(match)) {
            recalled.facts = { ...recalled.facts, match };
            try {
              await sessionMemory.remember(session.id, { fact: match });
            } catch { /* fato local */ }
          }
        }
        if (!hasKickoff(match)) {
          await sendTurn({
            transcript,
            reply_text: missingKickoffReply(),
            actions,
            state,
            meta: { provider: "none", model: null },
          });
          return;
        }
        const game = gameRoutineFromFact(match);
        const created = await runTool("create_routine", game);
        if (created.error) {
          const infra = infraFromStore(created);
          res.status(infra.status).json(infra.body);
          return;
        }
        if (created.state) state = created.state;
        actions.push({
          tool: "create_routine",
          args: game,
          status: created.status,
          reason: created.reason || null,
        });
        const reply = created.status === "accepted"
          ? confirmGameRoutine(match)
          : "Não consegui gravar a rotina do jogo. Tenta de novo.";
        await sendTurn({
          transcript,
          reply_text: reply,
          actions,
          state,
          meta: { provider: "none", model: null },
        });
        return;
      }
      if (styleAsk && !parseRoutineRequest(transcript)) {
        await sendTurn({
          transcript,
          reply_text: actions.some((item) => item.tool === "set_gen_style" && item.status === "accepted")
            ? stylePhrase(style, { voicePending: true })
            : "Não consegui mudar o tom agora.",
          actions,
          state,
          meta: { provider: "none", model: null },
        });
        return;
      }
      let routinePlan = parseRoutineRequest(transcript);
      const messages = [
        { role: "system", content: buildSystemInstruction(session, state, memory, { profanity: allowSwear, style, now: new Date(stamp) }) },
        { role: "user", content: transcript },
      ];
      const tools = toGroqTools();
      const packRoutine = (plan) => ({
        tool: "create_routine",
        args: {
          name: plan.name,
          hour: plan.schedule.hour,
          minute: plan.schedule.minute,
          days: plan.schedule.days,
          actions: plan.actions,
          once: plan.schedule.once === true,
        },
      });
      function pushAction(name, parsed, outcome) {
        actions.push({
          tool: typeof name === "string" ? name : "unknown",
          args: parsed && typeof parsed === "object" ? parsed : {},
          status: outcome.status,
          reason: outcome.reason || null,
          search: outcome.search || undefined,
          weather: outcome.weather || undefined,
          grounded_text: outcome.grounded_text || undefined,
          grounded: outcome.grounded || undefined,
        });
        if (outcome.gemini_error && !used.gemini_error) used.gemini_error = outcome.gemini_error;
      }

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
          const intentActions = routinePlan
            ? [packRoutine(routinePlan)]
            : plannedActions(parseHouseIntent(transcript), state);
          if (!intentActions.length) {
            res.status(502).json({
              error: "provider_unreachable",
              provider: used.provider || chatPrimary(env),
              meta: {
                provider: used.provider || chatPrimary(env),
                gemini_error: completion.gemini_error || used.gemini_error || undefined,
              },
            });
            return;
          }
          for (const plan of intentActions) {
            const outcome = await runTool(plan.tool, plan.args);
            if (outcome.error) {
              const infra = infraFromStore(outcome);
              res.status(infra.status).json(infra.body);
              return;
            }
            if (outcome.state) state = outcome.state;
            pushAction(plan.tool, plan.args, outcome);
          }
          const reply = replyText("", actions, transcript, state, style);
          await sendTurn({
            transcript,
            reply_text: reply,
            actions,
            state,
            meta: used,
          });
          return;
        }
        used = {
          provider: completion.provider || used.provider,
          model: completion.model || used.model,
          gemini_error: completion.gemini_error || used.gemini_error,
        };
        const message = completion.message;
        const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
        if (!calls.length) {
          const intentActions = routinePlan
            ? [packRoutine(routinePlan)]
            : plannedActions(parseHouseIntent(transcript), state);
          for (const plan of intentActions) {
            const outcome = await runTool(plan.tool, plan.args);
            if (outcome.error) {
              const infra = infraFromStore(outcome);
              res.status(infra.status).json(infra.body);
              return;
            }
            if (outcome.state) state = outcome.state;
            pushAction(plan.tool, plan.args, outcome);
          }
          const reply = replyText(visibleReply(message.content), actions, transcript, state, style);
          await sendTurn({ transcript, reply_text: reply, actions, state, meta: used });
          return;
        }
        messages.push({
          role: "assistant",
          content: typeof message.content === "string" ? message.content : "",
          tool_calls: calls,
        });
        for (const call of calls) {
          const name = call?.function?.name;
          let parsed = parseToolArguments(call?.function?.arguments);
          let outcome;
          if (parsed === null) {
            outcome = { status: "rejected", reason: "invalid_args", state };
          } else {
            outcome = await runTool(name, parsed);
            if (outcome.error) {
              const infra = infraFromStore(outcome);
              res.status(infra.status).json(infra.body);
              return;
            }
          }
          if (outcome.state) state = outcome.state;
          pushAction(name, parsed, outcome);
          messages.push({
            role: "tool",
            name: name || "tool",
            tool_call_id: call?.id || `call_${actions.length}`,
            content: JSON.stringify({
              status: outcome.status,
              reason: outcome.reason || null,
              state: outcome.state || state,
            search: outcome.search || undefined,
            sources: Array.isArray(outcome.search)
              ? outcome.search.map((hit) => `${hit.title}: ${hit.snippet} (${hit.url})`).join("\n")
              : undefined,
            weather: outcome.weather || undefined,
            grounded_text: outcome.grounded_text || undefined,
            devices: outcome.devices || undefined,
            routines: outcome.routines || undefined,
            }),
          });
        }
      }

      const finalTurn = await completeChat({ fetchImpl, env, messages, toolChoice: "none" });
      if (!finalTurn.error) {
        used = {
          provider: finalTurn.provider || used.provider,
          model: finalTurn.model || used.model,
          gemini_error: finalTurn.gemini_error || used.gemini_error,
        };
      }
      if (finalTurn.error) {
        await sendTurn({
          transcript,
          reply_text: replyText("", actions, transcript, state, style),
          actions,
          state,
          meta: used,
        });
        return;
      }
      await sendTurn({
        transcript,
        reply_text: replyText(visibleReply(finalTurn.message?.content), actions, transcript, state, style),
        actions,
        state,
        meta: used,
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
