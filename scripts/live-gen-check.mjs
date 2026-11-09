#!/usr/bin/env node
/**
 * Live QA against a Vercel preview that has real Gemini keys.
 * Usage: node scripts/live-gen-check.mjs <BASE_URL> <VERCEL_SHARE_TOKEN>
 */
const base = String(process.argv[2] || process.env.BASE_URL || "").replace(/\/$/, "");
const share = String(process.argv[3] || process.env.VERCEL_SHARE || "").trim();
if (!base || !share) {
  console.error("usage: node scripts/live-gen-check.mjs <BASE_URL> <VERCEL_SHARE_TOKEN>");
  process.exit(2);
}

function url(path) {
  const u = new URL(path, `${base}/`);
  u.searchParams.set("_vercel_share", share);
  return u.toString();
}

async function post(path, body) {
  const res = await fetch(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "follow",
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function get(path) {
  const res = await fetch(url(path), { redirect: "follow" });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function quote(label, text) {
  console.log(`\n--- ${label} ---\n"${String(text || "")}"\n`);
}

function fail(msg, extra) {
  console.error("FAIL:", msg, extra ? JSON.stringify(extra, null, 2) : "");
  process.exit(1);
}

const createdIds = [];
try {
  const weather = await post("/api/gen/chat", { text: "preciso sair, qual o clima em Taboão da Serra?" });
  quote("weather", weather.json.reply_text);
  if (weather.status !== 200) fail("weather http", weather);
  if (weather.json.meta?.provider !== "gemini") fail("weather provider", weather.json.meta);
  if (weather.json.actions?.[0]?.tool !== "get_weather") fail("weather tool", weather.json.actions);

  const news = await post("/api/gen/chat", { text: "quais as notícias de hoje sobre IA?" });
  quote("news", news.json.reply_text);
  if (news.json.meta?.provider !== "gemini") fail("news provider", news.json.meta);
  const newsHits = news.json.actions?.find((a) => a.tool === "web_search")?.search || [];
  if (!newsHits.length && !/Fonte:/.test(news.json.reply_text || "")) fail("news sources empty", news.json);

  const match = await post("/api/gen/chat", { text: "qual o próximo jogo do Corinthians?" });
  quote("match", match.json.reply_text);
  if (match.json.meta?.provider !== "gemini") fail("match provider", match.json.meta);
  if (!/Botafogo/i.test(match.json.reply_text || "") && !/21h30|21:30/.test(match.json.reply_text || "")) {
    fail("match expected Botafogo 21h30", match.json);
  }
  const matchHits = match.json.actions?.find((a) => a.tool === "web_search")?.search || [];
  if (!matchHits.length && !/Fonte:/.test(match.json.reply_text || "")) fail("match sources empty", match.json);

  const game = await post("/api/gen/chat", { text: "na hora do jogo aumenta o ar e muda a iluminação" });
  quote("game-time", game.json.reply_text);
  const routine = (game.json.actions || []).find((a) => a.tool === "create_routine");
  if (!routine || routine.status !== "accepted") fail("game routine missing", game.json);
  if (Number(routine.args?.hour) !== 21 || Number(routine.args?.minute) !== 30) {
    fail("kickoff must be 21:30 not another routine time", routine);
  }
  const acts = routine.args?.actions || [];
  if (!acts.some((a) => a.args?.device_id === "ar_condicionado")) fail("need AC action", routine);
  if (!acts.some((a) => /luz|led/i.test(a.args?.device_id || ""))) fail("need lights action", routine);
  if (routine.args?.id) createdIds.push(routine.args.id);

  const listed = await get("/api/routines");
  const rows = listed.json.routines || [];
  for (const row of rows) {
    const name = String(row.name || "");
    const hour = Number(row.hour ?? row.schedule?.hour);
    if (/jogo/i.test(name) || hour === 21) createdIds.push(row.id);
  }
} finally {
  const unique = [...new Set(createdIds.filter(Boolean))];
  for (const id of unique) {
    await fetch(url("/api/routines"), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }
}

console.log("live-gen-check ok");
