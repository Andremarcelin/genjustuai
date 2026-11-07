export const WARM_COLOR = "#FFAA00";
export const COOL_COLOR = "#00BFFF";

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
  return { color, brightness, preset };
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
