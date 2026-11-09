import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pw = require("playwright-core");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.SHOT_DIR || "/opt/cursor/artifacts";
fs.mkdirSync(outDir, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

const FULL = {
  session: {
    session_code: "LRANG5",
    id: "LRANG5",
    display_name: "QA Prod26",
    profile_id: "Zen",
    archetype: "Zen",
    status: "ready",
  },
  visit: {
    empty: false,
    conversations: 85,
    quotes: [
      "preciso sair, qual o clima em Taboão da Serra?",
      "aumenta o ar na hora do jogo e muda a luz pras cores do time",
      "Oi Gen",
    ],
    channels: { chat: 85, quest: 6, house: 32 },
    commandTotal: 90,
    devices: [
      { id: "sala_luz", name: "Luz da sala", changes: 4, value: "apagada" },
      { id: "quarto_luz", name: "Luz do quarto", changes: 2, value: "80%" },
      { id: "fita_led", name: "Fita LED", changes: 3, value: "90%" },
      { id: "tv", name: "TV", changes: 1, value: "acesa" },
      { id: "ar_condicionado", name: "Ar-condicionado", changes: 22, value: "24 °C" },
    ],
    mostUsed: { id: "ar_condicionado", name: "Ar-condicionado", changes: 22 },
    averageAc: "22 °C",
    averageLight: "62%",
    music: ["rock"],
    videos: [],
    questions: ["clima em Taboão da Serra"],
    dojos: [],
    routines: [{ name: "Ligar luz da sala", when: "às 7h" }],
    firstLabel: "13h04",
    lastLabel: "16h52",
    durationLabel: "3 h 48 min",
    insights: [
      {
        text: "Prefere ambiente fresco.",
        basis: "ar em ≤ 22 °C em 4 de 5 ajustes",
      },
      {
        text: "Conversa mais pelo chat do site.",
        basis: "85 falas no chat · 6 no Quest · 32 nos botões",
      },
      {
        text: "Os temas da conversa giram em torno de clima e futebol.",
        basis: "clima 12× · futebol 4×",
      },
      {
        text: "Seu perfil Zen combina com o ar fresco e a casa mais quieta.",
        basis: "perfil Zen + o que você fez nesta sessão",
      },
    ],
  },
};

const SPARSE = {
  session: {
    session_code: "VDMLMG",
    id: "VDMLMG",
    display_name: "QA Redesign",
    profile_id: "Zen",
    archetype: "Zen",
    status: "ready",
  },
  visit: {
    empty: false,
    conversations: 0,
    quotes: [],
    channels: { chat: 0, quest: 0, house: 1 },
    commandTotal: 1,
    devices: [{ id: "sala_luz", name: "Luz da sala", changes: 1, value: "acesa" }],
    mostUsed: { id: "sala_luz", name: "Luz da sala", changes: 1 },
    averageAc: null,
    averageLight: null,
    music: [],
    videos: [],
    questions: [],
    dojos: [],
    routines: [],
    firstLabel: "10h12",
    lastLabel: "10h12",
    durationLabel: "alguns instantes",
    insights: [],
  },
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname === "/api/session") {
        const code = String(url.searchParams.get("code") || "").toUpperCase();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(code === "VDMLMG" ? SPARSE : FULL));
        return;
      }
      let file = url.pathname === "/" || url.pathname === "/codigo" || url.pathname === "/codigo/"
        ? "/codigo.html"
        : url.pathname;
      const abs = path.join(root, file.replace(/^\//, ""));
      if (!abs.startsWith(root) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(abs)] || "application/octet-stream" });
      fs.createReadStream(abs).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const browser = await pw.chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  args: ["--font-render-hinting=none", "--no-sandbox", "--disable-dev-shm-usage"],
});
const server = await serve();
const port = server.address().port;

async function shot(code, width, height, name, waitChips) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${port}/codigo?c=${code}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#visit-card:not([hidden])");
  if (waitChips) await page.waitForSelector(".visit-chips");
  await page.screenshot({ path: path.join(outDir, name), fullPage: true });
  await page.close();
}

await shot("LRANG5", 412, 915, "codigo-visit-412.png", true);
await shot("LRANG5", 1440, 900, "codigo-visit-1440.png", true);
await shot("VDMLMG", 412, 915, "codigo-visit-sparse-412.png", true);
await shot("VDMLMG", 1440, 900, "codigo-visit-sparse-1440.png", true);
await browser.close();
server.close();
console.log(outDir);
