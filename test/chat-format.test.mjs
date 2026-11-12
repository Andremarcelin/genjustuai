import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const Format = require("../js/chat-format.js");

test("formatChatHtml shortens http(s) URLs to the domain and keeps target=_blank rel=noopener", () => {
  const html = Format.formatChatHtml(
    "Veja https://news.google.com/rss/articles/CBMiVERY_LONG_TOKEN_HERE?oc=5 e também https://www.example.com/path/to/a/very/long/file.html?q=1."
  );
  assert.match(html, /href="https:\/\/news\.google\.com\/rss\/articles\/CBMiVERY_LONG_TOKEN_HERE\?oc=5"/);
  assert.match(html, />news\.google\.com<\/a>/);
  assert.match(html, /href="https:\/\/www\.example\.com\/path\/to\/a\/very\/long\/file\.html\?q=1"/);
  assert.match(html, />example\.com<\/a>\./);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener"/);
  const visible = html.replace(/<[^>]+>/g, "");
  assert.doesNotMatch(visible, /CBMiVERY_LONG_TOKEN_HERE/);
  assert.doesNotMatch(visible, /path\/to\/a\/very\/long/);
  assert.equal(visible, "Veja news.google.com e também example.com.");
});

test("formatChatHtml escapes HTML and does not link javascript: URLs", () => {
  const html = Format.formatChatHtml('<img src=x onerror="alert(1)"> javascript:alert(1) https://safe.example/ok');
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.match(html, />safe\.example<\/a>/);
  assert.equal(Format.escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
  assert.equal(Format.linkLabel("https://www.news.google.com/rss"), "news.google.com");
});

test("casa chat uses the formatter, wraps bubbles, and hides horizontal overflow", () => {
  const js = fs.readFileSync(new URL("../js/casa.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../casa.css", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../casa.html", import.meta.url), "utf8");
  const history = fs.readFileSync(new URL("../js/history-view.js", import.meta.url), "utf8");
  assert.match(html, /js\/chat-format\.js/);
  assert.match(js, /formatChatHtml/);
  assert.match(js, /innerHTML/);
  assert.match(history, /formatChatHtml/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /word-break:\s*break-word/);
  assert.match(css, /white-space:\s*pre-wrap/);
  assert.match(css, /box-sizing:\s*border-box/);
  assert.match(css, /width:\s*fit-content/);
  assert.match(css, /align-content:\s*start/);
  assert.match(css, /min\(440px,\s*92vw\)/);
});
