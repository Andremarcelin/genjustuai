#!/usr/bin/env node
import mqtt from "mqtt";
import { defaultHouseState } from "../lib/gen/defaults.js";
import { normalizeLights } from "../lib/gen/devices.js";
import { houseStateToMaquetePayload } from "../lib/gen/maquete-payload.js";
import { publishMaqueteState } from "../lib/gen/maquete-mqtt.js";

const topic = process.env.MQTT_TOPIC || `genjutsu/maquete/teste-${Math.random().toString(16).slice(2, 10)}`;
const url = process.env.MQTT_URL || "wss://broker.hivemq.com:8884/mqtt";
const session = "TSTQ1A";

const state = defaultHouseState(session);
state.version = 42;
state.lights = normalizeLights({
  sala_luz: { on: true, color: "#FF1A1A", intensity: 0.4 },
  quarto_luz: { on: false, color: "#FF1A1A", intensity: 0.2 },
  fita_led: { on: true, color: "#7C3AED", intensity: 0.7 },
  tv: { on: true },
  ar_condicionado: { on: true, temp: 17, fan: "3" },
});
state.ambience = { preset: "night", volume: 0.1 };
const expected = houseStateToMaquetePayload(state);

const received = [];
const client = await mqtt.connectAsync(url, {
  protocolVersion: 4,
  connectTimeout: 8000,
  reconnectPeriod: 0,
  rejectUnauthorized: process.env.MQTT_TLS_INSECURE === "1" ? false : true,
  clientId: `genjutsu-roundtrip-sub-${Math.random().toString(16).slice(2, 8)}`,
});

await client.subscribeAsync(topic, { qos: 1 });
client.on("message", (t, payload) => {
  received.push({ topic: t, body: payload.toString("utf8") });
});

const published = await publishMaqueteState(state, {
  env: {
    MQTT_URL: url,
    MQTT_USERNAME: process.env.MQTT_USERNAME || "",
    MQTT_PASSWORD: process.env.MQTT_PASSWORD || "",
    MQTT_TOPIC: topic,
    MQTT_TLS_INSECURE: process.env.MQTT_TLS_INSECURE || "",
  },
  fetchActive: async () => session,
  timeoutMs: 8000,
});

const deadline = Date.now() + 8000;
while (!received.length && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 100));
}

await client.endAsync();

if (!published.ok) {
  console.error("publish_failed", published);
  process.exit(1);
}
if (!received.length) {
  console.error("no_message", { topic, published });
  process.exit(1);
}
const body = JSON.parse(received[0].body);
if (body.version !== expected.version || body.session !== expected.session) {
  console.error("mismatch", body, expected);
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  topic,
  url,
  payload: body,
}, null, 2));
