export const SPEECH_FALLBACK_PITCH = 0.85;

function fold(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function isMaleVoiceName(value) {
  const name = fold(value);
  if (/\bportugues masculino\b/.test(name)) return true;
  if (/\bmasculino\b/.test(name)) return true;
  if (/\bmale\b/.test(name)) return true;
  return /\b(daniel|ricardo|antonio)\b/.test(name);
}

export function pickPtBrMaleVoice(voices) {
  const list = Array.isArray(voices) ? voices : [];
  return list.find((voice) => {
    const lang = String(voice?.lang || "").replace("_", "-");
    if (!/^pt\b/i.test(lang)) return false;
    return isMaleVoiceName(`${voice?.name || ""} ${voice?.voiceURI || ""}`);
  }) || null;
}
