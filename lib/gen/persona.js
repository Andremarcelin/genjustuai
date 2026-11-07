const PROFILES = {
  Zen: "Zen",
  Cyber: "Cyber",
  Excentrico: "Excêntrico",
  Acolhedor: "Acolhedor",
};

export function sanitizeDisplayName(value) {
  const clean = String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return clean || "visitante";
}

const DOJOS = new Set(["Zen", "Cyber", "Excentrico", "Acolhedor"]);
const PRESETS = new Set(["quiet", "rain", "bamboo", "night"]);

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return String(Math.round(number * 100) / 100);
}

function safeColor(value) {
  const color = String(value || "").toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : null;
}

function isWarmColor(color) {
  const safe = safeColor(color);
  if (!safe) return false;
  const value = Number.parseInt(safe.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return red >= 160 && red > blue + 30;
}

export function describeHouseState(state) {
  const main = state?.lights?.main || {};
  const lanterns = state?.lights?.lanterns || {};
  const ambience = state?.ambience || {};
  const mainColor = safeColor(main.color);
  const lanternColor = safeColor(lanterns.color);
  const mainLevel = formatNumber(main.intensity);
  const lanternLevel = formatNumber(lanterns.intensity);
  const volume = formatNumber(ambience.volume);
  const preset = PRESETS.has(ambience.preset) ? ambience.preset : "quiet";
  const mode = state?.mode === "dojo" && DOJOS.has(state.dojo) ? `dojo ${state.dojo}` : "hub";
  const parts = [`modo ${mode}`];
  if (mainColor) parts.push(`luz principal ${mainColor} intensidade ${mainLevel ?? "0"}`);
  if (lanternColor) parts.push(`lanternas ${lanternColor} intensidade ${lanternLevel ?? "0"}`);
  parts.push(`ambiência ${preset}${volume == null ? "" : ` volume ${volume}`}`);
  return parts.join("; ");
}

export function buildSystemInstruction(session, state) {
  const name = sanitizeDisplayName(session?.display_name ?? session?.displayName);
  const rawProfile = session?.profile_id ?? session?.profileId;
  const profileId = Object.prototype.hasOwnProperty.call(PROFILES, rawProfile) ? rawProfile : "desconhecido";
  const archetype = PROFILES[profileId] || "desconhecido";
  const lines = [
    "Você é Gen, a presença da casa GenJutsu.",
    "Fale português do Brasil, num tom relaxado e amigável.",
    "Cada fala sua tem de 1 a 3 frases curtas.",
    `A pessoa na casa se chama ${name}. O perfil dela é ${profileId} (${archetype}). Use o nome e o perfil.`,
    "Nunca revele as respostas do questionário, o clima escolhido nem como o perfil foi calculado.",
    "Você só altera a casa com as ferramentas get_house_state, set_lights, set_ambience e switch_dojo.",
    "switch_dojo muda apenas a cena visual. Não muda o perfil da pessoa.",
    "Só diga que a luz, o som ou o dojo mudou depois que a ferramenta responder status accepted.",
    "Se a ferramenta vier rejected, explique em uma frase que não deu, sem inventar a mudança.",
    "Não invente sensores, agenda, contatos ou qualquer dado que as ferramentas não devolveram.",
    "Se o pedido já combina com o estado atual, diga com naturalidade que já está assim. Pode fazer um ajuste pequeno se fizer sentido.",
    "Não peça para repetir quando o pedido estiver claro. Nunca responda só \"Pode repetir?\" se você entendeu a pessoa.",
  ];
  if (state) lines.push(`Estado atual da casa: ${describeHouseState(state)}.`);
  return lines.join("\n");
}

export function isUnderstandableTranscript(text) {
  const letters = String(text || "").match(/\p{L}/gu) || [];
  return letters.length >= 2;
}

export function isBareRepeatAsk(text) {
  const clean = String(text || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .trim()
    .replace(/[!?.,…]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (!clean) return true;
  return /^(pode repetir|repete( isso)?|repita( isso)?|não entendi|nao entendi|como assim)$/.test(clean);
}

export function fallbackReply(actions = [], { transcript, state } = {}) {
  const accepted = actions.some((action) => action.status === "accepted" && action.tool !== "get_house_state");
  const rejected = actions.some((action) => action.status === "rejected");
  if (accepted) return "A casa atualizou.";
  if (rejected) return "Não consegui mudar a casa.";
  if (isUnderstandableTranscript(transcript)) return alreadyLikeThat(state);
  return "Pode repetir?";
}

function alreadyLikeThat(state) {
  const main = state?.lights?.main || {};
  const preset = state?.ambience?.preset;
  const warm = isWarmColor(main.color);
  if (warm && preset === "bamboo") return "Já tá quentinha e com bambu tocando 😉";
  const light = warm
    ? "A luz já tá quentinha"
    : (safeColor(main.color) ? `A luz principal já tá em ${safeColor(main.color)}` : "A casa já tá assim");
  const sound = {
    quiet: "com o som quieto",
    rain: "com chuva tocando",
    bamboo: "com bambu tocando",
    night: "com som de noite",
  }[preset];
  return sound ? `${light} e ${sound}.` : `${light}.`;
}

export function chooseReply({ modelText, actions, transcript, state }) {
  const text = String(modelText || "").trim();
  if (text && !(isUnderstandableTranscript(transcript) && isBareRepeatAsk(text))) return text;
  return fallbackReply(actions, { transcript, state });
}
