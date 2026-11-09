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
    Zen: "{name}, a casa entendeu que você recarrega no silêncio e resolve um passo de cada vez. A luz fica baixa e azul, o som quase quieto, o ar fresco — o seu ritmo não será empurrado.",
    Cyber: "{name}, a casa entendeu que você pensa em sistemas e escolhe a jogada antes de agir. O neon azul pulsa curto, a noite fica baixa e o clima pede foco, para a cabeça trabalhar sem ruído.",
    Excentrico: "{name}, a casa entendeu que você busca o que ainda não fez e puxa a sala sem roteiro. A luz esquenta, o som sobe e o clima fica solto, para o gesto ousado ter espaço.",
    Acolhedor: "{name}, a casa entendeu que você cuida de quem está perto e segura o clima junto. A lanterna fica quente, o bambu baixo, e já há um lugar guardado para a conversa."
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

  var proverbBank = null;

  function hashMod(value, size) {
    var s = String(value || "").toUpperCase();
    var h = 0;
    var i;
    for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return size ? h % size : 0;
  }

  function setProverbBank(bank) {
    proverbBank = bank && typeof bank === "object" ? bank : proverbBank;
    return proverbBank;
  }

  function defaultProverbBank() {
    if (proverbBank) return proverbBank;
    try {
      if (typeof require === "function") proverbBank = require("../data/proverbios.json");
    } catch (e) { /* o JSON entra no fetch do site */ }
    return proverbBank || {};
  }

  function proverbFor(profileId, sessionCode, bank) {
    var id = profileIdFrom(profileId);
    var lists = bank || defaultProverbBank();
    var list = id && lists ? lists[id] : null;
    if (!list || !list.length) return "";
    return list[hashMod(sessionCode, list.length)];
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
    proverbFor: proverbFor,
    hashMod: hashMod,
    setProverbBank: setProverbBank,
    answerText: answerText,
    sessionFields: sessionFields,
    buildPersonality: buildPersonality
  };
});
