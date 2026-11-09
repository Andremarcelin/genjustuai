import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const View = require("../js/casa-view.js");
const Voice = require("../js/casa-voice.js");

test("each profile_id maps to its furnished casa render", () => {
  assert.equal(View.houseImageFor("Zen"), "/assets/casa/zen.jpg");
  assert.equal(View.houseImageFor("Cyber"), "/assets/casa/cyber.jpg");
  assert.equal(View.houseImageFor("Excentrico"), "/assets/casa/excentrico.jpg");
  assert.equal(View.houseImageFor("Acolhedor"), "/assets/casa/acolhedor.jpg");
  assert.equal(View.houseImageFor(null), "/assets/casa/acolhedor.jpg");
  ["zen", "cyber", "excentrico", "acolhedor"].forEach((name) => {
    const buf = fs.readFileSync(new URL(`../assets/casa/${name}.jpg`, import.meta.url));
    assert.ok(buf.length > 80_000);
    assert.equal(buf[0], 0xff);
    assert.equal(buf[1], 0xd8);
  });
});

test("understood copy shows the visitor profile, not a selector of all four", () => {
  const zen = View.understoodFor("Zen");
  assert.equal(zen.label, "Zen");
  assert.ok(zen.traits.includes("Calma"));
  assert.match(zen.summary, /silêncio/i);
  assert.equal(View.understoodFor("Cyber").label, "Cyber");
  assert.equal(View.understoodFor("missing"), null);

  const html = fs.readFileSync(new URL("../casa.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../js/casa.js", import.meta.url), "utf8");
  assert.match(html, /casa-understood-copy/);
  assert.doesNotMatch(js, /\["Zen", "Cyber", "Excentrico", "Acolhedor"\]\.forEach/);
  assert.match(js, /understoodFor/);
  assert.match(js, /houseImageFor/);
});

test("Ver tudo is a themed button that clears filters and groups filter rooms", () => {
  const html = fs.readFileSync(new URL("../casa.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../casa.css", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../js/casa.js", import.meta.url), "utf8");
  assert.match(html, /id="btn-groups-all"/);
  assert.match(html, /class="casa-ver-tudo"/);
  assert.match(css, /\.casa-ver-tudo[\s\S]*#ff1a1a/i);
  assert.doesNotMatch(css, /appearance:\s*auto/);
  assert.match(js, /btn-groups-all[\s\S]*showAllDevices|showAllDevices/);
  assert.match(js, /roomFilter = roomFilter === room/);
  const devices = [
    { label: "Luz Sala", room: "Sala", kind: "light" },
    { label: "Abajur", room: "Quarto", kind: "light" },
  ];
  assert.equal(View.matchesDeviceFilters(devices[0], { room: "Sala" }), true);
  assert.equal(View.matchesDeviceFilters(devices[1], { room: "Sala" }), false);
  assert.equal(View.matchesDeviceFilters(devices[1], { query: "aba" }), true);
  assert.equal(View.matchesDeviceFilters(devices[0], { query: "aba" }), false);
});

test("fixed dock leaves padding so chips do not cover the device list", () => {
  const css = fs.readFileSync(new URL("../casa.css", import.meta.url), "utf8");
  assert.match(css, /padding-bottom:\s*calc\(220px/);
  assert.match(css, /\.casa-dock[\s\S]*position:\s*fixed/);
});

test("voice uses Web Speech pt-BR, requests mic, and speaks the reply", () => {
  assert.equal(Voice.isSupported({}), false);
  assert.equal(Voice.isSupported({ webkitSpeechRecognition: function () {} }), true);
  assert.match(Voice.voiceErrorMessage("unsupported"), /Chrome/);
  assert.match(Voice.voiceErrorMessage("not-allowed"), /Permissão/);
  assert.match(Voice.voiceErrorMessage("denied"), /Permissão/);
  assert.equal(Voice.pickTranscript({ results: [[{ transcript: "  acende a sala  " }]] }), "acende a sala");
  assert.equal(Voice.pickTranscript({ results: [] }), "");

  let asked = false;
  let stopped = false;
  return Voice.requestMic({
    getUserMedia: async () => {
      asked = true;
      return { getTracks: () => [{ stop: () => { stopped = true; } }] };
    }
  }).then(() => {
    assert.equal(asked, true);
    assert.equal(stopped, true);
  });
});

test("casa page wires a real mic button and does not leak secrets", () => {
  const html = fs.readFileSync(new URL("../casa.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../js/casa.js", import.meta.url), "utf8");
  assert.match(html, /id="casa-dock-voice"/);
  assert.match(html, /js\/casa-voice\.js/);
  assert.match(js, /webkitSpeechRecognition|recognitionCtor/);
  assert.match(js, /pt-BR/);
  assert.match(js, /speechSynthesis/);
  assert.match(js, /\/api\/gen\/chat/);
  assert.doesNotMatch(js, /SUPABASE_SERVICE_ROLE|GROQ_API_KEY|GEMINI_API_KEY/);
});

test("brand mark uses the felt crow icon set", () => {
  const html = fs.readFileSync(new URL("../casa.html", import.meta.url), "utf8");
  const landing = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const manifest = fs.readFileSync(new URL("../site.webmanifest", import.meta.url), "utf8");
  assert.match(html, /logo-crow\.webp/);
  assert.match(html, /favicon-32\.png/);
  assert.match(html, /apple-touch-icon\.png/);
  assert.match(landing, /og-logo\.jpg/);
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-512\.png/);
  const png32 = fs.readFileSync(new URL("../assets/favicon-32.png", import.meta.url));
  const png180 = fs.readFileSync(new URL("../assets/apple-touch-icon.png", import.meta.url));
  const png192 = fs.readFileSync(new URL("../assets/icon-192.png", import.meta.url));
  const png512 = fs.readFileSync(new URL("../assets/icon-512.png", import.meta.url));
  assert.equal(png32[0], 0x89);
  assert.equal(png180[0], 0x89);
  assert.equal(png192[0], 0x89);
  assert.equal(png512[0], 0x89);
  assert.ok(png32.length > 400);
  assert.ok(png180.length > 8_000);
  assert.ok(png192.length > 10_000);
  assert.ok(png512.length > 40_000);
});
