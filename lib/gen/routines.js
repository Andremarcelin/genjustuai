import { zonedClock, sameLocalSlot } from "./tz.js";

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
  const match = raw.match(/\b(?:as|a)\s+(\d{1,2})(?::(\d{2}))?\s*h?\b/)
    || raw.match(/\b(\d{1,2})h(\d{2})?\b/)
    || raw.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function parseDays(text) {
  const raw = fold(text);
  if (/todo dia|todos os dias|diariamente/.test(raw)) return [0, 1, 2, 3, 4, 5, 6];
  if (/dia de semana|semana/.test(raw) && !/fim/.test(raw)) return [1, 2, 3, 4, 5];
  const days = [];
  for (const [name, id] of Object.entries(DAY_NAMES)) {
    if (new RegExp(`\\b${name}\\b`).test(raw) && !days.includes(id)) days.push(id);
  }
  return days.length ? days.sort() : [0, 1, 2, 3, 4, 5, 6];
}

export function parseRoutineActions(text) {
  const raw = fold(text);
  const actions = [];
  if (/quarto/.test(raw) && /acend|liga|luz/.test(raw)) {
    actions.push({ tool: "set_device", args: { device_id: "quarto_luz", on: true, intensity: 0.7 } });
  }
  if (/sala/.test(raw) && /acend|liga|luz/.test(raw)) {
    actions.push({ tool: "set_device", args: { device_id: "sala_luz", on: true } });
  }
  if (/\bar\b|condicionado/.test(raw) && /liga|acend/.test(raw)) {
    actions.push({ tool: "set_device", args: { device_id: "ar_condicionado", on: true } });
  }
  if (/toca|musica|calmo|alarme|despert/.test(raw)) {
    const alarm = /alarme|despert/.test(raw);
    actions.push({
      tool: "play_music",
      args: { query: alarm ? "alarm bell" : "calm acoustic", mood: alarm ? "alarme" : "calmo" },
    });
  }
  if (/apag|desliga/.test(raw) && /quarto/.test(raw)) {
    actions.push({ tool: "set_device", args: { device_id: "quarto_luz", on: false } });
  }
  return actions;
}

export function parseRoutineRequest(text) {
  const clock = parseClock(text);
  if (!clock) return null;
  const actions = parseRoutineActions(text);
  if (!actions.length) return null;
  const name = String(text || "").trim().slice(0, 80) || "Rotina";
  return {
    name,
    schedule: { hour: clock.hour, minute: clock.minute, days: parseDays(text), tz: "America/Sao_Paulo" },
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
  if (clock.hour !== hour) return false;
  if (clock.minute < minute || clock.minute >= minute + 5) return false;
  if (routine.last_run_at && sameLocalSlot(zonedClock(routine.last_run_at, routine.schedule?.tz), clock)) {
    return false;
  }
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
  };
}
