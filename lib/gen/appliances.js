export const PORTA_ID = "porta";
export const CAFE_ID = "cafe";
export const VENTILADOR_ID = "ventilador";
export const APPLIANCE_IDS = [PORTA_ID, CAFE_ID, VENTILADOR_ID];

export const CAFE_STATES = ["desligada", "preparando", "pronta"];
export const CAFE_BREW_MS = 60_000;
export const FAN_SPEEDS = [0, 1, 2, 3];
export const FAN_DUTY = { 0: 0, 1: 40, 2: 70, 3: 100 };

const PORTA_COLOR = "#8B5A2B";
const CAFE_COLOR = "#FF8C00";
const FAN_COLOR = "#94A3B8";

export function defaultPorta() {
  return { on: false, aberta: false, trancada: true, color: PORTA_COLOR, intensity: 0.2 };
}

export function defaultCafe() {
  return { on: false, estado: "desligada", ready_at: null, color: CAFE_COLOR, intensity: 0.2 };
}

export function defaultVentilador() {
  return { on: false, vel: 0, color: FAN_COLOR, intensity: 0.15 };
}

export function asBool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function portaCell(raw, fallback = defaultPorta()) {
  const base = fallback || defaultPorta();
  let aberta = asBool(raw?.aberta, base.aberta);
  let trancada = asBool(raw?.trancada, base.trancada);
  if (typeof raw?.on === "boolean" && raw.aberta === undefined) aberta = raw.on;
  if (aberta) trancada = false;
  if (trancada) aberta = false;
  return {
    on: aberta,
    aberta,
    trancada,
    color: PORTA_COLOR,
    intensity: aberta ? 0.55 : trancada ? 0.25 : 0.35,
  };
}

export function applyPortaPatch(current, args) {
  const next = { ...portaCell(current) };
  if (typeof args.aberta === "boolean") next.aberta = args.aberta;
  if (typeof args.trancada === "boolean") next.trancada = args.trancada;
  if (typeof args.on === "boolean" && args.aberta === undefined) next.aberta = args.on;
  if (next.aberta) next.trancada = false;
  if (next.trancada) next.aberta = false;
  return portaCell(next);
}

export function sanitizeCafeEstado(value, fallback = "desligada") {
  const raw = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (raw === "desligada" || raw === "off" || raw === "desliga") return "desligada";
  if (raw === "preparando" || raw === "fazendo" || raw === "brew") return "preparando";
  if (raw === "pronta" || raw === "pronto" || raw === "ready") return "pronta";
  return fallback;
}

export function cafeCell(raw, fallback = defaultCafe(), now = Date.now()) {
  const base = fallback || defaultCafe();
  let estado = sanitizeCafeEstado(raw?.estado, base.estado);
  let readyAt = raw?.ready_at ?? raw?.readyAt ?? base.ready_at ?? null;
  if (estado === "preparando" && readyAt) {
    const due = Date.parse(readyAt);
    if (Number.isFinite(due) && now >= due) {
      estado = "pronta";
      readyAt = null;
    }
  }
  if (estado !== "preparando") readyAt = null;
  const on = estado !== "desligada";
  return {
    on,
    estado,
    ready_at: readyAt,
    color: CAFE_COLOR,
    intensity: estado === "preparando" ? 0.7 : estado === "pronta" ? 0.9 : 0.15,
  };
}

export function applyCafePatch(current, args, now = Date.now()) {
  const next = { ...cafeCell(current, defaultCafe(), now) };
  if (args.estado) next.estado = sanitizeCafeEstado(args.estado, next.estado);
  else if (typeof args.on === "boolean") next.estado = args.on ? "preparando" : "desligada";
  if (next.estado === "preparando") {
    const already = current?.estado === "preparando" && current?.ready_at;
    next.ready_at = already ? current.ready_at : new Date(now + CAFE_BREW_MS).toISOString();
  } else {
    next.ready_at = null;
  }
  return cafeCell(next, defaultCafe(), now);
}

export function clampFanVel(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (FAN_SPEEDS.includes(rounded)) return rounded;
  return Math.min(3, Math.max(0, rounded));
}

export function ventiladorCell(raw, fallback = defaultVentilador()) {
  const base = fallback || defaultVentilador();
  let vel = clampFanVel(raw?.vel ?? raw?.speed, base.vel);
  if (typeof raw?.on === "boolean" && raw.vel === undefined && raw.speed === undefined) {
    vel = raw.on ? (vel || 1) : 0;
  }
  return {
    on: vel > 0,
    vel,
    color: FAN_COLOR,
    intensity: vel === 0 ? 0.1 : vel / 3,
  };
}

export function applyVentiladorPatch(current, args) {
  const next = { ...ventiladorCell(current) };
  if (args.vel != null) next.vel = clampFanVel(args.vel, next.vel);
  if (typeof args.on === "boolean" && args.vel === undefined) next.vel = args.on ? (next.vel || 1) : 0;
  return ventiladorCell(next);
}

export function isApplianceId(id) {
  return APPLIANCE_IDS.includes(id);
}

export function applyAppliancePatch(id, current, args, now = Date.now()) {
  if (id === PORTA_ID) return applyPortaPatch(current, args);
  if (id === CAFE_ID) return applyCafePatch(current, args, now);
  if (id === VENTILADOR_ID) return applyVentiladorPatch(current, args);
  return current;
}
