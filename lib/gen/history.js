import { supabaseRest } from "../supabase-rest.cjs";

const SOURCES = new Set(["chat", "voice", "quest", "house"]);
const ROLES = new Set(["visitor", "gen", "house"]);
const KINDS = new Set(["transcript", "reply", "action"]);

export function describeAction(tool, args) {
  const name = String(tool || "");
  const bag = args && typeof args === "object" ? args : {};
  if (name === "set_device") {
    const id = typeof bag.device_id === "string" ? bag.device_id : "";
    if (id === "sala_luz") return "Ajustou a Luz Sala.";
    if (id === "quarto_luz") return "Ajustou a Luz Quarto.";
    if (id === "abajur") return "Ajustou o abajur.";
    if (id === "fita_led") return "Ajustou a fita LED.";
    if (id === "tv") return "Ajustou a TV.";
    if (id === "ambiente") return "Ajustou o ambiente.";
    return "Ajustou um dispositivo da casa.";
  }
  if (name === "set_lights") return "Ajustou a luz da casa.";
  if (name === "set_ambience") {
    if (bag.preset === "bamboo") return "Colocou o som de bambu.";
    if (bag.preset === "rain") return "Colocou o som de chuva.";
    if (bag.preset === "night") return "Deixou o som de noite.";
    if (bag.preset === "quiet") return "Deixou a casa quieta.";
    return "Trocou o som da casa.";
  }
  if (name === "switch_dojo") {
    const dojo = typeof bag.dojo === "string" ? bag.dojo.trim() : "";
    return dojo ? `Abriu o dojo ${dojo}.` : "Trocou o dojo.";
  }
  if (name === "play_music") return "Tocou música na TV.";
  if (name === "open_video") return "Abriu um vídeo na TV.";
  if (name === "stop_media" || name === "control_media") return "Ajustou a mídia da TV.";
  if (name === "web_search") return "Pesquisou na internet.";
  return "A casa respondeu.";
}

function clip(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 2000);
}

export function historyRows({ source, transcript, reply, actions }) {
  const from = SOURCES.has(source) ? source : "house";
  const rows = [];
  const said = clip(transcript);
  const answer = clip(reply);
  if (said) rows.push({ source: from, role: "visitor", kind: "transcript", body: said, tool: null, args: {} });
  if (answer) rows.push({ source: from, role: "gen", kind: "reply", body: answer, tool: null, args: {} });
  for (const action of actions || []) {
    if (!action || action.status !== "accepted") continue;
    const tool = String(action.tool || "");
    if (!tool || tool === "get_house_state" || tool === "list_devices" || tool === "web_search") continue;
    const args = action.args && typeof action.args === "object" && !Array.isArray(action.args) ? action.args : {};
    rows.push({
      source: from,
      role: "house",
      kind: "action",
      body: describeAction(tool, args),
      tool: tool.slice(0, 64),
      args,
    });
  }
  return rows;
}

export function voiceLine(input) {
  const role = input?.role === "gen" ? "gen" : input?.role === "visitor" ? "visitor" : "";
  const kind = role === "gen" ? "reply" : role === "visitor" ? "transcript" : "";
  const body = clip(input?.body);
  if (!role || !kind || !body) return null;
  if (input?.source && input.source !== "voice") return null;
  return { source: "voice", role, kind, body, tool: null, args: {} };
}

export function publicHistoryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    session_code: row.session_code,
    source: row.source,
    role: row.role,
    kind: row.kind,
    body: row.body,
    tool: row.tool || null,
    created_at: row.created_at,
  };
}

async function ownerOf(sessionCode, env) {
  const code = String(sessionCode || "").trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return "";
  const found = await supabaseRest(
    `session_summaries?session_code=eq.${encodeURIComponent(code)}&select=user_id`,
    { serviceRoleOnly: true, env }
  );
  if (!found.ok) return "";
  const row = Array.isArray(found.json) ? found.json[0] : null;
  return row?.user_id || "";
}

export async function recordSessionHistory({ env, sessionCode, source, transcript, reply, actions, rows, expectedUserId }) {
  const built = rows || historyRows({ source, transcript, reply, actions });
  if (!built.length) return { ok: true, skipped: true };
  const owner = await ownerOf(sessionCode, env);
  if (!owner) return { ok: true, skipped: true };
  if (expectedUserId && expectedUserId !== owner) return { ok: false, error: "forbidden" };
  const code = String(sessionCode).trim().toUpperCase();
  const body = built.map((row) => ({
    user_id: owner,
    session_code: code,
    source: SOURCES.has(row.source) ? row.source : "house",
    role: ROLES.has(row.role) ? row.role : "house",
    kind: KINDS.has(row.kind) ? row.kind : "action",
    body: clip(row.body),
    tool: row.tool || null,
    args: row.args && typeof row.args === "object" ? row.args : {},
  })).filter((row) => row.body);
  if (!body.length) return { ok: true, skipped: true };
  const inserted = await supabaseRest("gen_history", {
    method: "POST",
    serviceRoleOnly: true,
    env,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
  });
  if (!inserted.ok) return { ok: false, error: inserted.error || "supabase_unreachable" };
  return { ok: true };
}

const RECENT_TURNS = 8;
const MEMORY_CHARS = 2800;

function speaker(row) {
  if (row.role === "gen") return "Gen";
  if (row.role === "house") return "Casa";
  return "Pessoa";
}

export function composeMemory(entries, options = {}) {
  const recentCount = options.recentTurns ?? RECENT_TURNS;
  const budget = options.budgetChars ?? MEMORY_CHARS;
  const rows = (Array.isArray(entries) ? entries : []).filter((row) => row && clip(row.body));
  if (!rows.length) return "";
  const keep = Math.max(1, recentCount);
  const recent = rows.slice(-keep);
  const older = rows.slice(0, Math.max(0, rows.length - recent.length));
  const lines = [];
  const olderTalk = older.filter((row) => row.kind !== "action").length;
  const olderActions = [];
  for (const row of older) {
    if (row.kind !== "action") continue;
    const text = clip(row.body).slice(0, 120);
    if (text && !olderActions.includes(text)) olderActions.push(text);
  }
  if (olderTalk || olderActions.length) {
    const bits = [];
    if (olderTalk) bits.push(`${olderTalk} falas anteriores`);
    if (olderActions.length) bits.push(`a casa já fez: ${olderActions.slice(0, 6).join("; ")}`);
    lines.push(`Resumo do que ficou para trás: ${bits.join(". ")}.`);
  }
  for (const row of recent) {
    lines.push(`${speaker(row)}: ${clip(row.body).slice(0, 240)}`);
  }
  let start = 0;
  let text = lines.join("\n");
  while (text.length > budget && start < lines.length - 1) {
    start += 1;
    text = lines.slice(start).join("\n");
  }
  return text.slice(0, budget);
}

export async function loadMemoryForSession({ env, sessionCode }) {
  const owner = await ownerOf(sessionCode, env);
  if (!owner) return "";
  const found = await listHistory({ env, userId: owner, sessionCode });
  if (!found.ok) return "";
  return composeMemory(found.entries);
}

export async function listHistory({ env, userId, sessionCode }) {
  const uid = String(userId || "").trim();
  if (!uid) return { ok: false, error: "unauthorized" };
  let path = `gen_history?user_id=eq.${encodeURIComponent(uid)}&select=id,session_code,source,role,kind,body,tool,created_at&order=created_at.asc&limit=200`;
  const code = String(sessionCode || "").trim().toUpperCase();
  if (code) {
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return { ok: false, error: "invalid_code" };
    path += `&session_code=eq.${encodeURIComponent(code)}`;
  }
  const found = await supabaseRest(path, { serviceRoleOnly: true, env });
  if (!found.ok) return { ok: false, error: found.error || "supabase_unreachable", status: found.status };
  const rows = Array.isArray(found.json) ? found.json.map(publicHistoryRow) : [];
  return { ok: true, entries: rows };
}
