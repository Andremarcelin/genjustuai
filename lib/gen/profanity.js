import { styleLines } from "./style.js";

export function envAllowsProfanity(env = {}) {
  const raw = String(env.GEN_PROFANITY ?? "on").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

export function profanityAllowed(env = {}, userPref) {
  if (!envAllowsProfanity(env)) return false;
  if (userPref === false) return false;
  return true;
}

export function personalityLines(allowed, style = "comum") {
  return styleLines(style, allowed);
}
