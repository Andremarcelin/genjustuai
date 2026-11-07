import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { historyRows, voiceLine } from "../lib/gen/history.js";

test("history rows keep the visitor, Gen and accepted house actions", () => {
  const rows = historyRows({
    source: "chat",
    transcript: "deixa a luz quente",
    reply: "Pronto. Deixei a luz quentinha.",
    actions: [
      { tool: "get_house_state", status: "accepted", args: {} },
      { tool: "set_lights", status: "accepted", args: { color: "#FFAA00" } },
      { tool: "set_ambience", status: "rejected", args: { preset: "bamboo" } },
    ],
  });
  assert.deepEqual(rows.map((row) => row.role), ["visitor", "gen", "house"]);
  assert.equal(rows[2].body, "Ajustou a luz da casa.");
  assert.doesNotMatch(rows[2].body, /#FFAA00/);
  assert.equal(voiceLine({ source: "voice", role: "visitor", body: "oi" }).kind, "transcript");
  assert.equal(voiceLine({ source: "quest", role: "visitor", body: "oi" }), null);
});

test("gen history sql lets the owner read and nobody else write from the client", () => {
  const sql = fs.readFileSync(new URL("../sql/gen_history.sql", import.meta.url), "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /auth\.uid\(\) = user_id/);
  assert.match(sql, /for select/);
  assert.match(sql, /grant select on public\.gen_history to authenticated/);
  assert.match(sql, /revoke all on public\.gen_history from anon, public/);
  assert.doesNotMatch(sql, /grant insert|grant all on public\.gen_history to anon|service_role/i);
  const client = fs.readFileSync(new URL("../js/gen-phone.js", import.meta.url), "utf8");
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE|service_role/);
  assert.match(client, /\/api\/gen\/history/);
});
