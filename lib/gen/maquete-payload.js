import { normalizeLights } from "./devices.js";

export const DEFAULT_MQTT_TOPIC = "genjutsu/maquete/estado";
export const MAQUETE_BRIGHTNESS_MAX = 255;

const PRESET_EFFECT = {
  quiet: "fixo",
  rain: "pulsar",
  bamboo: "time",
  night: "arcoiris",
};

const TEAM_COLORS = ["#FF1A1A", "#3B82F6"];

function clampByte(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(MAQUETE_BRIGHTNESS_MAX, Math.max(0, Math.round(number)));
}

function intensityToByte(intensity, fallback = 0) {
  const number = Number(intensity);
  if (!Number.isFinite(number)) return fallback;
  return clampByte(number * MAQUETE_BRIGHTNESS_MAX);
}

function roomFromCell(cell, fallbackColor = "#FF1A1A") {
  const on = Boolean(cell?.on);
  const color = String(cell?.color || fallbackColor).toUpperCase();
  const brilho = on ? intensityToByte(cell?.intensity, 89) : 0;
  return {
    on,
    cor: /^#[0-9A-F]{6}$/.test(color) ? color : fallbackColor,
    brilho,
  };
}

function fitaEffect(state, lights) {
  const dojo = String(state?.dojo || state?.mode || "");
  if (/cyber/i.test(dojo) && lights.fita_led?.on) return "arcoiris";
  if (/excentrico/i.test(dojo) && lights.fita_led?.on) return "time";
  const preset = String(state?.ambience?.preset || "quiet").toLowerCase();
  return PRESET_EFFECT[preset] || "fixo";
}

function fitaColors(lights, effect) {
  const own = String(lights.fita_led?.color || "#7C3AED").toUpperCase();
  if (effect === "time") {
    const sala = String(lights.sala_luz?.color || TEAM_COLORS[0]).toUpperCase();
    const quarto = String(lights.quarto_luz?.color || lights.abajur?.color || TEAM_COLORS[1]).toUpperCase();
    return [sala, quarto];
  }
  if (effect === "arcoiris") return [own, "#00FF88", "#3B82F6"];
  return [own];
}

function arModo(ac) {
  if (!ac?.on) return "normal";
  const fan = String(ac.fan || "");
  const temp = Number(ac.temp);
  if (fan === "3" || (Number.isFinite(temp) && temp <= 18)) return "forte";
  return "normal";
}

function tvOn(state, lights) {
  if (lights.tv?.on) return true;
  const media = state?.media;
  return Boolean(media && media.playing !== false && media.device !== "ambiente");
}

function quartoCell(lights) {
  if (lights.quarto_luz?.on) return lights.quarto_luz;
  if (lights.abajur?.on) return lights.abajur;
  return lights.quarto_luz;
}

/**
 * Compact MQTT payload for the physical maquete.
 *
 * Mapping (house_state → JSON):
 * - version / session: house_state.version / session_id
 * - sala: lights.sala_luz (alias lights.main)
 * - quarto: lights.quarto_luz (alias lanterns); if off, lights.abajur when on
 * - fita: lights.fita_led; efeito from ambience.preset
 *     quiet→fixo, rain→pulsar, bamboo→time, night→arcoiris
 *     dojo Cyber→arcoiris, Excentrico→time (when fita on)
 * - tv: lights.tv.on or media playing on tv
 * - ar: lights.ar_condicionado; modo forte if fan=3 or temp≤18, else normal
 * - brilho: intensity 0..1 scaled to 0..255
 */
export function houseStateToMaquetePayload(state) {
  const lights = normalizeLights(state?.lights);
  const effect = fitaEffect(state, lights);
  const session = String(state?.session_id || "").toUpperCase();
  const version = Number.isFinite(Number(state?.version)) ? Math.max(0, Math.round(Number(state.version))) : 0;
  const fitaOn = Boolean(lights.fita_led?.on);
  return {
    version,
    session,
    sala: roomFromCell(lights.sala_luz),
    quarto: roomFromCell(quartoCell(lights)),
    fita: {
      on: fitaOn,
      efeito: effect,
      cores: fitaColors(lights, effect),
      brilho: fitaOn ? intensityToByte(lights.fita_led?.intensity, 140) : 0,
    },
    tv: { on: tvOn(state, lights) },
    ar: {
      on: Boolean(lights.ar_condicionado?.on),
      modo: arModo(lights.ar_condicionado),
    },
  };
}
