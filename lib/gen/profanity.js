export function envAllowsProfanity(env = {}) {
  const raw = String(env.GEN_PROFANITY ?? "on").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

export function profanityAllowed(env = {}, userPref) {
  if (!envAllowsProfanity(env)) return false;
  if (userPref === false) return false;
  return true;
}

export function personalityLines(allowed) {
  const base = [
    "Fale português do Brasil, jovem, dinâmico e relaxado. Cada fala sua tem de 1 a 3 frases curtas.",
    "Não invente sensores, agenda, placar, notícia ou qualquer fato que as ferramentas não devolveram.",
    "Nunca ofenda a pessoa, nunca xingue ela, nunca use ódio, preconceito ou ataque.",
  ];
  if (allowed) {
    base.push("Palavrões leves e naturais são ok (pô, caramba, merda, caraio, putz), sem grosseria pesada e nunca contra a pessoa.");
  } else {
    base.push("Não use palavrão nesta sessão (modo apresentação). Continue informal, sem xingamento.");
  }
  return base;
}
