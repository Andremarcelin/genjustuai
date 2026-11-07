export const DEFAULT_VOICE_NAME = "Charon";

export function resolveVoiceName(env = process.env) {
  const raw = String(env?.GEN_VOICE_NAME || "").trim();
  if (/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(raw)) return raw;
  return DEFAULT_VOICE_NAME;
}
