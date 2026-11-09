export const AC_ID = "ar_condicionado";
export const AC_MODES = ["frio", "ventilar", "seco"];
export const AC_FANS = ["auto", "1", "2", "3"];
export const AC_TEMP_MIN = 16;
export const AC_TEMP_MAX = 30;
export const AC_COLOR = "#7DD3FC";

export function clampTemp(value, fallback = 22) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(AC_TEMP_MAX, Math.max(AC_TEMP_MIN, Math.round(n)));
}

export function sanitizeMode(value, fallback = "frio") {
  const mode = String(value || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (mode === "frio" || mode === "cool") return "frio";
  if (mode === "ventilar" || mode === "fan" || mode === "vento") return "ventilar";
  if (mode === "seco" || mode === "dry") return "seco";
  return fallback;
}

export function sanitizeFan(value, fallback = "auto") {
  const fan = String(value || "").toLowerCase();
  if (AC_FANS.includes(fan)) return fan;
  if (fan === "0") return "auto";
  return fallback;
}

export function defaultAc() {
  return { on: false, temp: 22, mode: "frio", fan: "auto", color: AC_COLOR, intensity: 0.35 };
}

export function acCell(raw, fallback = defaultAc()) {
  const base = fallback || defaultAc();
  const on = typeof raw?.on === "boolean" ? raw.on : base.on;
  return {
    on,
    temp: clampTemp(raw?.temp, base.temp),
    mode: sanitizeMode(raw?.mode, base.mode),
    fan: sanitizeFan(raw?.fan, base.fan),
    color: AC_COLOR,
    intensity: on ? 0.45 : 0.15,
  };
}

export function applyAcPatch(current, args) {
  const next = { ...acCell(current) };
  if (typeof args.on === "boolean") next.on = args.on;
  if (args.temp != null) next.temp = clampTemp(args.temp, next.temp);
  if (args.mode) next.mode = sanitizeMode(args.mode, next.mode);
  if (args.fan != null) next.fan = sanitizeFan(args.fan, next.fan);
  if (args.temp != null && args.on === undefined) next.on = true;
  if (args.mode && args.on === undefined) next.on = true;
  return acCell(next);
}
