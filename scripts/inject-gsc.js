const fs = require("fs");
const path = require("path");

const token = (process.env.GOOGLE_SITE_VERIFICATION || "").trim();
if (!token) process.exit(0);
if (!/^[A-Za-z0-9_-]+$/.test(token)) {
  console.error("GOOGLE_SITE_VERIFICATION has invalid characters");
  process.exit(1);
}

const file = path.join(__dirname, "..", "index.html");
let html = fs.readFileSync(file, "utf8");
const tag = `<meta name="google-site-verification" content="${token}">`;
if (html.includes("google-site-verification")) process.exit(0);
html = html.replace("<head>", `<head>\n${tag}`);
fs.writeFileSync(file, html);
console.log("Injected Google Search Console meta tag");
