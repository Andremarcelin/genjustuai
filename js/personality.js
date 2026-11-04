(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuPersonality = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var HOUSES = {
    Z: { id: "Z", label: "Zen", vibe: "tranquilo", tempo: "frio", palette: "fria" },
    C: { id: "C", label: "Acolhedora", vibe: "tranquilo", tempo: "quente", palette: "quente" },
    E: { id: "E", label: "Elétrica", vibe: "agitado", tempo: "frio", palette: "fria" },
    A: { id: "A", label: "Ardente", vibe: "agitado", tempo: "quente", palette: "quente" }
  };

  function isGuest(user) {
    if (!user) return false;
    if (user.is_anonymous === true) return true;
    var provider = user.app_metadata && user.app_metadata.provider;
    if (provider === "anonymous") return true;
    if (user.user_metadata && user.user_metadata.guest === true) return true;
    var identities = user.identities;
    if (Array.isArray(identities) && identities.length === 1 && identities[0] && identities[0].provider === "anonymous") {
      return true;
    }
    return false;
  }

  function displayName(user, sessionCode) {
    if (isGuest(user)) {
      var code = String(sessionCode || "").trim();
      return code ? "Visitante " + code : "Visitante";
    }
    var meta = (user && user.user_metadata) || {};
    return meta.full_name || meta.name || "Visitante";
  }

  function emailFor(user) {
    if (!user || isGuest(user)) return "";
    return user.email || "";
  }

  function avatarFor(user) {
    if (!user || isGuest(user)) return "/assets/guest-avatar.jpg";
    var meta = user.user_metadata || {};
    return meta.avatar_url || "/assets/guest-avatar.jpg";
  }

  function formatArchetype(value) {
    var code = String(value || "").trim();
    var house = HOUSES[code];
    if (house) return house.id + " · " + house.label;
    return code || "Sessão";
  }

  function buildPersonality(user, dossier, sessionCode) {
    var data = dossier || {};
    var pref = data.preferencias || {};
    var guest = isGuest(user) || data.fonte === "convidado";
    var name = displayName(user, sessionCode);
    var house = HOUSES[pref.casa] || null;
    var vibe = pref.clima_ambiente === "agitado"
      ? "ritmo mais dinâmico"
      : pref.clima_ambiente === "tranquilo"
        ? "ambiente calmo"
        : "clima ainda indefinido";
    var tempo = pref.clima_tempo || "sem preferência de tempo";
    var text = name + " prefere " + vibe + " e " + tempo + ".";
    if (house) text += " Casa " + house.label + " (" + house.id + ").";
    if (!guest && data.fonte === "google") {
      var nCal = (data.calendar || []).length;
      var nYt = (data.youtube || []).length;
      var nTask = (data.tasks || []).length;
      text += " Nesta sessão há " + nCal + " evento(s) de agenda, " + nYt + " canal(is) do YouTube e " + nTask + " tarefa(s).";
    }
    text += " Este cartão é só o resumo; o dossiê completo fica na conta.";
    var archetype = "Perfil em formação";
    if (house) archetype = house.id;
    else if (pref.clima_ambiente === "tranquilo") archetype = "C";
    else if (pref.clima_ambiente === "agitado") archetype = "E";
    return { text: text, archetype: archetype, displayName: name };
  }

  return {
    HOUSES: HOUSES,
    isGuest: isGuest,
    displayName: displayName,
    emailFor: emailFor,
    avatarFor: avatarFor,
    formatArchetype: formatArchetype,
    buildPersonality: buildPersonality
  };
});
