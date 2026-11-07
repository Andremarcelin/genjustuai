const assert = require("assert");
const fs = require("fs");
const path = require("path");
const P = require("../js/personality.js");

const guest = {
  id: "guest-1",
  is_anonymous: true,
  email: null,
  app_metadata: { provider: "anonymous" },
  user_metadata: {}
};
const google = {
  id: "google-1",
  is_anonymous: false,
  email: "ana@example.com",
  app_metadata: { provider: "google" },
  user_metadata: { full_name: "Ana" }
};

assert.strictEqual(P.isGuest(guest), true);
assert.strictEqual(P.isGuest(google), false);
assert.strictEqual(P.isGuest({ user_metadata: { guest: true } }), true);
assert.strictEqual(P.displayName(guest, "AB3K7Q"), "Visitante AB3K7Q");
assert.strictEqual(P.displayName(guest, ""), "Visitante");
const namedGuest = {
  id: "guest-2",
  is_anonymous: true,
  user_metadata: { full_name: "Lina", guest: true }
};
assert.strictEqual(P.displayName(namedGuest, "AB3K7Q"), "Lina");
assert.strictEqual(P.emailFor(guest), "");
assert.strictEqual(P.emailFor(google), "ana@example.com");
assert.strictEqual(P.avatarFor(guest), "/assets/guest-avatar.jpg");

const guestText = P.buildPersonality(guest, {
  fonte: "convidado",
  calendar: [{ titulo: "não deve aparecer" }],
  youtube: [{ canal: "x" }],
  tasks: [{ titulo: "y" }],
  nome_exibicao: "Lina",
  preferencias: { folga: "ordem", problema: "respira", festa: "canto", profile_id: "Zen" }
}, "AB3K7Q");
assert.strictEqual(guestText.archetype, "Zen");
assert.strictEqual(guestText.profile_id, "Zen");
assert.strictEqual(guestText.displayName, "Lina");
assert.strictEqual(guestText.phrase, P.phraseFor("Zen", "Lina"));
assert.ok(guestText.text.includes("Lina"));
assert.ok(!guestText.text.includes("Teste Roadmap"));
assert.ok(guestText.text.includes("passo de cada vez"));
assert.ok(!/agenda|YouTube|tarefa/i.test(guestText.text), guestText.text);

const namedText = P.buildPersonality(guest, {
  fonte: "convidado",
  nome_exibicao: "Lina",
  preferencias: { folga: "sistema", problema: "modelo", festa: "mapa", profile_id: "Cyber" }
}, "AB3K7Q");
assert.strictEqual(namedText.displayName, "Lina");
assert.ok(namedText.phrase.includes("Lina"));
assert.ok(namedText.phrase.includes("sistemas"));
assert.strictEqual(P.phraseFor("Excentrico", "Lina").includes("gesto ousado"), true);
assert.strictEqual(P.phraseFor("Acolhedor", "Lina").includes("quem está perto"), true);
assert.strictEqual(P.answerText("folga", "ordem"), "organiza o dia em silêncio e segue o plano (ordem)");
assert.strictEqual(P.answerText("festa", "anel"), "percebe quem está sozinho e puxa essa pessoa para o círculo (anel)");

const googleText = P.buildPersonality(google, {
  fonte: "google",
  calendar: [{}],
  youtube: [],
  tasks: [{}, {}],
  nome_exibicao: "Teste Roadmap",
  preferencias: { folga: "impulso", problema: "atalho", festa: "pista", profile_id: "Excentrico" }
}, "ZZZZZZ");
assert.strictEqual(googleText.archetype, "Excêntrico");
assert.strictEqual(googleText.profile_id, "Excentrico");
assert.ok(googleText.phrase.includes("Ana"));
assert.ok(!googleText.text.includes("Teste Roadmap"));
assert.ok(googleText.phrase.includes("gesto ousado"));
assert.ok(/1 evento\(s\) de agenda, 0 canal\(is\) do YouTube e 2 tarefa\(s\)/.test(googleText.text));

const unsynced = P.buildPersonality(google, { preferencias: { folga: "ordem" } }, "");
assert.ok(!/agenda/.test(unsynced.text), unsynced.text);
assert.strictEqual(unsynced.archetype, "Perfil em formação");
assert.strictEqual(unsynced.profile_id, null);
assert.strictEqual(P.formatArchetype("Excentrico"), "E · Excêntrico");
assert.strictEqual(P.formatArchetype("Excêntrico"), "E · Excêntrico");
assert.strictEqual(P.formatArchetype("Z"), "Z · Zen");

const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const styleBlocks = index.match(/<style[\s\S]*?<\/style>/g) || [];
const styleLines = styleBlocks.reduce(function (n, block) { return n + block.split("\n").length; }, 0);
assert.ok(styleLines < 200, "inline CSS lines: " + styleLines);
assert.ok(index.includes("Continuar com Google"));
assert.ok(index.includes("Continuar sem conta"));
assert.ok(index.includes("ou Microsoft"));
assert.ok(index.includes('id="screen-config"'));
assert.ok(/id="screen-config"[^>]*hidden/.test(index));
assert.ok(!/class="[^"]*\bscreen\b[^"]*" id="screen-config"|id="screen-config"[^>]*class="[^"]*\bscreen\b/.test(index));

const portal = fs.readFileSync(path.join(__dirname, "..", "js", "portal.js"), "utf8");
const guestSave = fs.readFileSync(path.join(__dirname, "..", "js", "guest-save.js"), "utf8");
assert.ok(guestSave.includes("signInAnonymously"));
assert.ok(portal.includes("saveWithoutLogin"));
assert.ok(portal.includes("calendar.readonly"));
assert.ok(portal.includes("if (P.isGuest(user))"));
assert.ok(!portal.includes("Nesta sessão há") , "calendar sentence must live in personality.js");
assert.ok(index.includes("Salvar sem conta e gerar o código"));
assert.ok(index.includes("como visitante"));
assert.ok(index.includes('id="visitor-name"'));
assert.ok(index.includes("Num fim de semana livre, você…"));
assert.ok(index.includes("organiza o dia em silêncio e segue o plano"));
assert.ok(index.includes("Quando surge um problema difícil, você…"));
assert.ok(index.includes("Numa festa onde conhece pouca gente, você…"));
assert.ok(index.includes('data-value="ordem"'));
assert.ok(index.includes('data-value="sistema"'));
assert.ok(index.includes('data-value="impulso"'));
assert.ok(index.includes('data-value="gente"'));
assert.ok(index.includes("Como sua casa vai responder"));
assert.ok(index.includes("Sua sessão está pronta — coloque o Quest"));
assert.ok(index.includes('id="ready-phrase"'));
assert.ok(index.includes('id="ready-records"'));
assert.ok(index.includes('class="parchment"'));
assert.ok(!/house-card|data-house|Escolha a casa|Escolha o dojo/.test(index));
assert.ok(!/Acolhedora|Elétrica|Ardente/.test(index));

const privacy = fs.readFileSync(path.join(__dirname, "..", "privacy.html"), "utf8");
const terms = fs.readFileSync(path.join(__dirname, "..", "terms.html"), "utf8");
assert.ok(/sem conta/i.test(privacy));
assert.ok(/não chamamos Google Agenda/i.test(privacy));
assert.ok(/Continuar sem conta/i.test(terms));

console.log("personality tests ok");
