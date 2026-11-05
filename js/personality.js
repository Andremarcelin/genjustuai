(function (root, factory) {
  var api = factory(function () {
    if (root.GenjutsuZcea) return root.GenjutsuZcea;
    if (typeof require === "function") return require("./zcea-profile.js");
    return null;
  });
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuPersonality = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (loadZcea) {

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

  function resolvedProfile(pref) {
    var Z = loadZcea();
    var empty = { profile_id: null, letter: null, archetype: null };
    if (!Z) return empty;
    var resolved = Z.resolve(pref.clima_ambiente, pref.clima_tempo);
    if (resolved.profile_id) return resolved;
    var id = Z.sanitize(pref.profile_id);
    if (!id) return empty;
    var meta = Z.META[id];
    return { profile_id: id, letter: meta.letter, archetype: meta.archetype };
  }

  function formatArchetype(value) {
    var raw = String(value || "").trim();
    var Z = loadZcea();
    if (!raw) return "Sessão";
    if (!Z) return raw;
    var id = Z.sanitize(raw);
    if (id) return Z.label(id);
    var ids = Z.PROFILE_IDS;
    for (var i = 0; i < ids.length; i++) {
      var meta = Z.META[ids[i]];
      if (meta.archetype === raw || meta.letter === raw) return Z.label(ids[i]);
    }
    return raw;
  }

  function buildPersonality(user, dossier, sessionCode) {
    var data = dossier || {};
    var pref = data.preferencias || {};
    var guest = isGuest(user) || data.fonte === "convidado";
    var name = displayName(user, sessionCode);
    var profile = resolvedProfile(pref);
    var vibe = pref.clima_ambiente === "agitado"
      ? "ritmo mais dinâmico"
      : pref.clima_ambiente === "tranquilo"
        ? "ambiente calmo"
        : "clima ainda indefinido";
    var tempo = pref.clima_tempo || "sem preferência de tempo";
    var text = "";
    if (profile.profile_id) {
      text += name + " está no perfil " + profile.archetype + " (" + profile.letter + "). ";
    }
    text += name + " prefere " + vibe + " e " + tempo + ".";
    if (!guest && data.fonte === "google") {
      var nCal = (data.calendar || []).length;
      var nYt = (data.youtube || []).length;
      var nTask = (data.tasks || []).length;
      text += " Nesta sessão há " + nCal + " evento(s) de agenda, " + nYt + " canal(is) do YouTube e " + nTask + " tarefa(s).";
    }
    text += " Este cartão é só o resumo; o dossiê completo fica na conta.";
    return {
      text: text,
      archetype: profile.archetype || "Perfil em formação",
      displayName: name,
      profile_id: profile.profile_id,
      letter: profile.letter
    };
  }

  return {
    isGuest: isGuest,
    displayName: displayName,
    emailFor: emailFor,
    avatarFor: avatarFor,
    formatArchetype: formatArchetype,
    buildPersonality: buildPersonality
  };
});
