export const DEVICE_IDS = ["sala_luz", "quarto_luz", "abajur", "fita_led", "tv", "ambiente"];

export const DEVICE_META = {
  sala_luz: { id: "sala_luz", label: "Luz Sala", room: "Sala", kind: "light", alias: "main", overlay: "sala" },
  quarto_luz: { id: "quarto_luz", label: "Luz Quarto", room: "Quarto", kind: "light", alias: "lanterns", overlay: "quarto" },
  abajur: { id: "abajur", label: "Abajur", room: "Quarto", kind: "light", overlay: "quarto" },
  fita_led: { id: "fita_led", label: "Fita LED", room: "Sala", kind: "led", overlay: "sala" },
  tv: { id: "tv", label: "TV", room: "Sala", kind: "media", overlay: "sala" },
  ambiente: { id: "ambiente", label: "Ambiente", room: "Casa", kind: "ambience", overlay: "casa" },
};

export const COLOR_SWATCHES = [
  { id: "red", hex: "#FF1A1A", label: "Vermelho" },
  { id: "warm", hex: "#FFF4E0", label: "Branco quente" },
  { id: "blue", hex: "#3B82F6", label: "Azul" },
  { id: "purple", hex: "#7C3AED", label: "Roxo" },
];

const FALLBACK = { on: false, color: "#FF1A1A", intensity: 0.35 };

function clamp(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

export function safeHex(value, fallback = "#FF1A1A") {
  const color = String(value || "").toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : fallback;
}

export function deviceCell(raw, fallback = FALLBACK) {
  const intensity = clamp(raw?.intensity, fallback.intensity);
  const on = typeof raw?.on === "boolean"
    ? raw.on
    : (raw && (raw.intensity != null || raw.color) ? intensity > 0.02 : fallback.on);
  const cell = {
    on,
    color: safeHex(raw?.color, fallback.color),
    intensity,
  };
  const transition = Number(raw?.transition_ms);
  if (Number.isFinite(transition)) cell.transition_ms = Math.round(transition);
  return cell;
}

function zoneFromDevice(cell) {
  const zone = {
    intensity: cell.on ? cell.intensity : 0,
    color: cell.color,
  };
  if (cell.transition_ms != null) zone.transition_ms = cell.transition_ms;
  return zone;
}

export function normalizeLights(lights) {
  const src = lights && typeof lights === "object" && !Array.isArray(lights) ? lights : {};
  const sala = deviceCell(src.sala_luz || src.main, { on: true, color: "#FF1A1A", intensity: 0.35 });
  const quarto = deviceCell(src.quarto_luz || src.lanterns, { on: false, color: "#FF1A1A", intensity: 0.2 });
  const out = {
    main: zoneFromDevice(sala),
    lanterns: zoneFromDevice(quarto),
    sala_luz: sala,
    quarto_luz: quarto,
    abajur: deviceCell(src.abajur, { on: false, color: "#FFAA00", intensity: 0.45 }),
    fita_led: deviceCell(src.fita_led || {}, { on: false, color: "#7C3AED", intensity: 0.55 }),
    tv: deviceCell(src.tv || {}, { on: false, color: "#3B82F6", intensity: 0.7 }),
    ambiente: deviceCell(src.ambiente || {}, { on: false, color: "#FF1A1A", intensity: 0.3 }),
  };
  return out;
}

export function listPublicDevices(state) {
  const lights = normalizeLights(state?.lights);
  return DEVICE_IDS.map((id) => ({
    ...DEVICE_META[id],
    ...lights[id],
  }));
}

export function applyDevicePatch(state, args) {
  const lights = normalizeLights(state.lights);
  const id = args.device_id;
  const current = lights[id];
  const next = { ...current };
  if (typeof args.on === "boolean") next.on = args.on;
  if (args.color) next.color = safeHex(args.color, current.color);
  if (args.intensity != null) next.intensity = clamp(args.intensity, current.intensity);
  if (args.color && args.on === undefined) next.on = true;
  if (args.intensity != null && args.intensity > 0.02 && args.on === undefined) next.on = true;
  lights[id] = deviceCell(next, current);
  const synced = normalizeLights(lights);
  const ambience = { ...(state.ambience || {}) };
  if (id === "ambiente") {
    const volume = Number(ambience.volume);
    ambience.volume = synced.ambiente.on
      ? (Number.isFinite(volume) && volume > 0 ? Math.min(0.5, volume) : 0.15)
      : 0;
  }
  return { lights: synced, ambience };
}

export function syncAliasesFromZones(lights) {
  const src = lights && typeof lights === "object" ? lights : {};
  const patched = { ...src };
  if (src.main) patched.sala_luz = deviceCell({ ...src.sala_luz, ...src.main, on: clamp(src.main.intensity, 0) > 0.02 }, src.sala_luz);
  if (src.lanterns) patched.quarto_luz = deviceCell({ ...src.quarto_luz, ...src.lanterns, on: clamp(src.lanterns.intensity, 0) > 0.02 }, src.quarto_luz);
  return normalizeLights(patched);
}
