export const GEN_STYLES = ["comum", "ironica", "zen"];

export const STYLE_VOICES = {
  comum: "Charon",
  ironica: "Fenrir",
  zen: "Kore",
};

const ALIAS = {
  comum: "comum",
  normal: "comum",
  padrao: "comum",
  padrão: "comum",
  default: "comum",
  ironica: "ironica",
  irônica: "ironica",
  ironico: "ironica",
  irônico: "ironica",
  sarcastic: "ironica",
  zen: "zen",
  calma: "zen",
  calmo: "zen",
};

export function normalizeGenStyle(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (ALIAS[String(value || "").trim().toLowerCase()]) {
    return ALIAS[String(value || "").trim().toLowerCase()];
  }
  if (ALIAS[raw]) return ALIAS[raw];
  if (GEN_STYLES.includes(raw)) return raw;
  return "comum";
}

export function parseStyleRequest(text) {
  const raw = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const named = /\b(ironica|ironico|zen|comum|normal)\b/.test(raw);
  const intent = /\b(personalidade|tom|estilo|modo)\b/.test(raw)
    || /\bmuda pra\b|\bmuda para\b|\bvira pra\b/.test(raw)
    || /\bgen,?\s+(muda|vira|fica|usa|troca)\b/.test(raw)
    || (/\b(muda|troca|vira|usa|fica|coloca)\b/.test(raw) && named);
  if (!intent) return "";
  if (/\bironic/.test(raw)) return "ironica";
  if (/\bzen\b/.test(raw) && !/\bcorinthians|jogo|luz\b/.test(raw)) return "zen";
  if (/\bcomum\b|\bnormal\b|\bpadrao\b/.test(raw)) return "comum";
  return "";
}

export function voiceForStyle(style, env = {}) {
  const id = normalizeGenStyle(style);
  if (id === "comum") {
    const raw = String(env?.GEN_VOICE_NAME || "").trim();
    if (/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(raw)) return raw;
  }
  return STYLE_VOICES[id] || STYLE_VOICES.comum;
}

export function styleAllowsSwearing(style, allowed) {
  if (!allowed) return false;
  if (normalizeGenStyle(style) === "zen") return false;
  return true;
}

export function styleLines(style, swearAllowed) {
  const id = normalizeGenStyle(style);
  const canSwear = styleAllowsSwearing(id, swearAllowed);
  if (id === "ironica") {
    const swear = canSwear
      ? "Palavrões pesados e naturais são ok (caralho, porra, merda, puta que pariu), sem grosseria contra a pessoa."
      : "Não use palavrão nesta sessão (modo apresentação). Continue irônica, sem xingamento.";
    return [
      "Fale português do Brasil, irônico, sarcástico e esperto. Cada fala sua tem de 1 a 3 frases.",
      "Seja afiada e engraçada, nunca cruel. Continue útil e precisa.",
      "Não invente sensores, agenda, placar, notícia ou qualquer fato que as ferramentas não devolveram.",
      "Nunca ofenda a pessoa, nunca xingue ela, nunca use ódio, preconceito ou ataque. Não rebaixe ninguém.",
      swear,
    ];
  }
  if (id === "zen") {
    return [
      "Fale português do Brasil, calmo, curto e um pouco poético. Cada fala sua tem 1 ou 2 frases.",
      "Não invente sensores, agenda, placar, notícia ou qualquer fato que as ferramentas não devolveram.",
      "Nunca ofenda a pessoa, nunca xingue ela, nunca use ódio, preconceito ou ataque.",
      "Não use palavrão. Silêncio e clareza valem mais que volume.",
    ];
  }
  const base = [
    "Fale português do Brasil, jovem, dinâmico e relaxado. Cada fala sua tem de 1 a 3 frases curtas.",
    "Não invente sensores, agenda, placar, notícia ou qualquer fato que as ferramentas não devolveram.",
    "Nunca ofenda a pessoa, nunca xingue ela, nunca use ódio, preconceito ou ataque.",
  ];
  if (canSwear) {
    base.push("Palavrões leves e naturais são ok (pô, caramba, merda, caraio, putz), sem grosseria pesada e nunca contra a pessoa.");
  } else {
    base.push("Não use palavrão nesta sessão (modo apresentação). Continue informal, sem xingamento.");
  }
  return base;
}

export function stylePhrase(style, { voicePending } = {}) {
  const id = normalizeGenStyle(style);
  const label = id === "ironica" ? "irônico" : id === "zen" ? "zen" : "comum";
  const reconnect = voicePending
    ? " Na voz, isso vale quando a sessão Live reconectar."
    : "";
  if (id === "zen") return `Tom zen. Falo baixo e curto daqui pra frente.${reconnect}`.trim();
  if (id === "ironica") return `Beleza. Tom irônico ligado.${reconnect}`.trim();
  return `Voltei pro tom ${label}.${reconnect}`.trim();
}

export function fallbackByStyle(style, kind) {
  const id = normalizeGenStyle(style);
  if (kind === "retry") {
    if (id === "zen") return "Tento de novo, com calma.";
    if (id === "ironica") return "Não rolou. Tento de novo.";
    return "Vou tentar de novo.";
  }
  if (kind === "rejected") {
    if (id === "zen") return "A casa não mudou. Respiro e tento outra vez.";
    if (id === "ironica") return "Não consegui mudar a casa. Que ótimo.";
    return "Não consegui mudar a casa. Vou tentar de novo.";
  }
  if (kind === "repeat") {
    if (id === "zen") return "Pode falar de novo, sem pressa.";
    return "Pode repetir?";
  }
  return "";
}
