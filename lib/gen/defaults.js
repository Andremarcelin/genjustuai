import { normalizeLights } from "./devices.js";
import { isAllowedMediaUrl } from "./media.js";

export const DEFAULT_LIGHTS = {
  main: { intensity: 0.35, color: "#FF1A1A" },
  lanterns: { intensity: 0.2, color: "#FF1A1A" },
};

export const DEFAULT_AMBIENCE = {
  preset: "quiet",
  volume: 0.15,
};

export const STATE_KEYS = ["session_id", "version", "mode", "dojo", "lights", "ambience", "media", "updated_at"];

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function defaultHouseState(sessionId) {
  return {
    session_id: sessionId,
    version: 0,
    mode: "hub",
    dojo: null,
    lights: normalizeLights(DEFAULT_LIGHTS),
    ambience: clone(DEFAULT_AMBIENCE),
    media: null,
    updated_at: null,
  };
}

function publicMedia(media) {
  if (!media || typeof media !== "object") return null;
  if (!isAllowedMediaUrl(media.url)) return null;
  return {
    type: media.type === "video" ? "video" : "audio",
    url: media.url,
    title: String(media.title || "Mídia").slice(0, 160),
    artist: String(media.artist || "").slice(0, 120),
    license: String(media.license || "").slice(0, 80),
    device: media.device === "ambiente" ? "ambiente" : "tv",
    playing: media.playing !== false,
    updated_at: media.updated_at || null,
  };
}

export function toPublicState(row) {
  if (!row) return null;
  return {
    session_id: row.session_id,
    version: row.version,
    mode: row.mode,
    dojo: row.dojo ?? null,
    lights: normalizeLights(row.lights),
    ambience: row.ambience,
    media: publicMedia(row.media),
    updated_at: row.updated_at ?? null,
  };
}
