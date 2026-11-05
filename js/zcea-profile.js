// Perfil da demo Unity: Z / C / E / A.
// Não são os 8 arquétipos do CDD. Hipótese determinística para validar:
//   tranquilo + frio            → Zen
//   tranquilo + quente | ameno  → Acolhedor
//   agitado   + frio | ameno    → Cyber
//   agitado   + quente          → Excentrico
// profile_id é o id estável (sem acento). archetype é o alias legível.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuZcea = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var PROFILE_IDS = ["Zen", "Cyber", "Excentrico", "Acolhedor"];
  var META = {
    Zen: { letter: "Z", archetype: "Zen" },
    Cyber: { letter: "C", archetype: "Cyber" },
    Excentrico: { letter: "E", archetype: "Excêntrico" },
    Acolhedor: { letter: "A", archetype: "Acolhedor" }
  };
  var MAP = {
    "tranquilo|frio": "Zen",
    "tranquilo|quente": "Acolhedor",
    "tranquilo|ameno": "Acolhedor",
    "agitado|frio": "Cyber",
    "agitado|ameno": "Cyber",
    "agitado|quente": "Excentrico"
  };

  function sanitize(value) {
    return PROFILE_IDS.indexOf(value) !== -1 ? value : null;
  }

  function resolve(climaAmbiente, climaTempo) {
    var key = String(climaAmbiente || "") + "|" + String(climaTempo || "");
    var id = MAP[key] || null;
    if (!id) return { profile_id: null, letter: null, archetype: null };
    var meta = META[id];
    return { profile_id: id, letter: meta.letter, archetype: meta.archetype };
  }

  function label(profileId) {
    var id = sanitize(profileId);
    if (!id) return "";
    var meta = META[id];
    return meta.letter + " · " + meta.archetype;
  }

  return { PROFILE_IDS: PROFILE_IDS, META: META, MAP: MAP, sanitize: sanitize, resolve: resolve, label: label };
});
