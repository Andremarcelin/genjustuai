const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const G = require("../js/guest-save.js");
const P = require("../js/personality.js");

const CODE = "AB3K7Q";

function guestUser() {
  return {
    id: "anon-1",
    is_anonymous: true,
    email: null,
    app_metadata: { provider: "anonymous" },
    user_metadata: {}
  };
}

function googleUser() {
  return {
    id: "google-1",
    is_anonymous: false,
    email: "ana@example.com",
    app_metadata: { provider: "google" },
    user_metadata: { full_name: "Ana" }
  };
}

function authWith(sessionUser, anonUser) {
  const calls = [];
  return {
    calls,
    async getSession() {
      calls.push("getSession");
      return { data: { session: sessionUser ? { user: sessionUser } : null } };
    },
    async signInAnonymously() {
      calls.push("signInAnonymously");
      if (!anonUser) {
        return { data: null, error: { code: "anonymous_provider_disabled", message: "Anonymous sign-ins are disabled" } };
      }
      return { data: { user: anonUser, session: { user: anonUser } } };
    }
  };
}

function depsFor(auth, hooks) {
  const writes = { dossier: [], summary: [] };
  const options = hooks || {};
  return {
    writes,
    auth,
    recarga: "cor",
    atmosfera: "seda",
    acolhida: "porta",
    dossier: options.dossier || { calendar: [{ titulo: "oculto" }] },
    isGuest: P.isGuest,
    emailFor: P.emailFor,
    avatarFor: function () { return "/assets/guest-avatar.jpg"; },
    visitorName: options.visitorName,
    personality: P.buildPersonality,
    remember: function (dossier) { writes.remembered = dossier; },
    ensureSession: async function (user) {
      writes.ensuredUser = user;
      if (options.ensure) return options.ensure(user);
      return CODE;
    },
    writeDossier: async function (row) {
      writes.dossier.push(row);
      if (options.dossierError && writes.dossier.length === 1) return { error: options.dossierError };
      return { error: null };
    },
    writeSummary: async function (row) {
      writes.summary.push(row);
      if (options.summaryError && writes.summary.length === 1) return { error: options.summaryError };
      return { error: null };
    }
  };
}

test("save without a session signs in anonymously and writes the ZCEA profile", async () => {
  const user = guestUser();
  const auth = authWith(null, user);
  const deps = depsFor(auth, { visitorName: "Lina" });
  const saved = await G.saveWithoutLogin(deps);

  assert.deepEqual(auth.calls, ["getSession", "signInAnonymously"]);
  assert.equal(saved.createdAnonymous, true);
  assert.equal(saved.guest, true);
  assert.equal(saved.sessionCode, CODE);
  assert.match(saved.sessionCode, G.CODE_RE);
  assert.equal(saved.profile.profile_id, "Excentrico");
  assert.equal(saved.profile.archetype, "Excêntrico");
  assert.equal(saved.profile.letter, "E");
  assert.equal(deps.writes.ensuredUser.id, user.id);
  assert.equal(deps.writes.dossier.length, 1);
  assert.equal(deps.writes.summary.length, 1);

  const dossier = deps.writes.dossier[0];
  assert.equal(dossier.user_id, user.id);
  assert.equal(dossier.session_code, CODE);
  assert.equal(dossier.profile_id, "Excentrico");
  assert.equal(dossier.email, "");
  assert.equal(dossier.full_name, "Lina");
  assert.equal(dossier.dossier_data.nome_exibicao, "Lina");
  assert.equal(dossier.dossier_data.fonte, "convidado");
  assert.equal(dossier.dossier_data.preferencias.profile_id, "Excentrico");
  assert.equal(dossier.dossier_data.preferencias.recarga, "cor");
  assert.equal(dossier.dossier_data.preferencias.atmosfera, "seda");
  assert.equal(dossier.dossier_data.preferencias.acolhida, "porta");

  const summary = deps.writes.summary[0];
  assert.equal(summary.session_code, CODE);
  assert.equal(summary.user_id, user.id);
  assert.equal(summary.profile_id, "Excentrico");
  assert.equal(summary.archetype, "Excêntrico");
  assert.equal(summary.display_name, "Lina");
  assert.equal(summary.status, "ready");
  assert.match(summary.personality_text, /Lina/);
  assert.match(summary.personality_text, /gesto ousado/);
  assert.doesNotMatch(summary.personality_text, /agenda|YouTube|tarefa|oculto/i);
  const labels = Object.fromEntries(saved.fields);
  assert.equal(labels.Nome, "Lina");
  assert.equal(labels["Depois do dia, o que te devolve?"], "Cor demais e riso alto (cor)");
  assert.equal(labels["Que clima você quer ao entrar?"], "Lanterna quente e seda (seda)");
  assert.equal(labels["Como você recebe quem chega?"], "Porta aberta e improviso (porta)");
  assert.equal(labels.profile_id, "Excentrico");
  assert.equal(labels["Arquétipo"], "Excêntrico");
  assert.equal(labels.Letra, "E");
  assert.equal(labels["Código da sessão"], CODE);
  assert.equal(labels["E-mail"], "sem e-mail");
  assert.equal(labels.Fonte, "convidado");
  assert.equal(labels["Texto salvo"], summary.personality_text);
  assert.equal(JSON.stringify(saved.fields).includes("oculto"), false);
  assert.match(G.savedMessage(CODE, saved.profile, { guest: true }), /Salvo como visitante, sem conta/);
  assert.match(G.savedMessage(CODE, saved.profile, { guest: true }), /Perfil do Quest: E · Excêntrico/);
  assert.match(G.savedMessage(CODE, saved.profile, { guest: true }), new RegExp(CODE));
});

test("two saves with the same profile keep different session codes", async () => {
  const codes = ["AAAAAA", "BBBBBB"];
  async function saveOnce(code) {
    const deps = depsFor(authWith(null, guestUser()), {
      visitorName: code === "AAAAAA" ? "Lina" : "Nico",
      ensure: function () { return code; },
    });
    deps.recarga = "agua";
    deps.atmosfera = "madeira";
    deps.acolhida = "aceno";
    return { saved: await G.saveWithoutLogin(deps), deps };
  }
  const first = await saveOnce("AAAAAA");
  const second = await saveOnce("BBBBBB");
  assert.equal(first.saved.profile.profile_id, "Zen");
  assert.equal(second.saved.profile.profile_id, "Zen");
  assert.equal(first.deps.writes.summary[0].session_code, "AAAAAA");
  assert.equal(second.deps.writes.summary[0].session_code, "BBBBBB");
  assert.equal(first.deps.writes.summary[0].status, "ready");
  assert.equal(second.deps.writes.summary[0].status, "ready");
  assert.notEqual(first.saved.sessionCode, second.saved.sessionCode);
});

test("an existing Google session is reused and anonymous sign-in is not called", async () => {
  const user = googleUser();
  const auth = authWith(user, null);
  const deps = depsFor(auth, {
    dossier: { fonte: "google", calendar: [{}], youtube: [], tasks: [] }
  });
  deps.recarga = "agua";
  deps.atmosfera = "madeira";
  deps.acolhida = "aceno";
  const saved = await G.saveWithoutLogin(deps);

  assert.deepEqual(auth.calls, ["getSession"]);
  assert.equal(saved.createdAnonymous, false);
  assert.equal(saved.guest, false);
  assert.equal(saved.profile.profile_id, "Zen");
  assert.equal(deps.writes.dossier[0].email, "ana@example.com");
  assert.equal(deps.writes.dossier[0].full_name, "Ana");
  assert.equal(deps.writes.dossier[0].dossier_data.fonte, "google");
  assert.equal(deps.writes.dossier[0].profile_id, "Zen");
  assert.match(deps.writes.summary[0].personality_text, /água parada/);
  assert.match(deps.writes.summary[0].personality_text, /1 evento\(s\) de agenda/);
  const googleLabels = Object.fromEntries(saved.fields);
  assert.equal(googleLabels.Nome, "Ana");
  assert.equal(googleLabels["Agenda (itens)"], "1");
  assert.equal(googleLabels["E-mail"], "ana@example.com");
  assert.match(G.savedMessage(CODE, saved.profile, { guest: false }), /^✓ Perfil salvo\./);
});

test("disabled anonymous provider stops before the session RPC", async () => {
  const auth = authWith(null, null);
  const deps = depsFor(auth, { visitorName: "Lina" });
  await assert.rejects(() => G.saveWithoutLogin(deps), (err) => {
    assert.match(err.message, /Anonymous sign-ins/);
    assert.match(err.message, /Authentication → Providers/);
    assert.match(err.message, /não liga por SQL/);
    return true;
  });
  assert.deepEqual(auth.calls, ["getSession", "signInAnonymously"]);
  assert.equal(deps.writes.ensuredUser, undefined);
  assert.equal(deps.writes.dossier.length, 0);
});

test("incomplete answers do not create a visitor", async () => {
  const auth = authWith(null, guestUser());
  const deps = depsFor(auth);
  deps.acolhida = "";
  await assert.rejects(() => G.saveWithoutLogin(deps), (err) => {
    assert.equal(err.code, "incomplete");
    assert.match(err.message, /três perguntas/);
    return true;
  });
  assert.deepEqual(auth.calls, []);
  assert.equal(deps.writes.dossier.length, 0);
});

test("a guest without a name does not open an anonymous session", async () => {
  const auth = authWith(null, guestUser());
  const deps = depsFor(auth);
  await assert.rejects(() => G.saveWithoutLogin(deps), (err) => {
    assert.equal(err.code, "name_required");
    assert.match(err.message, /nome/);
    return true;
  });
  assert.deepEqual(auth.calls, ["getSession"]);
  assert.equal(deps.writes.dossier.length, 0);
  assert.equal(G.normalizeVisitorName("  Li  "), "Li");
  assert.equal(G.normalizeVisitorName("A"), "");
  assert.equal(G.normalizeVisitorName("   "), "");
});

test("saving a visitor activates that session and drops the previous active one", async () => {
  const deps = depsFor(authWith(null, guestUser()), { visitorName: "Lina" });
  const calls = [];
  deps.activateSession = async function (code) {
    calls.push(code);
    return { data: code, error: null };
  };
  const saved = await G.saveWithoutLogin(deps);
  assert.deepEqual(calls, [CODE]);
  assert.equal(saved.activated, true);
  assert.equal(saved.visitorName, "Lina");
  assert.equal(deps.writes.summary[0].display_name, "Lina");
});

test("a later sync keeps a quiz that was already stored", () => {
  const stored = {
    fonte: "google",
    calendar: [{ titulo: "antigo" }],
    preferencias: { recarga: "pulso", atmosfera: "neon", acolhida: "enigma", profile_id: "Cyber" }
  };
  const merged = G.mergeStoredDossier(stored, { fonte: "google", calendar: [], youtube: [] });
  assert.equal(merged.preferencias.profile_id, "Cyber");
  assert.equal(merged.preferencias.recarga, "pulso");
  assert.equal(merged.preferencias.acolhida, "enigma");
  assert.deepEqual(merged.calendar, []);

  const replaced = G.mergeStoredDossier(stored, {
    preferencias: { recarga: "mesa", atmosfera: "bambu", acolhida: "cha", profile_id: "Acolhedor" }
  });
  assert.equal(replaced.preferencias.profile_id, "Acolhedor");
  assert.equal(replaced.calendar[0].titulo, "antigo");
});

test("a missing profile_id column still stores the session code", async () => {
  const auth = authWith(null, guestUser());
  const missing = { code: "PGRST204", message: "Could not find the 'profile_id' column of 'session_summaries' in the schema cache" };
  const deps = depsFor(auth, { summaryError: missing, dossierError: missing, visitorName: "Lina" });
  const saved = await G.saveWithoutLogin(deps);
  assert.equal(saved.profilePendingSql, true);
  assert.equal(saved.sessionCode, CODE);
  assert.equal(deps.writes.dossier.length, 2);
  assert.equal(deps.writes.summary.length, 2);
  assert.equal(Object.hasOwn(deps.writes.summary[1], "profile_id"), false);
  assert.equal(deps.writes.summary[1].session_code, CODE);
  assert.equal(deps.writes.summary[1].status, "ready");
  assert.equal(Object.hasOwn(deps.writes.summary[0], "status"), true);
  assert.match(G.savedMessage(CODE, saved.profile, { guest: true, profilePendingSql: true }), /sql\/profile_id\.sql/);
});

test("the page copy tells the visitor they are saving without an account", () => {
  const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const portal = fs.readFileSync(path.join(__dirname, "..", "js", "portal.js"), "utf8");
  const anon = fs.readFileSync(path.join(__dirname, "..", "sql", "anonymous_auth.sql"), "utf8");
  assert.match(index, /Salvar sem conta e gerar o código/);
  assert.match(index, /salvar como visitante/i);
  assert.match(index, /id="visitor-name"/);
  assert.match(index, /Depois do dia, o que te devolve/);
  assert.match(index, /Água parada, sem pressa/);
  assert.match(index, /Que clima você quer ao entrar/);
  assert.match(index, /Como você recebe quem chega/);
  assert.match(index, /data-field="recarga"/);
  assert.match(index, /data-field="atmosfera"/);
  assert.match(index, /data-field="acolhida"/);
  assert.match(index, /data-value="agua"/);
  assert.match(index, /data-value="pulso"/);
  assert.match(index, /data-value="madeira"/);
  assert.match(index, /data-value="cha"/);
  assert.doesNotMatch(index, /data-field="clima_ambiente"/);
  assert.match(index, /id="quiz-profile"/);
  assert.match(index, /id="ready-profile"/);
  assert.match(index, /id="ready-records"/);
  assert.match(index, /class="parchment"/);
  assert.doesNotMatch(index, /house-card|data-house|Escolha a casa|Escolha o dojo/);
  assert.match(portal, /signInWithOAuth/);
  assert.match(portal, /saveWithoutLogin/);
  assert.match(portal, /loadStoredDossier/);
  assert.match(portal, /if \(!persona\.profile_id\) return;/);
  assert.match(portal, /genjutsu_allocate_session_code/);
  assert.match(portal, /ensureSession:\s*allocateSessionCode/);
  assert.match(portal, /from\("session_summaries"\)\.insert\(row\)/);
  assert.doesNotMatch(portal, /onConflict:\s*"profile_id"/);
  assert.doesNotMatch(portal, /Sessão expirada/);
  assert.doesNotMatch(portal, /P\.HOUSES/);
  assert.match(anon, /authenticated/);
  assert.match(anon, /Não conceda a função ao papel anon|não conceda a função ao papel `anon`/i);
  assert.doesNotMatch(anon, /grant execute on function public\.genjutsu_ensure_session\(\) to anon/i);
});
