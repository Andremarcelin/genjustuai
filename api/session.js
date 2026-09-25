const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/i;

function cors(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Origin", "*");
}

async function restGet(path) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) return { error: "missing_config", status: 500 };
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`;
  const upstream = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!upstream.ok) return { error: "upstream", status: 502 };
  return { data: await upstream.json() };
}

async function summaryFor(code) {
  const q = `session_summaries?session_code=eq.${encodeURIComponent(code)}&select=session_code,display_name,personality_text,archetype`;
  const result = await restGet(q);
  if (result.error) return result;
  const row = Array.isArray(result.data) ? result.data[0] : null;
  if (!row) return { error: "not_found", status: 404 };
  return {
    data: {
      session_code: row.session_code,
      display_name: row.display_name,
      personality_text: row.personality_text,
      archetype: row.archetype,
    },
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  let code = String(req.query.code || "").trim().toUpperCase();
  if (!code) {
    const state = await restGet("app_state?id=eq.1&select=current_session_code");
    if (state.error) {
      res.status(state.status).json({ error: state.error });
      return;
    }
    const row = Array.isArray(state.data) ? state.data[0] : null;
    code = (row && row.current_session_code) ? String(row.current_session_code).toUpperCase() : "";
    if (!code) {
      res.status(404).json({ error: "no_current_session" });
      return;
    }
  }

  if (!CODE_RE.test(code)) {
    res.status(400).json({ error: "invalid_code" });
    return;
  }

  const found = await summaryFor(code);
  if (found.error) {
    res.status(found.status).json({ error: found.error });
    return;
  }
  res.status(200).json(found.data);
}
