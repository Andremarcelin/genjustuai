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
  assert.match(css, /padding-bottom:\s*calc\(168px/);
  assert.match(css, /\.casa-preview[\s\S]*padding-bottom:\s*calc\(96px/);
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

test("casa lights are per-device glows, not rectangular room fills", () => {
  const html = fs.readFileSync(new URL("../casa.html", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../casa.css", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../js/casa.js", import.meta.url), "utf8");
  assert.match(html, /id="casa-lights"/);
  assert.doesNotMatch(html, /overlay-quarto/);
  assert.doesNotMatch(css, /clip-path:\s*polygon/);
  assert.match(css, /mix-blend-mode:\s*screen/);
  assert.match(css, /mix-blend-mode:\s*color/);
  assert.match(css, /mix-blend-mode:\s*overlay/);
  assert.match(css, /mix-blend-mode:\s*color-dodge/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /casa-tv-flicker/);
  assert.match(js, /lightLayersFor/);
  assert.match(js, /lightLayerStyle/);
  assert.match(js, /demoLightsFromScene/);

  ["Zen", "Cyber", "Excentrico", "Acolhedor"].forEach((profile) => {
    const layers = View.lightLayersFor(profile);
    const devices = new Set(layers.map((layer) => layer.device));
    ["sala_luz", "quarto_luz", "abajur", "fita_led", "tv", "ambiente", "ar_condicionado"].forEach((id) => {
      assert.equal(devices.has(id), true, profile + " missing " + id);
    });
    assert.ok(layers.some((layer) => layer.device === "fita_led" && layer.kind === "strip"));
    assert.ok(layers.some((layer) => layer.device === "fita_led" && layer.kind === "spill"));
    assert.ok(layers.some((layer) => layer.device === "sala_luz" && layer.kind === "wash"));
    assert.ok(layers.some((layer) => layer.device === "sala_luz" && layer.kind === "pool"));
    assert.ok(layers.some((layer) => layer.device === "abajur" && layer.kind === "pool"));
    assert.ok(layers.some((layer) => layer.device === "tv" && layer.kind === "tv"));
    layers.forEach((layer) => {
      assert.ok(layer.x >= 0 && layer.x <= 100);
      assert.ok(layer.y >= 0 && layer.y <= 100);
      assert.ok(layer.w > 0 && layer.h > 0);
    });
  });

  const on = { id: "sala_luz", on: true, color: "#FF1A1A", intensity: 0.9 };
  const off = { id: "sala_luz", on: false, color: "#FF1A1A", intensity: 0.9 };
  const bloom = View.lightLayersFor("Acolhedor").find((layer) => layer.id === "sala-lantern");
  const lit = View.lightLayerStyle(bloom, on, { dark: false, brightness: 0.9 });
  const dark = View.lightLayerStyle(bloom, off, { dark: true, brightness: 0.2 });
  assert.ok(Number(lit.opacity) > 0.7);
  assert.equal(dark.opacity, "0");
  assert.match(lit.background, /radial-gradient/);
  assert.match(lit.background, /255,\s*26,\s*26/);

  const strip = View.lightLayersFor("Acolhedor").find((layer) => layer.kind === "strip");
  const purple = View.lightLayerStyle(strip, { on: true, color: "#7C3AED", intensity: 0.85 });
  assert.match(purple.background, /linear-gradient/);

  const ambientOff = View.frameAmbient([{ id: "sala_luz", on: false, intensity: 0.9 }]);
  const ambientOn = View.frameAmbient([{ id: "sala_luz", on: true, intensity: 0.9 }]);
  assert.equal(ambientOff.dark, true);
  assert.ok(ambientOff.brightness < 0.28);
  assert.ok(ambientOn.brightness > 0.85);
  assert.ok(ambientOff.brightness < ambientOn.brightness);

  const wash = View.lightLayersFor("Acolhedor").find((layer) => layer.id === "sala-wash");
  const washOn = View.lightLayerStyle(wash, on, { dark: false, brightness: 0.9 });
  assert.ok(Number(washOn.opacity) > 0.7);
  const darken = View.lightLayersFor("Acolhedor").find((layer) => layer.kind === "darken");
  const night = View.lightLayerStyle(darken, { on: false }, { dark: true, brightness: 0.2 });
  assert.ok(Number(night.opacity) > 0.8);

  const sala = View.demoLightsFromScene("sala_red");
  assert.equal(sala.sala_luz.on, true);
  assert.equal(sala.sala_luz.color, "#FF1A1A");
  assert.equal(sala.abajur.on, false);
  const warm = View.demoLightsFromScene("abajur_warm");
  assert.equal(warm.abajur.on, true);
  assert.equal(warm.abajur.color, "#FFAA00");
  const led = View.demoLightsFromScene("led_purple");
  assert.equal(led.fita_led.on, true);
  assert.equal(led.fita_led.color, "#7C3AED");
  const allOff = View.demoLightsFromScene("off");
  assert.equal(allOff.sala_luz.on, false);
  assert.equal(allOff.tv.on, false);
  assert.equal(allOff.ar_condicionado.on, false);
});

test("user-visible casa rail only lists Início and Casa", () => {
  const html = fs.readFileSync(new URL("../casa.html", import.meta.url), "utf8");
  const nav = html.match(/<nav>[\s\S]*?<\/nav>/)[0];
  assert.match(nav, /Início/);
  assert.match(nav, /Casa/);
  assert.doesNotMatch(nav, />Gen</);
  assert.doesNotMatch(nav, />Admin</);
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
