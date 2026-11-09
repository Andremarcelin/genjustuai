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

const VISIT = {
  session_code: "LRANG5",
  visit: {
    empty: false,
    conversations: 85,
    quotes: [
      "preciso sair, qual o clima em Taboão da Serra?",
      "aumenta o ar na hora do jogo e muda a luz pras cores do time",
      "Oi Gen",
    ],
    devices: [
      { id: "sala_luz", name: "Luz da sala", value: "apagada" },
      { id: "quarto_luz", name: "Luz do quarto", value: "80%" },
      { id: "fita_led", name: "Fita LED", value: "90%" },
      { id: "tv", name: "TV", value: "acesa" },
      { id: "ar_condicionado", name: "Ar-condicionado", value: "24 °C" },
    ],
    music: ["rock"],
    routines: ["Ligar luz da sala"],
    firstAt: "2026-11-09T16:04:25.414Z",
    lastAt: "2026-11-09T19:52:40.412Z",
    durationLabel: "3 h 48 min",
  },
};

const SESSION = {
  session: {
    session_code: "LRANG5",
    id: "LRANG5",
    display_name: "QA Prod26",
    profile_id: "Zen",
    archetype: "Zen",
    status: "ready",
  },
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname === "/api/session") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(SESSION));
        return;
      }
      if (url.pathname === "/api/codigo/summary") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(VISIT));
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
const url = `http://127.0.0.1:${port}/codigo?c=LRANG5`;

async function shot(width, height, name) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("#visit-card:not([hidden])");
  await page.waitForSelector(".visit-chips");
  await page.screenshot({ path: path.join(outDir, name), fullPage: true });
  await page.close();
}

await shot(412, 915, "codigo-visit-412.png");
await shot(1440, 900, "codigo-visit-1440.png");
await browser.close();
server.close();
console.log(outDir);
