export const DEVICE_LABELS = {
  sala_luz: "Luz da sala",
  quarto_luz: "Luz do quarto",
  abajur: "Abajur",
  fita_led: "Fita LED",
  tv: "TV",
  ambiente: "Ambiente",
  ar_condicionado: "Ar-condicionado",
  porta: "Porta",
  cafe: "Cafeteira",
  ventilador: "Ventilador",
};

const LIGHT_IDS = new Set(["sala_luz", "quarto_luz", "abajur", "fita_led", "ambiente"]);

const THEMES = [
  { id: "clima", label: "clima", re: /clima|tempo|chuva|frio|calor|tabo[aã]o|serra|weather/i },
  { id: "futebol", label: "futebol", re: /jogo|futebol|corinthians|time|gol|campeonato/i },
  { id: "musica", label: "música", re: /m[uú]sica|toca|rock|som|alarme|playlist/i },
  { id: "luz", label: "luz", re: /luz|acende|apaga|abajur|led|escuro|claro/i },
];

const PROFILE_LABEL = {
  Zen: "Zen",
  Cyber: "Cyber",
  Excentrico: "Excêntrico",
  Acolhedor: "Acolhedor",
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
  if (id === "porta") {
    if (args.trancada) return "trancada";
    if (args.aberta === false) return "fechada";
    if (args.aberta) return "aberta";
    return "ajustada";
  }
  if (id === "cafe") return String(args.estado || (args.on === false ? "desligada" : "preparando"));
  if (id === "ventilador") {
    const vel = Number(args.vel);
    if (Number.isFinite(vel)) return vel === 0 ? "desligado" : `vel ${vel}`;
    return args.on === false ? "desligado" : "ligado";
  }
  if (args.on === false) return "apagada";
  if (Number.isFinite(Number(args.intensity))) {
    return `${Math.round(Number(args.intensity) * 100)}%`;
  }
  if (args.on === true) return "acesa";
  if (args.color) return String(args.color);
  return "ajustado";
}

function bumpDevice(devices, id, args) {
  if (!id || !DEVICE_LABELS[id]) return;
  const prev = devices[id] || { id, name: DEVICE_LABELS[id], changes: 0, value: "" };
  prev.changes += 1;
  prev.value = deviceValue(id, args || {});
  devices[id] = prev;
}

function applySetLights(args, devices, lightLevels) {
  const lights = args.lights && typeof args.lights === "object" ? args.lights : args;
  for (const [key, cell] of Object.entries(lights || {})) {
    if (!cell || typeof cell !== "object") continue;
    const id = key === "main" ? "sala_luz" : key === "lanterns" ? "quarto_luz" : key;
    bumpDevice(devices, id, cell);
    noteLight(id, cell, lightLevels);
  }
}

function noteLight(id, args, lightLevels) {
  if (!LIGHT_IDS.has(id) || args?.on === false) return;
  const n = Number(args?.intensity);
  if (Number.isFinite(n)) lightLevels.push(n);
}

function noteAc(args, acTemps, acCool) {
  if (args?.on === false) return;
  const temp = Number(args?.temp);
  if (!Number.isFinite(temp)) return;
  acTemps.push(temp);
  if (temp <= 22) acCool.count += 1;
  acCool.total += 1;
}

function musicLabel(args) {
  return truncateQuote(args.title || args.query || args.mood || args.artist || "música", 48);
}

function videoLabel(args) {
  return truncateQuote(args.title || args.query || "vídeo", 48);
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

export function formatClock(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(t));
}

function routineWhen(args, createdAt) {
  const hour = Number(args?.hour);
  const minute = Number(args?.minute) || 0;
  if (Number.isFinite(hour)) {
    return minute ? `às ${hour}h${String(minute).padStart(2, "0")}` : `às ${hour}h`;
  }
  const clock = formatClock(createdAt);
  return clock ? `às ${clock}` : "";
}

function avg(list) {
  if (!list.length) return null;
  return Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10;
}

function channelOf(row, fallback) {
  const source = String(row?.source || fallback || "").toLowerCase();
  if (source === "quest" || source === "voice") return "quest";
  if (source === "house") return "house";
  if (source === "chat") return "chat";
  return fallback || "chat";
}

function themeHits(texts) {
  const counts = {};
  for (const theme of THEMES) counts[theme.id] = 0;
  for (const text of texts) {
    for (const theme of THEMES) {
      if (theme.re.test(text)) counts[theme.id] += 1;
    }
  }
  return THEMES
    .map((theme) => ({ ...theme, n: counts[theme.id] }))
    .filter((theme) => theme.n > 0)
    .sort((a, b) => b.n - a.n);
}

export function buildInsights(stats, profileId) {
  const insights = [];
  const profile = PROFILE_LABEL[profileId] ? profileId : "";

  if (stats.acCool.total >= 3 && stats.acCool.count / stats.acCool.total >= 0.6) {
    insights.push({
      text: "Prefere ambiente fresco.",
      basis: `ar em ≤ 22 °C em ${stats.acCool.count} de ${stats.acCool.total} ajustes`,
    });
  } else if (stats.acTemps.length >= 3 && avg(stats.acTemps) >= 24) {
    insights.push({
      text: "Prefere o ar mais ameno.",
      basis: `média de ${Math.round(avg(stats.acTemps))} °C em ${stats.acTemps.length} ajustes`,
    });
  }

  const meanLight = avg(stats.lightLevels);
  if (meanLight != null && stats.lightLevels.length >= 2) {
    if (meanLight <= 0.4) {
      insights.push({
        text: "Prefere luz baixa.",
        basis: `média de ${Math.round(meanLight * 100)}% em ${stats.lightLevels.length} ajustes de luz`,
      });
    } else if (meanLight >= 0.7) {
      insights.push({
        text: "Prefere a casa bem iluminada.",
        basis: `média de ${Math.round(meanLight * 100)}% em ${stats.lightLevels.length} ajustes de luz`,
      });
    }
  }

  const { chat, quest, house } = stats.channels;
  const channelTotal = chat + quest + house;
  if (channelTotal >= 4) {
    if (quest >= chat && quest >= house && quest >= 3) {
      insights.push({
        text: "Fala mais pela voz no Quest do que pelo chat.",
        basis: `${quest} no Quest · ${chat} no chat · ${house} nos botões`,
      });
    } else if (house >= chat && house >= quest && house >= 4) {
      insights.push({
        text: "Mexe na casa pelos botões, mais do que conversando.",
        basis: `${house} nos botões · ${chat} no chat · ${quest} no Quest`,
      });
    } else if (chat >= quest && chat >= house && chat >= 4) {
      insights.push({
        text: "Conversa mais pelo chat do site.",
        basis: `${chat} falas no chat · ${quest} no Quest · ${house} nos botões`,
      });
    }
  }

  const themes = stats.themes.slice(0, 2);
  if (themes.length && themes[0].n >= 2) {
    const names = themes.map((t) => t.label).join(" e ");
    insights.push({
      text: `Os temas da conversa giram em torno de ${names}.`,
      basis: themes.map((t) => `${t.label} ${t.n}×`).join(" · "),
    });
  }

  if (stats.routineCount >= 1) {
    insights.push({
      text: "É orientado a rotina: pediu à Gen para repetir ações.",
      basis: `${stats.routineCount} rotina${stats.routineCount > 1 ? "s" : ""} criada${stats.routineCount > 1 ? "s" : ""}`,
    });
  }

  const scores = {
    Zen: (stats.acCool.count >= 2 ? 2 : 0) + (meanLight != null && meanLight <= 0.45 ? 2 : 0) + (stats.musicCount === 0 ? 1 : 0),
    Cyber: (stats.commandTotal >= 8 ? 2 : 0) + (stats.mostUsed?.changes >= 5 ? 2 : 0) + (stats.questions.length ? 1 : 0),
    Excentrico: (stats.musicCount ? 2 : 0) + (meanLight != null && meanLight >= 0.7 ? 2 : 0) + (stats.videos.length ? 1 : 0),
    Acolhedor: (stats.routineCount ? 2 : 0) + (themes.some((t) => t.id === "clima") ? 1 : 0),
  };
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const named = PROFILE_LABEL[profile];
  if (named && top[1] >= 2) {
    if (top[0] === profile) {
      const extra = profile === "Zen"
        ? "o ar fresco e a casa mais quieta"
        : profile === "Cyber"
          ? "os muitos ajustes finos na casa"
          : profile === "Excentrico"
            ? "luz alta, cor e música"
            : "cuidar do horário e das rotinas";
      insights.push({
        text: `Seu perfil ${named} combina com ${extra}.`,
        basis: `perfil ${named} + o que você fez nesta sessão`,
      });
    } else if (scores[profile] + 1 < top[1]) {
      insights.push({
        text: `Você agiu mais como ${PROFILE_LABEL[top[0]]} do que seu perfil ${named} indicava.`,
        basis: `perfil ${named}, mas o uso puxou para ${PROFILE_LABEL[top[0]]}`,
      });
    }
  }

  const seen = new Set();
  return insights.filter((item) => {
    if (seen.has(item.text)) return false;
    seen.add(item.text);
    return true;
  }).slice(0, 4);
}

export function summarizeVisit({ history = [], commands = [], routines = [], profileId = "" } = {}) {
  const devices = {};
  const music = [];
  const videos = [];
  const questions = [];
  const dojos = [];
  const routineList = [];
  const quotes = [];
  const visitorTexts = [];
  const times = [];
  const acTemps = [];
  const lightLevels = [];
  const acCool = { count: 0, total: 0 };
  const channels = { chat: 0, quest: 0, house: 0 };
  let transcriptTurns = 0;
  let commandTotal = 0;
  let chatActions = 0;

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
  const hasCommands = events.some((event) => event.kind === "command");

  for (const event of events) {
    stamp(event.row);
    const args = argsOf(event.row);
    const tool = String(event.row.tool || "");

    if (event.kind === "routine") {
      const name = String(event.row.name || event.row.title || "Rotina").trim() || "Rotina";
      if (!routineList.some((r) => r.name === name)) {
        routineList.push({ name, when: routineWhen({}, event.row.created_at) });
      }
      continue;
    }

    if (event.kind === "command") {
      commandTotal += 1;
      channels.house += 1;
    }

    if (event.kind === "history") {
      const ch = channelOf(event.row, "chat");
      if (event.row.kind === "transcript") {
        transcriptTurns += 1;
        if (ch === "quest") channels.quest += 1;
        else channels.chat += 1;
        const role = String(event.row.role || "");
        if (role === "visitor" || role === "user") {
          const body = String(event.row.body || "");
          visitorTexts.push(body);
          const quote = truncateQuote(body);
          if (quote) pushUnique(quotes, quote, 3);
        }
        continue;
      }
      if (event.row.kind === "action") {
        if (ch === "quest") channels.quest += 1;
        else if (ch === "house") {
          if (!hasCommands) channels.house += 1;
          const houseTool = tool === "set_device" || tool === "set_lights" || tool === "play_music";
          if (hasCommands && houseTool) continue;
        } else {
          channels.chat += 1;
          chatActions += 1;
        }
      }
    }

    if (tool === "set_device") {
      const id = args.device_id || args.id;
      bumpDevice(devices, id, args);
      if (id === "ar_condicionado") noteAc(args, acTemps, acCool);
      else noteLight(id, args, lightLevels);
    } else if (tool === "set_lights") {
      applySetLights(args, devices, lightLevels);
    } else if (tool === "play_music") {
      pushUnique(music, musicLabel(args), 4);
    } else if (tool === "open_video") {
      pushUnique(videos, videoLabel(args), 4);
    } else if (tool === "create_routine") {
      const name = String(args.name || args.title || "Rotina").trim() || "Rotina";
      if (!routineList.some((r) => r.name === name)) {
        routineList.push({ name, when: routineWhen(args, event.row.created_at) });
      }
    } else if (tool === "get_weather") {
      pushUnique(questions, truncateQuote(`clima em ${args.city || args.place || "sua cidade"}`, 56), 4);
    } else if (tool === "web_search") {
      pushUnique(questions, truncateQuote(args.query || args.q || "busca na web", 56), 4);
    } else if (tool === "switch_dojo") {
      const dojo = args.dojo || args.house || args.id;
      if (dojo) pushUnique(dojos, String(dojo), 4);
    }
  }

  commandTotal += chatActions;
  const firstAt = times.length ? times.reduce((a, b) => (a < b ? a : b)) : null;
  const lastAt = times.length ? times.reduce((a, b) => (a > b ? a : b)) : null;
  const deviceList = Object.values(devices);
  const mostUsed = deviceList.slice().sort((a, b) => b.changes - a.changes)[0] || null;
  const meanAc = avg(acTemps);
  const meanLight = avg(lightLevels);
  const themes = themeHits(visitorTexts);
  const empty = transcriptTurns === 0
    && deviceList.length === 0
    && music.length === 0
    && videos.length === 0
    && routineList.length === 0
    && questions.length === 0;

  const stats = {
    channels,
    acTemps,
    acCool,
    lightLevels,
    themes,
    routineCount: routineList.length,
    commandTotal,
    mostUsed,
    musicCount: music.length,
    videos,
    questions,
  };

  return {
    empty,
    conversations: transcriptTurns,
    quotes,
    channels,
    commandTotal,
    devices: deviceList,
    mostUsed: mostUsed ? { id: mostUsed.id, name: mostUsed.name, changes: mostUsed.changes } : null,
    averageAc: meanAc == null ? null : `${Math.round(meanAc)} °C`,
    averageLight: meanLight == null ? null : `${Math.round(meanLight * 100)}%`,
    music,
    videos,
    routines: routineList.slice(0, 4),
    questions,
    dojos,
    firstAt,
    lastAt,
    firstLabel: formatClock(firstAt),
    lastLabel: formatClock(lastAt),
    durationLabel: formatDuration(firstAt, lastAt),
    insights: empty ? [] : buildInsights(stats, profileId),
  };
}
