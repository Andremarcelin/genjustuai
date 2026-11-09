export const DEVICE_LABELS = {
  sala_luz: "Luz da sala",
  quarto_luz: "Luz do quarto",
  abajur: "Abajur",
  fita_led: "Fita LED",
  tv: "TV",
  ambiente: "Ambiente",
  ar_condicionado: "Ar-condicionado",
};

export function truncateQuote(text, max = 72) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function argsOf(row) {
  const raw = row?.args;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? raw : {};
}

export function isRejectedCommand(row) {
  const status = String(row?.status || "").toLowerCase();
  return status === "rejected" || status === "denied" || status === "error";
}

function deviceValue(id, args) {
  if (id === "ar_condicionado") {
    if (args.on === false) return "desligado";
    const temp = Number(args.temp);
    if (Number.isFinite(temp)) return `${Math.round(temp)} °C`;
    return args.mode ? String(args.mode) : "ligado";
  }
  if (args.on === false) return "apagada";
  if (Number.isFinite(Number(args.intensity))) {
    return `${Math.round(Number(args.intensity) * 100)}%`;
  }
  if (args.on === true) return "acesa";
  if (args.color) return String(args.color);
  return "ajustado";
}

function applySetDevice(args, devices) {
  const id = args.device_id || args.id;
  if (!id || !DEVICE_LABELS[id]) return;
  devices[id] = deviceValue(id, args);
}

function applySetLights(args, devices) {
  const lights = args.lights && typeof args.lights === "object" ? args.lights : args;
  for (const [key, cell] of Object.entries(lights || {})) {
    if (!cell || typeof cell !== "object") continue;
    const id = key === "main" ? "sala_luz" : key === "lanterns" ? "quarto_luz" : key;
    if (!DEVICE_LABELS[id]) continue;
    devices[id] = deviceValue(id, cell);
  }
}

function musicLabel(args) {
  return truncateQuote(args.title || args.query || args.mood || args.artist || "música", 48);
}

function pushUnique(list, value, max) {
  const item = String(value || "").trim();
  if (!item) return;
  const i = list.indexOf(item);
  if (i >= 0) list.splice(i, 1);
  list.push(item);
  if (list.length > max) list.splice(0, list.length - max);
}

function formatDuration(firstAt, lastAt) {
  if (!firstAt || !lastAt) return "";
  const a = Date.parse(firstAt);
  const b = Date.parse(lastAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return "";
  const minutes = Math.round((b - a) / 60000);
  if (minutes < 1) return "alguns instantes";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function summarizeVisit({ history = [], commands = [], routines = [] } = {}) {
  const devices = {};
  const music = [];
  const routineNames = [];
  const quotes = [];
  const times = [];
  let transcriptTurns = 0;

  function stamp(row) {
    if (row?.created_at) times.push(String(row.created_at));
  }

  const events = [];
  for (const row of commands || []) {
    if (isRejectedCommand(row)) continue;
    events.push({ t: String(row.created_at || ""), kind: "command", row });
  }
  for (const row of history || []) {
    events.push({ t: String(row.created_at || ""), kind: "history", row });
  }
  for (const row of routines || []) {
    events.push({ t: String(row.created_at || ""), kind: "routine", row });
  }
  events.sort((a, b) => a.t.localeCompare(b.t));

  for (const event of events) {
    stamp(event.row);
    if (event.kind === "routine") {
      pushUnique(routineNames, event.row.name || event.row.title || "Rotina", 4);
      continue;
    }
    const tool = String(event.row.tool || "");
    const args = argsOf(event.row);
    if (event.kind === "history" && event.row.kind === "transcript") {
      transcriptTurns += 1;
      const role = String(event.row.role || "");
      if (role === "visitor" || role === "user") {
        const quote = truncateQuote(event.row.body);
        if (quote) pushUnique(quotes, quote, 3);
      }
      continue;
    }
    if (tool === "set_device") applySetDevice(args, devices);
    else if (tool === "set_lights") applySetLights(args, devices);
    else if (tool === "play_music") pushUnique(music, musicLabel(args), 3);
    else if (tool === "create_routine") {
      pushUnique(routineNames, args.name || args.title || "Rotina", 4);
    }
  }

  const firstAt = times.length ? times.reduce((a, b) => (a < b ? a : b)) : null;
  const lastAt = times.length ? times.reduce((a, b) => (a > b ? a : b)) : null;
  const empty = transcriptTurns === 0
    && Object.keys(devices).length === 0
    && music.length === 0
    && routineNames.length === 0;

  return {
    empty,
    conversations: transcriptTurns,
    quotes,
    devices: Object.entries(devices).map(([id, value]) => ({
      id,
      name: DEVICE_LABELS[id],
      value,
    })),
    music,
    routines: routineNames,
    firstAt,
    lastAt,
    durationLabel: formatDuration(firstAt, lastAt),
  };
}
