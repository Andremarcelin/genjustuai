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
  temp: z.number().min(16).max(30).optional(),
  mode: z.enum(["frio", "ventilar", "seco"]).optional(),
  fan: z.enum(["auto", "1", "2", "3"]).optional(),
}).strict().refine(
  (value) => value.on !== undefined
    || value.color !== undefined
    || value.intensity !== undefined
    || value.temp !== undefined
    || value.mode !== undefined
    || value.fan !== undefined,
  { message: "empty_patch" },
);

const routineAction = z.object({
  tool: z.enum(["set_device", "play_music", "stop_media", "set_ambience"]),
  args: z.record(z.any()).optional(),
}).strict();

const createRoutine = z.object({
  name: z.string().min(1).max(80),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59).optional(),
  days: z.array(z.number().int().min(0).max(6)).optional(),
  actions: z.array(routineAction).min(1).max(8),
  enabled: z.boolean().optional(),
  once: z.boolean().optional(),
}).strict();

const listRoutines = z.object({}).strict();

const deleteRoutine = z.object({
  id: z.string().min(1).max(80),
}).strict();

const playMusic = z.object({
  query: z.string().max(120).optional(),
  mood: z.string().max(40).optional(),
}).strict();

const openVideo = z.object({
  query: z.string().min(1).max(120),
}).strict();

const stopMedia = z.object({}).strict();

const webSearch = z.object({
  query: z.string().min(1).max(120),
}).strict();

const getWeather = z.object({
  city: z.string().min(1).max(80).optional(),
}).strict();

const controlMedia = z.object({
  playing: z.boolean().optional(),
  stop: z.boolean().optional(),
}).strict().refine(
  (value) => value.playing !== undefined || value.stop !== undefined,
  { message: "empty_patch" },
);

const ZOD = {
  get_house_state: getHouseState,
  list_devices: listDevices,
  set_device: setDevice,
  set_lights: setLights,
  set_ambience: setAmbience,
  switch_dojo: switchDojo,
  play_music: playMusic,
  open_video: openVideo,
  stop_media: stopMedia,
  web_search: webSearch,
  get_weather: getWeather,
  control_media: controlMedia,
  create_routine: createRoutine,
  list_routines: listRoutines,
  delete_routine: deleteRoutine,
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
    description: "Liga, desliga, pinta ou regula um dispositivo. device_id: sala_luz, quarto_luz, abajur, fita_led, tv, ambiente, ar_condicionado. Ar: temp 16-30, mode frio|ventilar|seco, fan auto|1|2|3. 'liga o ar no 20' usa ar_condicionado on true temp 20. Só afirme depois de status accepted.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        device_id: {
          type: "string",
          enum: DEVICE_IDS,
          description: "sala_luz, quarto_luz, abajur, fita_led, tv, ambiente ou ar_condicionado.",
        },
        on: { type: "boolean", description: "Liga ou desliga." },
        color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$", description: "Cor em #RRGGBB." },
        intensity: { type: "number", minimum: 0, maximum: 1, description: "Brilho de 0 a 1." },
        temp: { type: "number", minimum: 16, maximum: 30, description: "Temperatura do ar, 16 a 30 °C." },
        mode: { type: "string", enum: ["frio", "ventilar", "seco"], description: "Modo do ar." },
        fan: { type: "string", enum: ["auto", "1", "2", "3"], description: "Ventilação do ar." },
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
  {
    name: "play_music",
    description: "Toca música livre (Internet Archive ou Jamendo) na TV. query é o pedido (ex. jazz, lo-fi). mood opcional. Sem YouTube. Só afirme depois de status accepted, com título e licença.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "Busca da faixa." },
        mood: { type: "string", description: "Humor: calmo, synthwave, jazz, acústico." },
      },
      required: [],
    },
  },
  {
    name: "open_video",
    description: "Abre um vídeo com licença livre do Internet Archive na TV. query obrigatória. Sem YouTube. Só afirme depois de status accepted.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "Busca do vídeo." },
      },
      required: ["query"],
    },
  },
  {
    name: "stop_media",
    description: "Pausa a mídia da TV ou do ambiente. Não muda a luz.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_weather",
    description: "Clima agora via Open-Meteo (sem chave). city opcional; se vazio usa a cidade da sessão. Use para clima, tempo, vai chover, preciso sair. Responda em pt-BR com temperatura e se leva casaco.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        city: { type: "string", description: "Cidade. Vazio usa a da sessão." },
      },
      required: [],
    },
  },
  {
    name: "web_search",
    description: "Pesquisa fatos atuais (notícia, jogo, preço, hoje, agora). No servidor usa Gemini Google Search grounding. Cite 1-2 fontes. Não use para clima — use get_weather.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "Pergunta ou termo." },
      },
      required: ["query"],
    },
  },
  {
    name: "create_routine",
    description: "Cria uma rotina em America/Sao_Paulo. hour 0-23, minute 0-59, days 0=domingo..6=sábado. once true para um disparo. actions é SEMPRE um array de {tool, args}. Exemplo: {\"name\":\"Jogo\",\"hour\":21,\"minute\":30,\"once\":true,\"actions\":[{\"tool\":\"set_device\",\"args\":{\"device_id\":\"ar_condicionado\",\"on\":true,\"temp\":20}},{\"tool\":\"set_device\",\"args\":{\"device_id\":\"sala_luz\",\"on\":true}}]}. Não envie actions como objeto solto nem um patch de dispositivo no topo.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", description: "Nome curto da rotina." },
        hour: { type: "integer", minimum: 0, maximum: 23 },
        minute: { type: "integer", minimum: 0, maximum: 59 },
        days: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 6 },
          description: "Dias da semana, 0-6.",
        },
        actions: {
          type: "array",
          description: "Lista de {tool, args}.",
          items: {
            type: "object",
            properties: {
              tool: {
                type: "string",
                enum: ["set_device", "play_music", "stop_media", "set_ambience"],
              },
              args: { type: "object", description: "Argumentos da ferramenta." },
            },
            required: ["tool"],
          },
        },
        enabled: { type: "boolean" },
        once: { type: "boolean", description: "true = dispara uma vez." },
      },
      required: ["name", "hour", "actions"],
    },
  },
  {
    name: "list_routines",
    description: "Lista as rotinas da pessoa. Não muda nada.",
    parameters: { type: "object", additionalProperties: false, properties: {}, required: [] },
  },
  {
    name: "delete_routine",
    description: "Apaga uma rotina pelo id.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

const NUMERIC = {
  set_lights: ["intensity", "transition_ms"],
  set_ambience: ["volume", "transition_ms"],
  switch_dojo: ["transition_ms"],
  set_device: ["intensity", "temp"],
  create_routine: ["hour", "minute"],
};

const BOOLEAN = {
  set_device: ["on"],
  control_media: ["playing", "stop"],
  create_routine: ["enabled", "once"],
};

const ACTION_TOOLS = new Set(["set_device", "play_music", "stop_media", "set_ambience"]);

function asAction(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  if (typeof entry.tool === "string" && ACTION_TOOLS.has(entry.tool)) {
    const args = entry.args && typeof entry.args === "object" && !Array.isArray(entry.args)
      ? entry.args
      : {};
    return { tool: entry.tool, args };
  }
  if (typeof entry.device_id === "string") {
    return { tool: "set_device", args: entry };
  }
  return null;
}

export function normalizeCreateRoutineArgs(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const copy = { ...raw };
  let list = copy.actions;
  if (list && typeof list === "object" && !Array.isArray(list)) {
    if (list.tool || list.device_id) list = [list];
    else list = Object.values(list);
  }
  if (!list && typeof copy.device_id === "string") {
    const { name, hour, minute, days, enabled, once, device_id, ...rest } = copy;
    list = [{ device_id, ...rest }];
    copy.name = name;
    copy.hour = hour;
    copy.minute = minute;
    copy.days = days;
    copy.enabled = enabled;
    copy.once = once;
    delete copy.device_id;
    delete copy.on;
    delete copy.temp;
    delete copy.mode;
    delete copy.fan;
    delete copy.color;
    delete copy.intensity;
  }
  if (Array.isArray(list)) {
    copy.actions = list.map(asAction).filter(Boolean);
  }
  return copy;
}

function coerceArgs(tool, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  const copy = tool === "create_routine" ? normalizeCreateRoutineArgs(args) : { ...args };
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
  if (!parsed.success) {
    const issue = parsed.error?.issues?.[0];
    if (issue?.message === "empty_patch") return { ok: false, reason: "empty_patch" };
    return { ok: false, reason: "invalid_args" };
  }
  return { ok: true, tool, args: parsed.data };
}

function geminiType(schema) {
  const t = String(schema?.type || "").toLowerCase();
  if (t === "integer") return "INTEGER";
  if (t === "number") return "NUMBER";
  if (t === "string") return "STRING";
  if (t === "boolean") return "BOOLEAN";
  if (t === "array") return "ARRAY";
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
  if (schema.items) out.items = toGeminiSchema(schema.items);
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
