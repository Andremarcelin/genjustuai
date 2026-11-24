import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import {
  formatSessionTokens,
  parseUsageMetadata,
  usageFromProvider,
} from "../lib/gen/token-usage.js";
import { addSessionTokens } from "../lib/gen/session-tokens.js";
import { completeChat } from "../lib/gen/providers.js";
import { GROQ_CHAT_URL } from "../lib/gen/constants.js";

const require = createRequire(import.meta.url);
const T = require("../js/session-tokens.js");

test("parseUsageMetadata reads Gemini and Groq real usage", () => {
  assert.deepEqual(parseUsageMetadata({
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 334, totalTokenCount: 1234 },
  }), {
    tokens_in: 900,
    tokens_out: 334,
    tokens_total: 1234,
    calls: 1,
    estimated: false,
  });
  assert.deepEqual(parseUsageMetadata({
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }), {
    tokens_in: 10,
    tokens_out: 5,
    tokens_total: 15,
    calls: 1,
    estimated: false,
  });
  assert.equal(parseUsageMetadata({ usage: { type: "duration", seconds: 2.1 } }), null);
});

test("missing usage is a labeled estimate, never a silent guess", () => {
  const estimated = usageFromProvider({}, { messages: [{ role: "user", content: "olá, gen" }], reply: "oi" });
  assert.equal(estimated.estimated, true);
  assert.ok(estimated.tokens_total >= 1);
  assert.match(formatSessionTokens(estimated), /parte estimada/);
  assert.match(
    formatSessionTokens({ tokens_in: 900, tokens_out: 334, tokens_total: 1234, calls: 1 }),
    /Esta sessão usou 1[. ]?234 tokens \(entrada 900 · saída 334\)/,
  );
  assert.match(
    T.formatLine({ tokens_in: 900, tokens_out: 334, tokens_total: 1234 }),
    /Esta sessão usou 1[. ]?234 tokens \(entrada 900 · saída 334\)/,
  );
});

test("completeChat attaches provider usage", async () => {
  const gemini = await completeChat({
    env: { GEMINI_API_KEY: "g" },
    messages: [{ role: "user", content: "oi" }],
    fetchImpl: async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "oi" }] } }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3, totalTokenCount: 15 },
    }), { status: 200 }),
  });
  assert.equal(gemini.usage.tokens_total, 15);
  assert.equal(gemini.usage.estimated, false);

  const groq = await completeChat({
    env: { GEN_CHAT_PRIMARY: "groq", GROQ_API_KEY: "q" },
    messages: [{ role: "user", content: "oi" }],
    fetchImpl: async (url) => {
      assert.equal(String(url), GROQ_CHAT_URL);
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "oi" } }],
        usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
      }), { status: 200 });
    },
  });
  assert.equal(groq.usage.tokens_in, 8);
  assert.equal(groq.usage.tokens_out, 2);
});

test("addSessionTokens posts the RPC and skips empty deltas", async () => {
  const calls = [];
  const rest = async (path, options) => {
    calls.push({ path, options });
    return { ok: true, json: { tokens_total: 15, calls: 1 } };
  };
  const skipped = await addSessionTokens("AB3K7Q", { tokens_in: 0, tokens_out: 0, tokens_total: 0, calls: 0 }, rest);
  assert.equal(skipped.skipped, true);
  assert.equal(calls.length, 0);

  await addSessionTokens("ab3k7q", {
    tokens_in: 12,
    tokens_out: 3,
    tokens_total: 15,
    calls: 1,
    estimated: false,
  }, rest);
  assert.match(calls[0].path, /genjutsu_add_session_tokens/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.p_code, "AB3K7Q");
  assert.equal(body.p_total, 15);
  assert.equal(body.p_calls, 1);
});

test("paint uses two lines so 390px does not orphan a parenthesis", () => {
  const el = { hidden: true, child: [], replaceChildren() { this.child = []; }, appendChild(node) { this.child.push(node); } };
  const orig = global.document;
  global.document = {
    createElement() {
      return { className: "", textContent: "" };
    },
  };
  try {
    T.paint(el, { tokens_in: 900, tokens_out: 334, tokens_total: 1234 });
    assert.equal(el.hidden, false);
    assert.equal(el.child[0].className, "session-tokens-total");
    assert.match(el.child[0].textContent, /Esta sessão usou/);
    assert.equal(el.child[1].className, "session-tokens-split");
    assert.match(el.child[1].textContent, /entrada 900/);
    assert.doesNotMatch(el.child[1].textContent, /^\)$/);
  } finally {
    if (orig === undefined) delete global.document;
    else global.document = orig;
  }
});

test("sql migration and screens include the counter", () => {
  const sql = fs.readFileSync(new URL("../sql/session_tokens.sql", import.meta.url), "utf8");
  assert.match(sql, /tokens_in/);
  assert.match(sql, /genjutsu_add_session_tokens/);
  assert.match(sql, /NÃO aplique|nao aplique|SQL Editor/i);
  const entrada = fs.readFileSync(new URL("../entrada.html", import.meta.url), "utf8");
  const codigo = fs.readFileSync(new URL("../codigo.html", import.meta.url), "utf8");
  const admin = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");
  assert.match(entrada, /id="ready-tokens"/);
  assert.match(codigo, /id="ready-tokens"/);
  assert.match(admin, /tokenHtml/);
  assert.equal(fs.existsSync(new URL("../api/gen/usage.js", import.meta.url)), false);
});
