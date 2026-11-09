import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const C = require("../js/codigo.js");
const P = require("../js/personality.js");

const html = fs.readFileSync(new URL("../codigo.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../codigo.css", import.meta.url), "utf8");
const vercel = fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
const landing = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const casa = fs.readFileSync(new URL("../casa.html", import.meta.url), "utf8");
const entrada = fs.readFileSync(new URL("../entrada.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../js/codigo.js", import.meta.url), "utf8");

test("codigo page copy matches the mock and is not in main nav", () => {
  assert.match(html, /REVEJA SUA SESSÃO|Reveja sua sessão/);
  assert.match(html, /CÓDIGO DA SESSÃO|Código da sessão/);
  assert.match(html, /Digite os 6 caracteres do seu código/);
  assert.match(html, /Abrir meu perfil/);
  assert.match(html, /O código está no pergaminho da sessão e no verso do cartão/);
  assert.match(html, /lang="ja">幻術/);
  assert.match(html, /id="code-boxes"/);
  assert.equal((html.match(/<input /g) || []).length, 6);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /Oswald/);
  assert.match(vercel, /"\/codigo"/);
  assert.match(vercel, /"\/codigo\/"/);
  assert.doesNotMatch(landing, /href="\/codigo"/);
  assert.doesNotMatch(casa, /href="\/codigo"/);
  assert.doesNotMatch(entrada, /href="\/codigo"/);
});

test("lookup uses public /api/session and never mentions the service role", () => {
  assert.match(js, /\/api\/session\?code=/);
  assert.doesNotMatch(js, /SERVICE_ROLE|service_role|serviceRole/);
  assert.equal(C.errorFor(404, "not_found"), "Não achei esse código. Confere as letras?");
  assert.equal(C.errorFor(400, "invalid_code"), "Não achei esse código. Confere as letras?");
});

test("code boxes normalize, paste a full code, and read ?c= prefill", () => {
  assert.equal(C.normalizeCode("fm8qs7"), "FM8QS7");
  assert.equal(C.normalizeCode("fm-8 qs 7 extra"), "FM8QS7");
  assert.deepEqual(C.splitCode("ab3k7q"), ["A", "B", "3", "K", "7", "Q"]);
  assert.equal(C.codeFromLocation({ search: "?c=fm8qs7", pathname: "/codigo" }), "FM8QS7");
  assert.equal(C.codeFromLocation({ search: "", pathname: "/codigo/ab3k7q" }), "AB3K7Q");
  const fake = [{ value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }];
  C.writeBoxes(fake, "fm8qs7");
  assert.equal(C.readBoxes(fake), "FM8QS7");
});

test("fetchSession maps not_found and returns the public session", async () => {
  const missing = await C.fetchSession("ZZZZZZ", async () => ({
    ok: false,
    status: 404,
    json: async () => ({ error: "not_found" })
  }));
  assert.equal(missing.error, C.LOOKUP_ERROR);

  const found = await C.fetchSession("fm8qs7", async (url) => {
    assert.match(String(url), /\/api\/session\?code=FM8QS7/);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        session: { session_code: "FM8QS7", display_name: "QA Teste", profile_id: "Zen", archetype: "Zen" }
      })
    };
  });
  assert.equal(found.session.display_name, "QA Teste");
  assert.deepEqual(C.recordRows(found.session), [["Nome", "QA Teste"], ["profile_id", "Zen"]]);
  assert.ok(P.proverbFor("Zen", "FM8QS7"));
});
