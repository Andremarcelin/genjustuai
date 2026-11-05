// Grava o questionário ZCEA sem conta Google.
// Sem sessão, chama auth.signInAnonymously() e segue como role authenticated.
(function (root, factory) {
  var api = factory(function () {
    if (root.GenjutsuZcea) return root.GenjutsuZcea;
    if (typeof require === "function") return require("./zcea-profile.js");
    throw new Error("zcea-profile.js não carregou");
  });
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GenjutsuGuestSave = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (loadZcea) {
  var CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

  function anonymousFailureMessage(error) {
    var code = (error && error.code) || "";
    var msg = ((error && error.message) || "") + " " + code;
    if (/anonymous/i.test(msg)) {
      return "Sessões anônimas estão desligadas neste Supabase. Em Authentication → Providers, ative Anonymous sign-ins. Esse interruptor não liga por SQL.";
    }
    return "Não foi possível entrar sem conta: " + ((error && error.message) || "erro desconhecido");
  }

  function sessionUser(result) {
    var data = result && result.data;
    if (!data) return null;
    if (data.session && data.session.user) return data.session.user;
    if (data.user) return data.user;
    return null;
  }

  async function ensureUser(auth, prefetched) {
    if (!auth || typeof auth.getSession !== "function" || typeof auth.signInAnonymously !== "function") {
      throw new Error("Cliente Supabase indisponível.");
    }
    var existing = prefetched || await auth.getSession();
    var user = sessionUser(existing);
    if (user) return { user: user, createdAnonymous: false };
    var created = await auth.signInAnonymously();
    if (!created || created.error) {
      var denied = new Error(anonymousFailureMessage(created && created.error));
      denied.code = "anonymous_signin_failed";
      throw denied;
    }
    user = sessionUser(created);
    if (!user) throw new Error("Não foi possível abrir a sessão de visitante.");
    return { user: user, createdAnonymous: true };
  }

  function fieldsFor(source) {
    var scope = typeof globalThis !== "undefined" ? globalThis : this;
    var personality = scope && scope.GenjutsuPersonality;
    if (personality && typeof personality.sessionFields === "function") {
      return personality.sessionFields(source);
    }
    if (typeof require === "function") {
      var loaded = require("./personality.js");
      if (loaded && typeof loaded.sessionFields === "function") return loaded.sessionFields(source);
    }
    return [];
  }

  function normalizeVisitorName(value) {
    var name = String(value || "").replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 40) return "";
    return name;
  }

  function applyVisitorName(user, visitorName, guest) {
    if (!visitorName) return user;
    var meta = Object.assign({}, (user && user.user_metadata) || {});
    meta.full_name = visitorName;
    if (guest) meta.guest = true;
    return Object.assign({}, user || {}, { user_metadata: meta });
  }

  function selection(vibe, tempo) {
    var resolved = loadZcea().resolve(vibe, tempo);
    if (!resolved.profile_id) return null;
    return {
      clima_ambiente: vibe,
      clima_tempo: tempo,
      profile_id: resolved.profile_id,
      letter: resolved.letter,
      archetype: resolved.archetype
    };
  }

  // O login não pode apagar um quiz já gravado. A resposta nova só substitui
  // o par clima_ambiente + clima_tempo quando as duas vierem preenchidas.
  function mergeStoredDossier(stored, incoming) {
    var base = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    var next = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? incoming : {};
    var merged = Object.assign({}, base, next);
    var storedPref = base.preferencias && typeof base.preferencias === "object" ? base.preferencias : null;
    var nextPref = next.preferencias && typeof next.preferencias === "object" ? next.preferencias : null;
    var nextComplete = !!(nextPref && nextPref.clima_ambiente && nextPref.clima_tempo);
    if (storedPref && !nextComplete) {
      merged.preferencias = Object.assign({}, storedPref, nextPref || {});
    }
    return merged;
  }

  function columnMissing(error) {
    var code = (error && error.code) || "";
    if (code === "23514") return false;
    var msg = (error && error.message) || "";
    return code === "PGRST204" || code === "42703" || (/profile_id/.test(msg) && /schema cache|does not exist|could not find/i.test(msg));
  }

  function savedMessage(sessionCode, profile, options) {
    var pending = options && options.profilePendingSql;
    var guest = !options || options.guest !== false;
    var badge = profile && profile.profile_id
      ? " Perfil do Quest: " + profile.letter + " · " + profile.archetype + "."
      : "";
    var lead = guest
      ? "✓ Salvo como visitante, sem conta."
      : "✓ Perfil salvo.";
    var sql = pending
      ? " O código foi gravado. Para o Quest ler o perfil, rode sql/profile_id.sql."
      : "";
    return lead + badge + " Código da sessão: " + sessionCode + "." + sql;
  }

  function sqlFailure() {
    return "Não foi possível gerar o código da sessão. No SQL Editor, rode nesta ordem: sql/dossiers.sql, sql/sessions.sql, sql/app_state.sql, sql/admin_read.sql, sql/anonymous_auth.sql e sql/profile_id.sql. Em Authentication → Providers, ative Anonymous sign-ins.";
  }

  async function writeRow(write, row) {
    var result = await write(row);
    if (result && result.error && columnMissing(result.error) && Object.prototype.hasOwnProperty.call(row, "profile_id")) {
      var copy = {};
      Object.keys(row).forEach(function (key) {
        if (key !== "profile_id") copy[key] = row[key];
      });
      var retry = await write(copy);
      if (retry && retry.error) {
        var retryErr = new Error(sqlFailure());
        retryErr.cause = retry.error;
        throw retryErr;
      }
      return { profilePendingSql: true };
    }
    if (result && result.error) {
      var err = new Error(sqlFailure());
      err.cause = result.error;
      throw err;
    }
    return { profilePendingSql: false };
  }

  async function saveWithoutLogin(deps) {
    var picked = selection(deps.vibe, deps.tempo);
    if (!picked) {
      var incomplete = new Error("Responda as duas perguntas antes de salvar.");
      incomplete.code = "incomplete";
      throw incomplete;
    }
    var visitorName = normalizeVisitorName(deps.visitorName);
    if (!deps.auth || typeof deps.auth.getSession !== "function") {
      throw new Error("Cliente Supabase indisponível.");
    }
    var peek = await deps.auth.getSession();
    var existingUser = sessionUser(peek);
    var guestLikely = !existingUser || (typeof deps.isGuest === "function" && deps.isGuest(existingUser));
    if (guestLikely && !visitorName) {
      var nameErr = new Error("Escreva seu nome antes de salvar.");
      nameErr.code = "name_required";
      throw nameErr;
    }
    var authResult = await ensureUser(deps.auth, peek);
    var user = authResult.user;

    var base = Object.assign({}, deps.dossier || {});
    var guest = authResult.createdAnonymous || (deps.isGuest && deps.isGuest(user));
    if (guest && !visitorName) {
      var lateName = new Error("Escreva seu nome antes de salvar.");
      lateName.code = "name_required";
      throw lateName;
    }
    if (guest) base.fonte = "convidado";
    if (visitorName) base.nome_exibicao = visitorName;
    base.preferencias = {
      clima_ambiente: picked.clima_ambiente,
      clima_tempo: picked.clima_tempo,
      profile_id: picked.profile_id
    };
    if (typeof deps.remember === "function") deps.remember(base);

    var namedUser = applyVisitorName(user, visitorName, guest);
    var sessionCode = String(await deps.ensureSession(namedUser) || "").trim().toUpperCase();
    if (!CODE_RE.test(sessionCode)) throw new Error(sqlFailure());

    var persona = deps.personality(namedUser, base, sessionCode);
    var profileId = (persona && persona.profile_id) || picked.profile_id;
    var now = new Date().toISOString();
    var dossierRow = {
      user_id: user.id,
      full_name: persona.displayName,
      email: deps.emailFor ? deps.emailFor(user) : "",
      avatar_url: deps.avatarFor ? deps.avatarFor(user) : "",
      dossier_data: base,
      session_code: sessionCode,
      profile_id: profileId,
      updated_at: now
    };
    var summaryRow = {
      session_code: sessionCode,
      user_id: user.id,
      display_name: persona.displayName,
      personality_text: persona.text,
      archetype: persona.archetype,
      profile_id: profileId,
      updated_at: now
    };

    var dossierWrite = await writeRow(deps.writeDossier, dossierRow);
    var summaryWrite = await writeRow(deps.writeSummary, summaryRow);
    var profilePendingSql = dossierWrite.profilePendingSql || summaryWrite.profilePendingSql;
    var recordSource = {
      display_name: persona.displayName,
      preferencias: base.preferencias,
      profile_id: profileId,
      archetype: persona.archetype,
      letter: persona.letter,
      session_code: sessionCode,
      email: dossierRow.email,
      fonte: base.fonte || "",
      avatar_url: dossierRow.avatar_url,
      user_id: namedUser.id,
      personality_text: persona.text,
      updated_at: now
    };
    if (base.fonte === "google") {
      recordSource.calendar_count = (base.calendar || []).length;
      recordSource.youtube_count = (base.youtube || []).length;
      recordSource.contacts_count = (base.contacts || []).length;
      recordSource.tasks_count = (base.tasks || []).length;
    }
    var fields = fieldsFor(recordSource);
    return {
      sessionCode: sessionCode,
      user: namedUser,
      visitorName: persona.displayName,
      createdAnonymous: authResult.createdAnonymous,
      guest: guest,
      profile: picked,
      persona: persona,
      dossier: base,
      fields: fields,
      profilePendingSql: profilePendingSql
    };
  }

  return {
    CODE_RE: CODE_RE,
    anonymousFailureMessage: anonymousFailureMessage,
    ensureUser: ensureUser,
    normalizeVisitorName: normalizeVisitorName,
    selection: selection,
    mergeStoredDossier: mergeStoredDossier,
    columnMissing: columnMissing,
    savedMessage: savedMessage,
    saveWithoutLogin: saveWithoutLogin
  };
});
