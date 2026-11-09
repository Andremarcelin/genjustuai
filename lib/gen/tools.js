import { z } from "zod";
import { DEVICE_IDS } from "./devices.js";

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const setLights = z.object({
  zone: z.enum(["main", "lanterns"]),
  intensity: z.number().min(0).max(1),
  color,
  transition_ms: z.number().int().min(300).max(5000),
}).strict();

const setAmbience = z.object({
  preset: z.enum(["quiet", "rain", "bamboo", "night"]),
  volume: z.number().min(0).max(0.5),
  transition_ms: z.number().int().min(500).max(5000),
}).strict();

const switchDojo = z.object({
  dojo: z.enum(["Zen", "Cyber", "Excentrico", "Acolhedor"]),
  transition_ms: z.number().int().min(2000).max(8000),
}).strict();

const getHouseState = z.object({}).strict();

const listDevices = z.object({}).strict();

const setDevice = z.object({
  device_id: z.enum(DEVICE_IDS),
  on: z.boolean().optional(),
  color: color.optional(),
  intensity: z.number().min(0).max(1).optional(),
}).strict().refine(
  (value) => value.on !== undefined || value.color !== undefined || value.intensity !== undefined,
  { message: "empty_patch" },
);

const ZOD = {
  get_house_state: getHouseState,
  list_devices: listDevices,
  set_device: setDevice,
  set_lights: setLights,
  set_ambience: setAmbience,
  switch_dojo: switchDojo,
};

export const TOOLS = [
  {
    name: "get_house_state",
    description: "Lê o estado atual da casa: modo hub ou dojo, luzes e ambiência. Não muda nada.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    name: "list_devices",
    description: "Lista os dispositivos da Casa com id, cômodo, ligado, cor hex e intensidade. Não muda nada.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    name: "set_device",
    description: "Liga, desliga, pinta ou regula um dispositivo. device_id: sala_luz, quarto_luz, abajur, fita_led, tv, ambiente. color é #RRGGBB. intensity de 0 a 1. 'deixa a sala vermelha' usa sala_luz com color #FF1A1A e on true. Só afirme a mudança depois de status accepted.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        device_id: {
          type: "string",
          enum: DEVICE_IDS,
          description: "sala_luz, quarto_luz, abajur, fita_led, tv ou ambiente.",
        },
        on: { type: "boolean", description: "Liga ou desliga." },
        color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$", description: "Cor em #RRGGBB." },
        intensity: { type: "number", minimum: 0, maximum: 1, description: "Brilho de 0 a 1." },
      },
      required: ["device_id"],
    },
  },
  {
    name: "set_lights",
    description: "Muda a luz de uma zona (main ou lanterns). intensity vai de 0 a 1, color é #RRGGBB, transition_ms vai de 300 a 5000. Só afirme a mudança depois de status accepted.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        zone: { type: "string", enum: ["main", "lanterns"], description: "Zona da luz: main ou lanterns." },
        intensity: { type: "number", minimum: 0, maximum: 1, description: "Intensidade de 0 a 1." },
        color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$", description: "Cor em #RRGGBB." },
        transition_ms: { type: "integer", minimum: 300, maximum: 5000, description: "Duração da transição, de 300 a 5000 ms." },
      },
      required: ["zone", "intensity", "color", "transition_ms"],
    },
  },
  {
    name: "set_ambience",
    description: "Troca o som ambiente. preset é quiet, rain, bamboo ou night. volume vai de 0 a 0.5. transition_ms vai de 500 a 5000.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        preset: { type: "string", enum: ["quiet", "rain", "bamboo", "night"], description: "Preset sonoro." },
        volume: { type: "number", minimum: 0, maximum: 0.5, description: "Volume de 0 a 0.5." },
        transition_ms: { type: "integer", minimum: 500, maximum: 5000, description: "Duração da transição, de 500 a 5000 ms." },
      },
      required: ["preset", "volume", "transition_ms"],
    },
  },
  {
    name: "switch_dojo",
    description: "Muda só a cena visual para Zen, Cyber, Excentrico ou Acolhedor. Não altera o perfil da pessoa. transition_ms vai de 2000 a 8000.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        dojo: { type: "string", enum: ["Zen", "Cyber", "Excentrico", "Acolhedor"], description: "Cena visual. Não é o perfil." },
        transition_ms: { type: "integer", minimum: 2000, maximum: 8000, description: "Duração da transição, de 2000 a 8000 ms." },
      },
      required: ["dojo", "transition_ms"],
    },
  },
];

const NUMERIC = {
  set_lights: ["intensity", "transition_ms"],
  set_ambience: ["volume", "transition_ms"],
  switch_dojo: ["transition_ms"],
  set_device: ["intensity"],
};

const BOOLEAN = {
  set_device: ["on"],
};

function coerceArgs(tool, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  const copy = { ...args };
  for (const key of NUMERIC[tool] || []) {
    if (typeof copy[key] === "string" && copy[key].trim() !== "") {
      const value = Number(copy[key]);
      if (Number.isFinite(value)) copy[key] = value;
    }
  }
  for (const key of BOOLEAN[tool] || []) {
    if (copy[key] === "true") copy[key] = true;
    if (copy[key] === "false") copy[key] = false;
  }
  return copy;
}

export function validateToolCall(tool, args) {
  const schema = ZOD[tool];
  if (!schema) return { ok: false, reason: "unknown_tool" };
  const parsed = schema.safeParse(coerceArgs(tool, args ?? {}));
  if (!parsed.success) return { ok: false, reason: "invalid_args" };
  return { ok: true, tool, args: parsed.data };
}

function geminiType(schema) {
  if (schema.type === "integer") return "INTEGER";
  if (schema.type === "number") return "NUMBER";
  if (schema.type === "string") return "STRING";
  return "OBJECT";
}

function toGeminiSchema(schema) {
  const out = { type: geminiType(schema) };
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.properties) {
    out.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      out.properties[key] = toGeminiSchema(value);
    }
  }
  if (Array.isArray(schema.required) && schema.required.length) out.required = schema.required;
  return out;
}

export function toGeminiDeclarations(tools = TOOLS) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toGeminiSchema(tool.parameters),
  }));
}

export function toGroqTools(tools = TOOLS) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
