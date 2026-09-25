const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/i;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const code = String(req.query.code || "").trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    res.status(400).json({ error: "invalid_code" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: "missing_config" });
    return;
  }

  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/session_summaries?session_code=eq.${encodeURIComponent(code)}&select=session_code,display_name,personality_text,archetype`;
  const upstream = await fetch(url, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  });

  if (!upstream.ok) {
    res.status(502).json({ error: "upstream" });
    return;
  }

  const rows = await upstream.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  res.status(200).json({
    session_code: row.session_code,
    display_name: row.display_name,
    personality_text: row.personality_text,
    archetype: row.archetype,
  });
}
