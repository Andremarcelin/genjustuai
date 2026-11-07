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

  function visitorAlias(sessionCode) {
    var code = String(sessionCode || "").trim();
    return code ? "Visitante " + code : "Visitante";
  }

  function isAlias(value) {
    return /^Visitante(\s|$)/.test(String(value || "").trim());
  }

  function explicitName(user) {
    var meta = (user && user.user_metadata) || {};
    var named = String(meta.full_name || meta.name || "").trim();
    if (!named || isAlias(named)) return "";
    return named;
  }

  function displayName(user, sessionCode) {
    var named = explicitName(user);
    if (named) return named;
    if (isGuest(user)) return visitorAlias(sessionCode);
    var meta = (user && user.user_metadata) || {};
    return String(meta.full_name || meta.name || "").trim() || "Visitante";
  }

  function resolvedDisplayName(user, dossier, sessionCode) {
    if (user && !isGuest(user)) {
      var account = explicitName(user);
      if (account) return account;
    }
    var fromDossier = String((dossier && dossier.nome_exibicao) || "").trim();
    if (fromDossier && !isAlias(fromDossier)) return fromDossier;
    return displayName(user, sessionCode);
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
    var prefs = pref || {};
    var resolved = Z.resolve(prefs);
    if (resolved.profile_id) return resolved;
    var id = Z.sanitize(prefs.profile_id);
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

  var PHRASE = {
    Zen: "{name}, o dia abre em água parada. A casa pede silêncio e frescor: respire devagar, que o que é seu chega sem alarde.",
    Cyber: "{name}, um pulso elétrico atravessa o cômodo. Hoje a casa pensa rápido com você — foco frio, gesto preciso, nada de espera.",
    Excentrico: "{name}, o calor sobe e a casa perde a compostura. Hoje vale o gesto ousado: cor demais, riso alto, um caminho que só você inventa.",
    Acolhedor: "{name}, o aconchego já guardou um lugar. Hoje a casa aquece quem fica: ofereça presença, e o calor volta em dobro."
  };

  function profileIdFrom(value) {
    var Z = loadZcea();
    var raw = String(value || "").trim();
    if (!raw || !Z) return null;
    var id = Z.sanitize(raw);
    if (id) return id;
    var ids = Z.PROFILE_IDS;
    for (var i = 0; i < ids.length; i++) {
      var meta = Z.META[ids[i]];
      if (meta.archetype === raw || meta.letter === raw) return ids[i];
    }
    return null;
  }

  function phraseFor(profileId, name) {
    var id = profileIdFrom(profileId);
    if (!id || !PHRASE[id]) return "";
    var who = String(name || "").trim() || "Visitante";
    return PHRASE[id].split("{name}").join(who);
  }

  function answerText(field, value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    var Z = loadZcea();
    var nice = Z && typeof Z.optionLabel === "function" ? Z.optionLabel(field, raw) : "";
    return nice ? nice + " (" + raw + ")" : raw;
  }

  function countText(value) {
    if (value === 0 || value) return String(value);
    return "";
  }

  function sessionFields(source) {
    var src = source || {};
    var pref = src.preferencias || {};
    var rows = [
      ["Nome", src.display_name || ""]
    ];
    var Z = loadZcea();
    if (Z && Z.QUESTIONS) {
      Z.QUESTIONS.forEach(function (question) {
        rows.push([question.prompt, answerText(question.id, pref[question.id])]);
      });
    }
    rows.push(
      ["profile_id", src.profile_id || ""],
      ["Arquétipo", src.archetype || ""],
      ["Letra", src.letter || ""],
      ["Código da sessão", src.session_code || ""],
      ["E-mail", Object.prototype.hasOwnProperty.call(src, "email") ? (src.email || "sem e-mail") : ""],
      ["Fonte", src.fonte || ""],
      ["Avatar", src.avatar_url || ""],
      ["ID da conta", src.user_id || ""],
      ["Texto salvo", src.personality_text || ""],
      ["Atualizado em", src.updated_at || ""]
    );
    if (src.fonte === "google") {
      rows.push(
        ["Agenda (itens)", countText(src.calendar_count)],
        ["YouTube (itens)", countText(src.youtube_count)],
        ["Contatos (itens)", countText(src.contacts_count)],
        ["Tarefas (itens)", countText(src.tasks_count)]
      );
    }
    return rows.filter(function (row) { return String(row[1] || "") !== ""; });
  }

  function buildPersonality(user, dossier, sessionCode) {
    var data = dossier || {};
    var pref = data.preferencias || {};
    var guest = isGuest(user) || data.fonte === "convidado";
    var name = resolvedDisplayName(user, data, sessionCode);
    var profile = resolvedProfile(pref);
    var phrase = phraseFor(profile.profile_id, name);
    var text = phrase || (name + " ainda não fechou o perfil da casa.");
    if (!guest && data.fonte === "google") {
      var nCal = (data.calendar || []).length;
      var nYt = (data.youtube || []).length;
      var nTask = (data.tasks || []).length;
      text += " Nesta sessão há " + nCal + " evento(s) de agenda, " + nYt + " canal(is) do YouTube e " + nTask + " tarefa(s).";
    }
    text += " Este cartão é só o resumo; o dossiê completo fica na conta.";
    return {
      text: text,
      phrase: phrase,
      archetype: profile.archetype || "Perfil em formação",
      displayName: name,
      profile_id: profile.profile_id,
      letter: profile.letter
    };
  }

  return {
    isGuest: isGuest,
    displayName: displayName,
    resolvedDisplayName: resolvedDisplayName,
    emailFor: emailFor,
    avatarFor: avatarFor,
    formatArchetype: formatArchetype,
    phraseFor: phraseFor,
    answerText: answerText,
    sessionFields: sessionFields,
    buildPersonality: buildPersonality
  };
});
