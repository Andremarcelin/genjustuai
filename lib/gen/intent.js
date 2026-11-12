export const WARM_COLOR = "#FFAA00";
export const COOL_COLOR = "#00BFFF";
export const RED_COLOR = "#FF1A1A";
export const WARM_WHITE = "#FFF4E0";
export const BLUE_SWATCH = "#3B82F6";
export const PURPLE_COLOR = "#7C3AED";

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function colorFamily(color) {
  const match = /^#([0-9A-Fa-f]{6})$/.exec(String(color || ""));
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  if (red >= 160 && red > blue + 30) return "warm";
  if (blue >= 140 && blue > red + 40) return "cool";
  return null;
}

export function parseHouseIntent(transcript) {
  const text = normalize(transcript);
  const warmAt = text.search(/\bquent\w*\b|\baconchego\b|\bambar\b|\bdourad\w*\b/);
  const coolAt = text.search(/\bfri[ao]\w*\b|\bfresc\w*\b|\bazul\b|\bgelad\w*\b/);
  let color = null;
  if (warmAt >= 0 && (coolAt < 0 || warmAt <= coolAt)) color = "warm";
  else if (coolAt >= 0) color = "cool";

  let brightness = null;
  if (/\bbem quent|\bmais forte\b|\bbem forte\b|\bmais clar|\bacend|\bbrilho\b/.test(text)) brightness = "bright";
  else if (/\bmais baix|\bbem frac|\bmais escur|\bapag|\bfraquinh|\bsuave\b|\bluz baixa\b|\bbaixa\b/.test(text)) brightness = "dim";

  let preset = null;
  const presets = [
    ["bamboo", /\bbambu\b|\bbamboo\b/],
    ["rain", /\bchuva\b|\bchovendo\b|\brain\b/],
    ["quiet", /\bquiet\w*\b|\bsilencio\b/],
    ["night", /\bnoite\b|\bnoturn\w*\b/],
  ];
  let presetAt = -1;
  for (const [name, pattern] of presets) {
    const at = text.search(pattern);
    if (at >= 0 && (presetAt < 0 || at > presetAt)) {
      preset = name;
      presetAt = at;
    }
  }
  let media = null;
  if (/\b(para|parar|pause|pausar|stop)\b.*\b(musica|midia|video|tv|filme)\b|\bpara(r)? (a )?(musica|midia)\b/.test(text)) {
    media = { tool: "stop_media", args: {} };
  } else if (/\b(video|filme|documentario)\b/.test(text)) {
    media = { tool: "open_video", args: { query: mediaQuery(text, /(?:video|filme|documentario)\s*/ ) } };
  } else if (/\b(musica|toque|toca|play|playlist|jazz|lo-?fi|synthwave)\b/.test(text)) {
    media = { tool: "play_music", args: { query: mediaQuery(text, /(?:musica|toque|toca|play)\s*/ ) } };
  } else if (/\b(clima|tempo|previsao|temperatura|vai chover|preciso sair)\b/.test(text)) {
    const cityMatch = String(transcript || "").match(/\bem\s+([A-Za-zÀ-ÿ0-9.'\-\s]{2,48}?)(?:\s*[?.!]|$)/i);
    media = { tool: "get_weather", args: cityMatch ? { city: cityMatch[1].trim() } : {} };
  } else if (/\b(proximo jogo|proxima partida|quando (joga|jogam)|quem joga)\b/.test(text)
    || (/\bjogo\b/.test(text) && /\b(corinthians|palmeiras|santos|flamengo|sao paulo|noticia|hoje|agora)\b/.test(text))) {
    media = { tool: "web_search", args: { query: mediaQuery(text, /(?:pesquisa|pesquis)\s*/) } };
  } else if (/\b(pesquis|busca na internet|noticia|manchete|preco|cotacao|placar)\b/.test(text)) {
    media = { tool: "web_search", args: { query: mediaQuery(text, /(?:pesquisa|pesquis|busca na internet)\s*/ ) } };
  }

  let acTemp = null;
  const tempMatch = text.match(/\bno\s+(\d{2})\b|\ba\s+(\d{2})\s*(?:graus|c\b)?/);
  if (tempMatch) {
    const n = Number(tempMatch[1] || tempMatch[2]);
    if (n >= 16 && n <= 30) acTemp = n;
  }
  let fanVel = null;
  const velMatch = text.match(/\bno\s+([123])\b|\bvelocidade\s+([0123])\b/);
  if (velMatch) fanVel = Number(velMatch[1] || velMatch[2]);

  let device = null;
  const devices = [
    ["porta", /\bporta\b|\btranca\b|\bdestranca\b|\btrancar\b|\bdestrancar\b/],
    ["cafe", /\bcafe\b|\bcafeteira\b|\bcafezinho\b|\bfaz um cafe\b/],
    ["ventilador", /\bventilador\b|\bventoinha\b/],
    ["ar_condicionado", /\bar condicionado\b|\bar-condicionado\b|\bo ar\b|\bliga o ar\b|\bdesliga o ar\b/],
    ["sala_luz", /\bsala\b|\bluz da sala\b/],
    ["quarto_luz", /\bquarto\b|\bluz do quarto\b/],
    ["abajur", /\babajur\b/],
    ["fita_led", /\bfita\b|\bled\b/],
    ["tv", /\btv\b|\btelevis/],
    ["ambiente", /\bambiente\b/],
  ];
  for (const [id, pattern] of devices) {
    if (pattern.test(text)) {
      device = id;
      break;
    }
  }

  let hex = null;
  if (/\bvermelh/.test(text)) hex = RED_COLOR;
  else if (/\broxo\b|\blilas\b|\blilás\b/.test(text)) hex = PURPLE_COLOR;
  else if (/\bbranco quente\b|\bquente para relax/.test(text)) hex = WARM_WHITE;

  const acOff = /\bdesliga(r)? o ar\b/.test(text);
  const portaLock = /\btranca/.test(text) && !/\bdestranca/.test(text);
  const portaUnlock = /\bdestranca/.test(text);
  const portaOpen = /\babre( a porta)?|\babra a porta|\bvisita\b/.test(text) && device === "porta";
  const portaClose = /\bfecha( a porta)?|\bfecha/.test(text) && device === "porta";
  const cafeOff = device === "cafe" && /\bdesliga/.test(text);
  const fanOff = device === "ventilador" && (/\bdesliga/.test(text) || fanVel === 0);
  return {
    color, brightness, preset, device: media ? null : device, hex: media ? null : hex, media, acTemp, acOff,
    fanVel, portaLock, portaUnlock, portaOpen, portaClose, cafeOff, fanOff,
  };
}

function mediaQuery(text, strip) {
  const raw = String(text || "").replace(strip, " ").replace(/\b(na tv|por favor|pra mim)\b/g, " ").trim();
  return raw.slice(0, 80) || "creative commons";
}

function intensity(state) {
  const value = Number(state?.lights?.main?.intensity);
  return Number.isFinite(value) ? value : null;
}

export function aspectMatches(intent, state) {
  const missing = [];
  if (intent?.color && colorFamily(state?.lights?.main?.color) !== intent.color) missing.push("color");
  const level = intensity(state);
  if (intent?.brightness === "bright" && !(level >= 0.7)) missing.push("brightness");
  if (intent?.brightness === "dim" && !(level != null && level <= 0.35)) missing.push("brightness");
  if (intent?.preset && state?.ambience?.preset !== intent.preset) missing.push("preset");
  const asked = Boolean(intent?.color || intent?.brightness || intent?.preset);
  return { asked, matches: asked && missing.length === 0, missing };
}

function targetIntensity(intent, state) {
  if (intent.brightness === "bright") return 0.8;
  if (intent.brightness === "dim") return 0.25;
  const level = intensity(state);
  if (level == null) return intent.color === "cool" ? 0.45 : 0.8;
  return Math.min(1, Math.max(0, Math.round(level * 100) / 100));
}

function targetColor(intent, state) {
  if (intent.color === "warm") return WARM_COLOR;
  if (intent.color === "cool") return COOL_COLOR;
  const current = String(state?.lights?.main?.color || "").toUpperCase();
  return /^#[0-9A-F]{6}$/.test(current) ? current : WARM_COLOR;
}

export function plannedActions(intent, state) {
  if (intent?.media?.tool) {
    return [{ tool: intent.media.tool, args: intent.media.args || {} }];
  }
  if (intent?.device || intent?.hex) {
    const deviceId = intent.device || "sala_luz";
    if (deviceId === "ar_condicionado") {
      const current = state?.lights?.ar_condicionado || {};
      const args = { device_id: "ar_condicionado", on: intent.acOff ? false : true };
      if (intent.acTemp != null) args.temp = intent.acTemp;
      if (current.on === args.on && (args.temp == null || Number(current.temp) === args.temp)) return [];
      return [{ tool: "set_device", args }];
    }
    if (deviceId === "porta") {
      const current = state?.lights?.porta || {};
      const args = { device_id: "porta" };
      if (intent.portaLock) { args.trancada = true; args.aberta = false; }
      else if (intent.portaUnlock) args.trancada = false;
      else if (intent.portaOpen) { args.aberta = true; args.trancada = false; }
      else if (intent.portaClose) args.aberta = false;
      else { args.aberta = true; args.trancada = false; }
      if (current.aberta === args.aberta && (args.trancada == null || current.trancada === args.trancada)) return [];
      return [{ tool: "set_device", args }];
    }
    if (deviceId === "cafe") {
      const current = state?.lights?.cafe || {};
      const estado = intent.cafeOff ? "desligada" : "preparando";
      if (current.estado === estado) return [];
      return [{ tool: "set_device", args: { device_id: "cafe", estado } }];
    }
    if (deviceId === "ventilador") {
      const current = state?.lights?.ventilador || {};
      const vel = intent.fanOff ? 0 : (intent.fanVel != null ? intent.fanVel : (current.vel || 1));
      if (Number(current.vel) === vel) return [];
      return [{ tool: "set_device", args: { device_id: "ventilador", vel } }];
    }
    const current = state?.lights?.[deviceId] || {};
    const color = intent.hex || (intent.color === "warm" ? WARM_COLOR : intent.color === "cool" ? COOL_COLOR : String(current.color || RED_COLOR).toUpperCase());
    const on = intent.brightness === "dim" && !intent.hex ? false : true;
    const intensity = intent.brightness === "dim" ? 0.25 : intent.brightness === "bright" ? 0.85 : 0.85;
    const same = current.on === on
      && String(current.color || "").toUpperCase() === color
      && Number(current.intensity) === intensity;
    if (same) return [];
    return [{
      tool: "set_device",
      args: { device_id: deviceId, on, color, intensity },
    }];
  }
  const fit = aspectMatches(intent, state);
  if (!fit.asked || fit.matches) return [];
  const actions = [];
  if (fit.missing.includes("color") || fit.missing.includes("brightness")) {
    actions.push({
      tool: "set_lights",
      args: {
        zone: "main",
        intensity: targetIntensity(intent, state),
        color: targetColor(intent, state),
        transition_ms: 800,
      },
    });
  }
  if (fit.missing.includes("preset")) {
    const volume = Number(state?.ambience?.volume);
    actions.push({
      tool: "set_ambience",
      args: {
        preset: intent.preset,
        volume: Number.isFinite(volume) ? Math.min(0.5, Math.max(0, volume)) : 0.3,
        transition_ms: 1200,
      },
    });
  }
  return actions;
}

export function hasHex(text) {
  return /#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\b/.test(String(text || ""));
}

export function withoutHex(text) {
  return String(text || "").replace(/#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\b/g, (hex) => {
    const family = colorFamily(hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex);
    if (family === "warm") return "quente";
    if (family === "cool") return "azul";
    return "nessa cor";
  }).replace(/\s+/g, " ").trim();
}
