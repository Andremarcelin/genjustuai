// Perfil da demo Unity: Z / C / E / A.
// Não são os 8 arquétipos do CDD. Hipótese determinística para validar:
//   tranquilo + frio            → Zen
//   tranquilo + quente | ameno  → Acolhedor
//   agitado   + frio | ameno    → Cyber
//   agitado   + quente          → Excentrico
// profile_id é o id estável (sem acento). archetype é o alias legível.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GenjutsuZcea = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PROFILE_IDS = ["Zen", "Cyber", "Excentrico", "Acolhedor"];
  const META = {
    Zen: { letter: "Z", archetype: "Zen" },
    Cyber: { letter: "C", archetype: "Cyber" },
    Excentrico: { letter: "E", archetype: "Excêntrico" },
    Acolhedor: { letter: "A", archetype: "Acolhedor" },
  };
  const MAP = {
    "tranquilo|frio": "Zen",
    "tranquilo|quente": "Acolhedor",
    "tranquilo|ameno": "Acolhedor",
    "agitado|frio": "Cyber",
    "agitado|quente": "Excentrico",
    "agitado|ameno": "Cyber",
  };

  function sanitize(value) {
    return PROFILE_IDS.indexOf(value) !== -1 ? value : null;
  }

  function resolve(climaAmbiente, climaTempo) {
    const key = String(climaAmbiente || "") + "|" + String(climaTempo || "");
    const id = MAP[key] || null;
    if (!id) return { profile_id: null, letter: null, archetype: null };
    const meta = META[id];
    return { profile_id: id, letter: meta.letter, archetype: meta.archetype };
  }

  function label(profileId) {
    const id = sanitize(profileId);
    if (!id) return "";
    const meta = META[id];
    return meta.letter + " · " + meta.archetype;
  }

  return { PROFILE_IDS: PROFILE_IDS, META: META, MAP: MAP, sanitize: sanitize, resolve: resolve, label: label };
});
