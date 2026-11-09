import { supabaseRest } from "../supabase-rest.cjs";
import { parseClock } from "./routines.js";
import { pad2, zonedClock } from "./tz.js";

const WEEK = {
  domingo: 0, dom: 0,
  segunda: 1, seg: 1,
  terca: 2, ter: 2, "terça": 2,
  quarta: 3, qua: 3,
  quinta: 4, qui: 4,
  sexta: 5, sex: 5,
  sabado: 6, sab: 6, "sábado": 6,
};

const WEEK_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const TEAM_COLORS = {
  corinthians: { dark: "#111111", light: "#F5F5F5" },
  santos: { dark: "#111111", light: "#F5F5F5" },
};

function fold(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function clipTurns(turns) {
  return (Array.isArray(turns) ? turns : []).slice(-10);
}

export function isGameTimeRequest(text) {
  const raw = fold(text);
  return /\bna hora do jogo\b|\bquando (o )?jogo\b|\bpro jogo\b|\bdurante o jogo\b|\bna hora (do|da) (partida|jogo)\b/.test(raw);
}

export function isMatchQuestion(text) {
  const raw = fold(text);
  return /\b(proximo jogo|proxima partida|quando (joga|jogam)|quem joga)\b/.test(raw)
    || (/\bjogo\b/.test(raw) && /\b(corinthians|palmeiras|santos|flamengo|sao paulo)\b/.test(raw));
}

export function teamFromText(text) {
  const raw = fold(text);
  if (/\bcorinthians\b|\btimao\b/.test(raw)) return "Corinthians";
  if (/\bpalmeiras\b/.test(raw)) return "Palmeiras";
  if (/\bsantos\b/.test(raw)) return "Santos";
  if (/\bflamengo\b/.test(raw)) return "Flamengo";
  if (/\bsao paulo\b/.test(raw)) return "São Paulo";
  return "";
}

export function teamColors(team) {
  const key = fold(team);
  return TEAM_COLORS[key] || { dark: "#111111", light: "#F5F5F5" };
}

function looksLikeMatch(text) {
  const raw = fold(text);
  return isMatchQuestion(text)
    || /\b(proximo jogo|proxima partida|brasileirao|arena|vs\.?)\b/.test(raw)
    || /\sx\s/.test(raw)
    || (/\b(jogo|joga|jogam|partida)\b/.test(raw) && /\b(corinthians|palmeiras|santos|flamengo|sao paulo|botafogo)\b/.test(raw));
}

function kickoffIso({ weekday, hour, minute }, now = new Date()) {
  if (hour == null || !Number.isFinite(Number(hour))) return "";
  const h = Number(hour);
  const m = Number(minute) || 0;
  const z = zonedClock(now);
  let year = z.year;
  let month = z.month;
  let day = z.day;
  const candidate = () => new Date(`${year}-${pad2(month)}-${pad2(day)}T${pad2(h)}:${pad2(m)}:00-03:00`);
  let stamp = candidate();
  if (weekday == null) {
    const local = zonedClock(stamp);
    if (local.hour > z.hour || (local.hour === z.hour && local.minute < z.minute && sameCalendar(local, z))) {
      /* still today */
    }
    if (stamp.getTime() < new Date(now).getTime()) {
      stamp = new Date(stamp.getTime() + 24 * 60 * 60 * 1000);
    }
    return stamp.toISOString();
  }
  for (let i = 0; i < 14; i += 1) {
    stamp = candidate();
    const local = zonedClock(stamp);
    if (local.weekday === weekday && stamp.getTime() >= new Date(now).getTime() - 60 * 1000) {
      return stamp.toISOString();
    }
    const next = new Date(stamp.getTime() + 24 * 60 * 60 * 1000);
    const n = zonedClock(next);
    year = n.year;
    month = n.month;
    day = n.day;
  }
  return candidate().toISOString();
}

function sameCalendar(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function parseMatchFact(text, now = new Date()) {
  if (!looksLikeMatch(text)) return null;
  const raw = fold(text);
  const clock = parseClock(text);
  let weekday = null;
  for (const [name, id] of Object.entries(WEEK)) {
    if (new RegExp(`\\b${fold(name)}\\b`).test(raw)) {
      weekday = id;
      break;
    }
  }
  const dated = String(text || "").match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  let opponent = "";
  const vs = String(text || "").match(/\b(?:contra|x|vs\.?)\s+(?:o|a)?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,30})/i);
  if (vs) opponent = vs[1].replace(/\s+(no|em|às|as|hoje|amanhã|quarta|terça|segunda|quinta|sexta|sábado|domingo).*$/i, "").trim();
  const team = teamFromText(text);
  if (clock == null && weekday == null && !opponent && !dated) return null;
  const clockNow = zonedClock(now);
  const hour = clock ? clock.hour : null;
  const minute = clock ? clock.minute : 0;
  const fact = {
    kind: "match",
    event: opponent ? `${team || "time"} x ${opponent}` : `jogo ${team || ""}`.trim(),
    team: team || "time",
    opponent: opponent || "",
    weekday: weekday == null ? null : weekday,
    hour,
    minute,
    tz: "America/Sao_Paulo",
    weekdayName: weekday == null ? "" : WEEK_PT[weekday],
    asOfDay: `${clockNow.year}-${clockNow.month}-${clockNow.day}`,
    datetime: "",
  };
  if (dated) {
    const d = Number(dated[1]);
    const mo = Number(dated[2]);
    const y = dated[3] ? Number(dated[3]) : clockNow.year;
    if (hour != null) {
      fact.datetime = new Date(`${y}-${pad2(mo)}-${pad2(d)}T${pad2(hour)}:${pad2(minute)}:00-03:00`).toISOString();
      const local = zonedClock(fact.datetime);
      fact.weekday = local.weekday;
      fact.weekdayName = WEEK_PT[local.weekday];
    }
  } else if (hour != null) {
    fact.datetime = kickoffIso(fact, now);
  }
  return fact;
}

export function hasKickoff(fact) {
  if (!fact || fact.kind !== "match") return false;
  const team = fold(fact.team || "");
  if (!team || team === "time") return false;
  if (!fact.datetime) return false;
  return fact.hour != null && Number.isFinite(Number(fact.hour));
}

export function gameRoutineFromFact(fact) {
  const colors = teamColors(fact.team);
  const fromIso = fact.datetime ? zonedClock(fact.datetime) : null;
  const hour = fromIso ? fromIso.hour : Number(fact.hour);
  const minute = fromIso ? fromIso.minute : (Number(fact.minute) || 0);
  const days = fact.weekday == null
    ? [fromIso ? fromIso.weekday : zonedClock(new Date()).weekday]
    : [fact.weekday];
  return {
    name: fact.opponent ? `Jogo ${fact.team} x ${fact.opponent}` : `Jogo do ${fact.team}`,
    hour,
    minute,
    days,
    once: true,
    actions: [
      { tool: "set_device", args: { device_id: "ar_condicionado", on: true, temp: 20, mode: "frio" } },
      { tool: "set_device", args: { device_id: "sala_luz", on: true, color: colors.dark, intensity: 0.55 } },
      { tool: "set_device", args: { device_id: "fita_led", on: true, color: colors.light, intensity: 0.9 } },
    ],
  };
}

export function formatMatchWhen(fact) {
  const hour = Number(fact.hour);
  const minute = Number(fact.minute) || 0;
  const clock = minute ? `${hour}h${String(minute).padStart(2, "0")}` : `${hour}h`;
  const day = fact.weekdayName || (fact.weekday != null ? WEEK_PT[fact.weekday] : "");
  return day ? `${day} às ${clock}` : `às ${clock}`;
}

export function confirmGameRoutine(fact) {
  const when = formatMatchWhen(fact);
  return `Fechado: ${when} eu ligo o ar em 20 °C e deixo a sala preto e branco pro jogo.`;
}

export function missingKickoffReply() {
  return "Não achei o horário do jogo. Me fala que horas começa?";
}

function memoryLines(turns, facts) {
  const lines = [];
  if (facts?.match) {
    const match = facts.match;
    const bits = [`evento ${match.event || `jogo ${match.team || ""}`.trim()}`];
    if (match.opponent) bits.push(`contra ${match.opponent}`);
    if (hasKickoff(match)) bits.push(formatMatchWhen(match));
    if (match.datetime) bits.push(`kickoff ISO ${match.datetime}`);
    lines.push(`Fato da sessão (só use este horário de jogo, nunca o de outras rotinas): ${bits.join(", ")}.`);
  }
  for (const turn of clipTurns(turns)) {
    const who = turn.role === "gen" ? "Gen" : "Pessoa";
    lines.push(`${who}: ${String(turn.body || "").slice(0, 240)}`);
  }
  return lines.join("\n").slice(0, 1800);
}

export function createMemorySessionStore() {
  const bySession = new Map();
  return {
    async load(sessionId) {
      const row = bySession.get(sessionId) || { turns: [], facts: {} };
      return { turns: clipTurns(row.turns), facts: row.facts || {}, text: memoryLines(row.turns, row.facts) };
    },
    async remember(sessionId, { transcript, reply, fact }) {
      const row = bySession.get(sessionId) || { turns: [], facts: {} };
      if (transcript) row.turns.push({ role: "visitor", body: transcript });
      if (reply) row.turns.push({ role: "gen", body: reply });
      row.turns = clipTurns(row.turns);
      if (fact?.kind === "match") row.facts = { ...row.facts, match: fact };
      bySession.set(sessionId, row);
      return this.load(sessionId);
    },
  };
}

export function createSessionMemoryStore() {
  const local = createMemorySessionStore();
  async function persist(sessionId, snapshot) {
    try {
      const payload = {
        session_id: sessionId,
        turns: snapshot.turns,
        facts: snapshot.facts,
        updated_at: new Date().toISOString(),
      };
      const result = await supabaseRest("house_session_memory", {
        method: "POST",
        serviceRoleOnly: true,
        raw: true,
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
      });
      if (result.ok) return;
      await supabaseRest(
        `house_session_memory?session_id=eq.${encodeURIComponent(sessionId)}`,
        {
          method: "PATCH",
          serviceRoleOnly: true,
          raw: true,
          body: JSON.stringify({ turns: snapshot.turns, facts: snapshot.facts, updated_at: payload.updated_at }),
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        }
      );
    } catch {
      /* memória local continua valendo */
    }
  }
  return {
    async load(sessionId) {
      const cached = await local.load(sessionId);
      if (cached.turns.length || cached.facts?.match) return cached;
      try {
        const found = await supabaseRest(
          `house_session_memory?session_id=eq.${encodeURIComponent(sessionId)}&select=turns,facts`,
          { serviceRoleOnly: true, raw: true }
        );
        if (!found.ok) return cached;
        const row = Array.isArray(found.json) ? found.json[0] : found.json;
        if (!row) return cached;
        const turns = clipTurns(row.turns);
        const facts = row.facts && typeof row.facts === "object" ? row.facts : {};
        await local.remember(sessionId, {});
        const box = await local.load(sessionId);
        box.turns.splice(0, box.turns.length, ...turns);
        Object.assign(box.facts, facts);
        return { turns, facts, text: memoryLines(turns, facts) };
      } catch {
        return cached;
      }
    },
    async remember(sessionId, entry) {
      const snapshot = await local.remember(sessionId, entry);
      persist(sessionId, snapshot);
      return snapshot;
    },
  };
}
