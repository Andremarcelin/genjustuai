import test from "node:test";
import assert from "node:assert/strict";
import { defaultHouseState } from "../lib/gen/defaults.js";
import { normalizeLights } from "../lib/gen/devices.js";
import { houseStateToMaquetePayload } from "../lib/gen/maquete-payload.js";
import { publishMaqueteState } from "../lib/gen/maquete-mqtt.js";
import { createMemoryHouseStore } from "../lib/gen/house-store.js";

function baseState(overrides = {}) {
  const state = defaultHouseState("AB3K7Q");
  state.version = 4;
  state.lights = normalizeLights({
    sala_luz: { on: true, color: "#FF1A1A", intensity: 0.35 },
    quarto_luz: { on: false, color: "#00AAFF", intensity: 0.2 },
    abajur: { on: true, color: "#FFAA00", intensity: 0.45 },
    fita_led: { on: true, color: "#7C3AED", intensity: 0.55 },
    tv: { on: false, color: "#3B82F6", intensity: 0.7 },
    ar_condicionado: { on: true, temp: 17, mode: "frio", fan: "3" },
  });
  state.ambience = { preset: "night", volume: 0.2 };
  state.media = {
    type: "video",
    url: "https://archive.org/download/test/test.mp4",
    title: "Teste",
    artist: "",
    license: "",
    device: "tv",
    playing: true,
  };
  return { ...state, ...overrides };
}

test("maps real house_state lights/ambience/media into compact maquete JSON", () => {
  const payload = houseStateToMaquetePayload(baseState());
  assert.equal(payload.version, 4);
  assert.equal(payload.session, "AB3K7Q");
  assert.equal(payload.sala.on, true);
  assert.equal(payload.sala.cor, "#FF1A1A");
  assert.equal(payload.sala.brilho, Math.round(0.35 * 255));
  assert.equal(payload.quarto.on, true);
  assert.equal(payload.quarto.cor, "#FFAA00");
  assert.equal(payload.fita.on, true);
  assert.equal(payload.fita.efeito, "arcoiris");
  assert.equal(payload.fita.cores[0], "#7C3AED");
  assert.equal(payload.fita.brilho, Math.round(0.55 * 255));
  assert.equal(payload.tv.on, true);
  assert.equal(payload.ar.on, true);
  assert.equal(payload.ar.modo, "forte");
});

test("preset rain → pulsar, bamboo → time, quiet → fixo; tv from lights; ar normal", () => {
  const rain = houseStateToMaquetePayload(baseState({
    ambience: { preset: "rain", volume: 0.1 },
    media: null,
    dojo: null,
    lights: normalizeLights({
      sala_luz: { on: false, color: "#FFFFFF", intensity: 0 },
      fita_led: { on: true, color: "#112233", intensity: 1 },
      tv: { on: true },
      ar_condicionado: { on: true, temp: 24, fan: "auto" },
    }),
  }));
  assert.equal(rain.fita.efeito, "pulsar");
  assert.equal(rain.tv.on, true);
  assert.equal(rain.ar.modo, "normal");
  assert.equal(rain.sala.on, false);
  assert.equal(rain.sala.brilho, 0);

  const bamboo = houseStateToMaquetePayload(baseState({
    ambience: { preset: "bamboo", volume: 0.2 },
    media: null,
    dojo: "Excentrico",
    lights: normalizeLights({
      sala_luz: { on: true, color: "#FF1A1A", intensity: 0.5 },
      quarto_luz: { on: true, color: "#3B82F6", intensity: 0.5 },
      fita_led: { on: true, color: "#7C3AED", intensity: 0.4 },
      tv: { on: false },
    }),
  }));
  assert.equal(bamboo.fita.efeito, "time");
  assert.deepEqual(bamboo.fita.cores, ["#FF1A1A", "#3B82F6"]);
  assert.equal(bamboo.tv.on, false);

  const quiet = houseStateToMaquetePayload(baseState({
    ambience: { preset: "quiet", volume: 0 },
    media: { playing: false, device: "tv", url: "https://archive.org/download/test/test.mp3", type: "audio", title: "x" },
    lights: normalizeLights({ fita_led: { on: false, color: "#7C3AED", intensity: 0.2 } }),
  }));
  assert.equal(quiet.fita.efeito, "fixo");
  assert.equal(quiet.fita.on, false);
  assert.equal(quiet.tv.on, false);
});

test("missing MQTT env is a no-op", async () => {
  const result = await publishMaqueteState(baseState(), {
    env: {},
    connect: async () => {
      throw new Error("should not connect");
    },
  });
  assert.equal(result.skipped, "missing_env");
});

test("publish timeout does not throw", async () => {
  const result = await publishMaqueteState(baseState(), {
    env: { MQTT_URL: "wss://example.invalid:8884/mqtt" },
    timeoutMs: 50,
    fetchActive: async () => "AB3K7Q",
    connect: () => new Promise(() => {}),
  });
  assert.equal(result.skipped, "error");
  assert.match(result.error, /timeout/i);
});

test("inactive session is not published", async () => {
  const result = await publishMaqueteState(baseState(), {
    env: { MQTT_URL: "wss://example.invalid:8884/mqtt" },
    fetchActive: async () => "ZZZZZZ",
    connect: async () => {
      throw new Error("should not connect");
    },
  });
  assert.equal(result.skipped, "inactive_session");
});

test("memory house store save still succeeds when mqtt is unset", async () => {
  const store = createMemoryHouseStore();
  const saved = await store.save(defaultHouseState("AB3K7Q"), 0);
  assert.equal(saved.state.session_id, "AB3K7Q");
  assert.equal(saved.conflict, undefined);
});
