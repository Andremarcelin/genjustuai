import { zonedClock, sameLocalDay } from "./tz.js";

const DAY_NAMES = {
  domingo: 0, dom: 0, sunday: 0,
  segunda: 1, seg: 1,
  terca: 2, ter: 2,
  quarta: 3, qua: 3,
  quinta: 4, qui: 4,
  sexta: 5, sex: 5,
  sabado: 6, sab: 6,
};

function fold(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function parseClock(text) {
  const raw = fold(text);
  const match = raw.match(/\b(\d{1,2})h(\d{2})\b/)
    || raw.match(/\b(?:as|a|ate)\s+(\d{1,2})(?::(\d{2}))?\s*h?\b/)
    || raw.match(/\b(\d{1,2})h\b/)
    || raw.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function parseDays(text, now = new Date()) {
  const raw = fold(text);
  if (/todo dia|todos os dias|diariamente/.test(raw)) return [0, 1, 2, 3, 4, 5, 6];
  if (/dias uteis|dia util|uteis|dia de semana/.test(raw) || (/\bsemana\b/.test(raw) && !/fim/.test(raw))) {
    return [1, 2, 3, 4, 5];
  }
  const days = [];
  for (const [name, id] of Object.entries(DAY_NAMES)) {
    if (new RegExp(`\\b${name}\\b`).test(raw) && !days.includes(id)) days.push(id);
  }
  if (days.length) return days.sort();
  const clock = zonedClock(now);
  if (/amanha/.test(raw)) return [(clock.weekday + 1) % 7];
  if (/hoje|uma vez/.test(raw)) return [clock.weekday];
  return [0, 1, 2, 3, 4, 5, 6];
}

export function isOneShotRoutine(text) {
  const raw = fold(text);
  if (/todo dia|todos os dias|diariamente|dias uteis|dia util/.test(raw)) return false;
  if (/amanha|hoje|uma vez/.test(raw)) return true;
  if (/lembr/.test(raw)) return true;
  return false;
}

function alarmActions() {
  return [
    { tool: "play_music", args: { query: "alarm bell", mood: "alarme" } },
    { tool: "set_device", args: { device_id: "quarto_luz", on: true, intensity: 0.7 } },
    { tool: "set_device", args: { device_id: "sala_luz", on: true } },
  ];
}

export function parseRoutineActions(text) {
  const raw = fold(text);
  const actions = [];
  const wake = /\bacorda|\bacordar|\balarme|\bdespert|\bme lembra|\blembr(a|e|ar)\b/.test(raw);
  if (/quarto/.test(raw) && /acend|liga|luz/.test(raw)) {
    actions.push({ tool: "set_device", args: { device_id: "quarto_luz", on: true, intensity: 0.7 } });
  }
  if (/sala/.test(raw) && /acend|liga|luz/.test(raw)) {
    actions.push({ tool: "set_device", args: { device_id: "sala_luz", on: true } });
  }
  if (/\bar\b|condicionado/.test(raw) && /liga|acend/.test(raw)) {
    actions.push({ tool: "set_device", args: { device_id: "ar_condicionado", on: true } });
  }
  if (wake) {
    for (const action of alarmActions()) {
      const exists = actions.some((item) => item.tool === action.tool
        && item.args?.device_id === action.args?.device_id
        && item.args?.mood === action.args?.mood);
      if (!exists) actions.push(action);
    }
  } else if (/toca|musica|calmo/.test(raw)) {
    actions.push({
      tool: "play_music",
      args: { query: "calm acoustic", mood: "calmo" },
    });
  }
  if (/apag|desliga/.test(raw) && /quarto/.test(raw)) {
    actions.push({ tool: "set_device", args: { device_id: "quarto_luz", on: false } });
  }
  return actions;
}

export function parseRoutineRequest(text, now = new Date()) {
  const clock = parseClock(text);
  if (!clock) return null;
  const actions = parseRoutineActions(text);
  if (!actions.length) return null;
  const name = String(text || "").trim().slice(0, 80) || "Rotina";
  const once = isOneShotRoutine(text);
  return {
    name,
    schedule: {
      hour: clock.hour,
      minute: clock.minute,
      days: parseDays(text, now),
      tz: "America/Sao_Paulo",
      once,
    },
    actions,
    enabled: true,
    created_by: "user",
  };
}

export function isRoutineDue(routine, now = new Date()) {
  if (!routine || routine.enabled === false) return false;
  const clock = zonedClock(now, routine.schedule?.tz || "America/Sao_Paulo");
  const days = Array.isArray(routine.schedule?.days) ? routine.schedule.days : [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(clock.weekday)) return false;
  const hour = Number(routine.schedule?.hour);
  const minute = Number(routine.schedule?.minute) || 0;
  const passed = clock.hour > hour || (clock.hour === hour && clock.minute >= minute);
  if (!passed) return false;
  if (routine.last_run_at && sameLocalDay(zonedClock(routine.last_run_at, routine.schedule?.tz), clock)) {
    return false;
  }
  if (routine.schedule?.once && routine.last_run_at) return false;
  return true;
}

function bucketKey(entry) {
  const args = entry.args || {};
  const id = args.device_id || args.zone || entry.tool;
  const on = args.on === false ? "off" : "on";
  const clock = zonedClock(entry.created_at || Date.now());
  return `${entry.tool}:${id}:${on}:${clock.hour}`;
}

export function detectRoutinePatterns(commands, now = new Date()) {
  const groups = new Map();
  for (const entry of commands || []) {
    if (entry.status !== "accepted") continue;
    if (entry.tool !== "set_device" && entry.tool !== "play_music") continue;
    const key = bucketKey(entry);
    const clock = zonedClock(entry.created_at || now);
    const day = `${clock.year}-${clock.month}-${clock.day}`;
    const group = groups.get(key) || { key, days: new Set(), sample: entry, hour: clock.hour };
    group.days.add(day);
    groups.set(key, group);
  }
  const out = [];
  for (const group of groups.values()) {
    if (group.days.size < 3) continue;
    const args = group.sample.args || {};
    const device = args.device_id || "sala_luz";
    out.push({
      name: `Sempre às ${String(group.hour).padStart(2, "0")}h`,
      schedule: { hour: group.hour, minute: 0, days: [0, 1, 2, 3, 4, 5, 6], tz: "America/Sao_Paulo" },
      actions: [{ tool: group.sample.tool, args }],
      enabled: false,
      created_by: "gen_suggestion",
      hint: `Quer virar rotina? ${device} por volta das ${group.hour}h em ${group.days.size} dias.`,
    });
  }
  return out;
}

export function publicRoutine(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    schedule: row.schedule,
    actions: row.actions,
    enabled: row.enabled !== false,
    created_by: row.created_by || "user",
    hint: row.hint || null,
    last_run_at: row.last_run_at || null,
    session_id: row.session_id || null,
  };
}
