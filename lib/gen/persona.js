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

export function buildSystemInstruction(session) {
  const name = sanitizeDisplayName(session?.display_name ?? session?.displayName);
  const rawProfile = session?.profile_id ?? session?.profileId;
  const profileId = Object.prototype.hasOwnProperty.call(PROFILES, rawProfile) ? rawProfile : "desconhecido";
  const archetype = PROFILES[profileId] || "desconhecido";
  return [
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
  ].join("\n");
}
