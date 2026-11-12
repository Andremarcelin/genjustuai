import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CAFE_BREW_MS, applyCafePatch, cafeCell, portaCell, ventiladorCell } from "../lib/gen/appliances.js";
import { DEVICE_IDS, applyDevicePatch, normalizeLights } from "../lib/gen/devices.js";
import { validateToolCall, TOOLS } from "../lib/gen/tools.js";
import { executeHouseTool } from "../lib/gen/executor.js";
import { createMemoryHouseStore } from "../lib/gen/house-store.js";
import { createDeviceHandler } from "../api/house/device.js";
import { defaultHouseState } from "../lib/gen/defaults.js";
import { parseHouseIntent, plannedActions } from "../lib/gen/intent.js";
import { buildSystemInstruction, describeHouseState } from "../lib/gen/persona.js";
import { houseStateToMaquetePayload } from "../lib/gen/maquete-payload.js";
import { createRateLimiter } from "../lib/gen/rate-limit.js";

const SESSION = {
  id: "AB3K7Q",
  session_code: "AB3K7Q",
  display_name: "André",
  profile_id: "Acolhedor",
  status: "active",
};

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; this.headersSent = true; return this; },
    end() { this.headersSent = true; return this; },
  };
}

test("porta cafe ventilador have defaults and stay compatible with old lights", () => {
  assert.ok(DEVICE_IDS.includes("porta"));
  assert.ok(DEVICE_IDS.includes("cafe"));
  assert.ok(DEVICE_IDS.includes("ventilador"));
  const lights = normalizeLights({});
  assert.equal(lights.porta.aberta, false);
  assert.equal(lights.porta.trancada, true);
  assert.equal(lights.cafe.estado, "desligada");
  assert.equal(lights.ventilador.vel, 0);
  const open = portaCell({ aberta: true, trancada: true });
  assert.equal(open.aberta, true);
  assert.equal(open.trancada, false);
  const fan = ventiladorCell({ vel: 3 });
  assert.equal(fan.on, true);
  assert.equal(fan.vel, 3);
});

test("cafe preparando becomes pronta after brew window", () => {
  const t0 = Date.parse("2026-11-12T16:00:00.000Z");
  const brewing = applyCafePatch({}, { estado: "preparando" }, t0);
  assert.equal(brewing.estado, "preparando");
  assert.ok(brewing.ready_at);
  const ready = cafeCell(brewing, brewing, t0 + CAFE_BREW_MS);
  assert.equal(ready.estado, "pronta");
  assert.equal(ready.ready_at, null);
});

test("set_device Zod and intent map tranca / cafe / ventilador no 2", () => {
  assert.equal(validateToolCall("set_device", { device_id: "porta", trancada: true, aberta: false }).ok, true);
  assert.equal(validateToolCall("set_device", { device_id: "cafe", estado: "preparando" }).ok, true);
  assert.equal(validateToolCall("set_device", { device_id: "ventilador", vel: 2 }).ok, true);
  assert.equal(validateToolCall("set_device", { device_id: "ventilador", vel: 9 }).ok, false);
  const lock = parseHouseIntent("tranca a porta");
  assert.equal(lock.device, "porta");
  assert.equal(lock.portaLock, true);
  const visit = parseHouseIntent("abre a porta pra visita");
  assert.equal(visit.device, "porta");
  assert.equal(visit.portaOpen, true);
  const coffee = parseHouseIntent("faz um café");
  assert.equal(coffee.device, "cafe");
  const fan = parseHouseIntent("liga o ventilador no 2");
  assert.equal(fan.device, "ventilador");
  assert.equal(fan.fanVel, 2);
  const plan = plannedActions(fan, defaultHouseState("AB3K7Q"));
  assert.equal(plan[0].args.vel, 2);
  const setDevice = TOOLS.find((tool) => tool.name === "set_device");
  assert.ok(setDevice.parameters.properties.aberta);
  assert.ok(setDevice.parameters.properties.estado.enum.includes("preparando"));
  assert.equal(setDevice.parameters.properties.vel.type, "integer");
  assert.equal(setDevice.parameters.properties.vel.minimum, 0);
  assert.equal(setDevice.parameters.properties.vel.maximum, 3);
});

test("POST /api/house/device and executor persist appliances", async () => {
  const store = createMemoryHouseStore();
  await store.save(defaultHouseState("AB3K7Q"), 0);
  const handler = createDeviceHandler({
    loadSession: async () => ({ session: SESSION }),
    store,
    limiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: () => Date.parse("2026-11-12T16:00:00.000Z"),
  });
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { device_id: "porta", aberta: true },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.state.lights.porta.aberta, true);
  assert.equal(res.body.state.lights.porta.trancada, false);

  const coffee = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "set_device",
    args: { device_id: "cafe", estado: "preparando" },
    store,
    limiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: Date.parse("2026-11-12T16:00:00.000Z"),
  });
  assert.equal(coffee.status, "accepted");
  assert.equal(coffee.state.lights.cafe.estado, "preparando");

  const fan = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "set_device",
    args: { device_id: "ventilador", vel: 2 },
    store,
    limiter: createRateLimiter({ limit: 20, windowMs: 60_000 }),
    now: Date.parse("2026-11-12T16:01:00.000Z"),
  });
  assert.equal(fan.state.lights.ventilador.vel, 2);
});

test("MQTT payload adds porta cafe ventilador without dropping old keys", () => {
  const state = applyDevicePatch(defaultHouseState("AB3K7Q"), { device_id: "porta", aberta: true });
  const withCafe = applyDevicePatch({ lights: state.lights, ambience: {} }, { device_id: "cafe", estado: "pronta" });
  const withFan = applyDevicePatch({ lights: withCafe.lights, ambience: {} }, { device_id: "ventilador", vel: 1 });
  const payload = houseStateToMaquetePayload({
    session_id: "AB3K7Q",
    version: 8,
    lights: withFan.lights,
  });
  assert.equal(payload.porta.aberta, true);
  assert.equal(payload.porta.trancada, false);
  assert.equal(payload.cafe.estado, "pronta");
  assert.equal(payload.ventilador.vel, 1);
  assert.ok(payload.sala);
  assert.ok(payload.tv);
  assert.ok(payload.ar);
});

test("persona lists appliances and door caution; UI copy is pt-BR", () => {
  const prompt = buildSystemInstruction(SESSION, defaultHouseState("AB3K7Q"), "");
  assert.match(prompt, /porta/);
  assert.match(prompt, /desconhecido/);
  assert.match(prompt, /cafeteira|cafe/i);
  assert.match(prompt, /ventilador/);
  assert.match(describeHouseState(defaultHouseState("AB3K7Q")), /porta fechada trancada/);
  const js = fs.readFileSync(new URL("../js/casa.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../casa.html", import.meta.url), "utf8");
  const admin = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  assert.match(js, /Fazer café/);
  assert.match(js, /Destrancar|Trancar/);
  assert.match(html, /Cafeteira/);
  assert.match(admin, /Fazer café/);
  assert.doesNotMatch(js, /Quest/);
  const sql = fs.readFileSync(new URL("../sql/house_appliances.sql", import.meta.url), "utf8");
  assert.match(sql, /porta_cell_valid/);
  assert.match(sql, /not \(lights \? 'porta'\)/);
});
