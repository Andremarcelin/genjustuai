// Persona do Corvo no Mochi + leitura da resposta JSON do modelo.

// Os 21 nomes do XiaoZhi aceitos pelo firmware (EMOCOES_api_mochi.md). O firmware também aceita
// palavras em português, mas pedimos os nomes em inglês para o modelo errar menos.
export const EMOTIONS = [
  "neutral", "happy", "laughing", "funny", "sad", "angry", "crying", "loving", "embarrassed",
  "surprised", "shocked", "thinking", "winking", "cool", "relaxed", "delicious", "kissy",
  "confident", "sleepy", "silly", "confused",
];

export function horaBrasilia(now = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(now);
}

export function mochiSystemPrompt({ now = new Date(), memory = "" } = {}) {
  return [
    "Você é o Corvo, a voz do GenJutsu morando dentro do Mochi: um bichinho de mesa com olhos num",
    "pequeno OLED. Você é um corvo esperto, curioso e carinhoso, com humor leve.",
    "Quem fala com você é o André, seu dono. Mochi é o seu corpo, não o nome dele.",
    "Fale em português do Brasil, em no máximo 2 frases curtas: sua resposta vira voz num alto-falante",
    "pequeno. Sem emoji, sem markdown, sem listas, sem links.",
    `Agora são ${horaBrasilia(now)} (horário de Brasília).`,
    "Responda SOMENTE com um objeto JSON, sem texto fora dele:",
    '{"text": "o que você vai falar", "emotion": "<uma de: ' + EMOTIONS.join(", ") + '>"}',
    "Se a pessoa pedir para ser lembrada de algo, acrescente o campo",
    '"alert": {"text": "texto curto sem emoji", "in_min": N}  (ou "at": "HH:MM" no horário de Brasília).',
    "Sem pedido de lembrete, não inclua alert.",
    memory ? `Memória (só contexto, não repita): ${memory}` : "",
  ].filter(Boolean).join("\n");
}

function cleanText(s, max) {
  return String(s || "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function normalizeAlert(a) {
  if (!a) return null;
  if (typeof a === "string") return cleanText(a, 80) ? { text: cleanText(a, 80) } : null;
  if (typeof a !== "object") return null;
  const text = cleanText(a.text, 80);
  if (!text) return null;
  const out = { text };
  const inMin = Number(a.in_min), inSec = Number(a.in_sec);
  if (Number.isFinite(inMin) && inMin > 0 && inMin <= 24 * 60) out.in_min = Math.round(inMin * 100) / 100;
  else if (Number.isFinite(inSec) && inSec > 0 && inSec <= 86400) out.in_sec = Math.round(inSec);
  else if (typeof a.at === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(a.at.trim())) out.at = a.at.trim();
  return out;
}

export function parseReply(raw) {
  let s = String(raw || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")
    .trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  let j = null;
  if (a >= 0 && b > a) {
    try { j = JSON.parse(s.slice(a, b + 1)); } catch { j = null; }
  }
  if (!j) return { text: cleanText(s, 300), emotion: "neutral", alert: null, parsed: false };
  const emotion = String(j.emotion || "").toLowerCase().trim();
  const al = Array.isArray(j.alert ?? j.reminder)
    ? (j.alert ?? j.reminder).map(normalizeAlert).filter(Boolean).slice(0, 4)
    : normalizeAlert(j.alert ?? j.reminder);
  return {
    text: cleanText(j.text, 300),
    emotion: EMOTIONS.includes(emotion) ? emotion : "neutral",
    alert: Array.isArray(al) ? (al.length ? al : null) : al,
    parsed: true,
  };
}

// Estilo da fala (speech_metadata.style do Gemini TTS) a partir da emoção.
const STYLE = {
  happy: "alegre e animado", laughing: "rindo, divertido", funny: "brincalhão", sad: "triste e baixinho",
  angry: "irritado, mas fofo", crying: "choroso", loving: "carinhoso e doce", embarrassed: "envergonhado",
  surprised: "surpreso", shocked: "assustado", thinking: "pensativo", winking: "maroto",
  cool: "confiante e descolado", relaxed: "calmo e tranquilo", delicious: "guloso e feliz",
  kissy: "carinhoso", confident: "confiante", sleepy: "sonolento, bocejando", silly: "bobinho e brincalhão",
  confused: "confuso",
};
export function speechStyle(emotion) {
  return `voz de bichinho fofo, rápido e natural; ${STYLE[emotion] || "simpático"}`;
}
