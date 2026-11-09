const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const landing = fs.readFileSync(path.join(root, "index.html"), "utf8");
const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
const portal = fs.readFileSync(path.join(root, "js", "portal.js"), "utf8");

assert.match(landing, /IntersectionObserver/);
assert.match(landing, /prefers-reduced-motion/);
assert.match(landing, /brand-kanji/);
assert.match(landing, /幻術/);
assert.match(landing, /href="\/entrada\?via=guest"/);
assert.match(landing, /href="\/entrada\?via=google"/);
assert.match(landing, /h === "entrada"/);
assert.match(landing, /location\.replace\("\/entrada"/);
assert.doesNotMatch(landing, /href="\/casa"/);
assert.doesNotMatch(landing, /Falar com/);
assert.doesNotMatch(landing, />Entrar</);
assert.match(landing, /src="\/assets\/houses\/zen\.webp"/);
assert.match(landing, /src="\/assets\/team\/1-andre-marcelino\.webp"/);
assert.match(landing, /src="\/assets\/sec56\/genjutsu-warm\.webp"/);
assert.match(landing, /src="\/assets\/quiz-real\.webp"/);
assert.match(landing, /fonts\.googleapis\.com/);

const assets = [
  "assets/houses/zen.webp",
  "assets/houses/cyber.webp",
  "assets/houses/excentrico.webp",
  "assets/houses/acolhedor.webp",
  "assets/houses/sala-vermelha.webp",
  "assets/team/1-andre-marcelino.webp",
  "assets/sec56/assistente-comum.webp",
  "assets/quiz-real.webp",
  "public/houses/zen.webp",
  "public/team/1-andre-marcelino.webp",
  "public/sec56/casa-moldada.webp",
  "public/quiz-real.webp"
];
for (const file of assets) {
  const abs = path.join(root, file);
  assert.ok(fs.existsSync(abs), "missing " + file);
  assert.ok(fs.statSync(abs).size > 1000, "tiny " + file);
}

assert.match(vercel, /"\/entrada"/);
assert.match(vercel, /"\/codigo"/);
assert.match(portal, /via === "google"/);
assert.match(portal, /via === "guest"/);
assert.match(portal, /onEntryRoute/);

console.log("landing tests ok");
