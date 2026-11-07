export function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType || ""));
  if (!match || !Buffer.isBuffer(buffer)) return null;
  const boundary = (match[1] || match[2] || "").trim();
  if (!boundary) return null;
  const delim = Buffer.from(`--${boundary}`);
  const parts = [];
  let cursor = buffer.indexOf(delim);
  if (cursor < 0) return null;
  cursor += delim.length;
  while (cursor < buffer.length) {
    if (buffer[cursor] === 45 && buffer[cursor + 1] === 45) break;
    if (buffer[cursor] === 13 && buffer[cursor + 1] === 10) cursor += 2;
    const next = buffer.indexOf(delim, cursor);
    if (next < 0) break;
    let end = next;
    if (end >= 2 && buffer[end - 2] === 13 && buffer[end - 1] === 10) end -= 2;
    const raw = buffer.subarray(cursor, end);
    const sep = raw.indexOf("\r\n\r\n");
    if (sep >= 0) {
      const header = raw.subarray(0, sep).toString("utf8");
      const data = raw.subarray(sep + 4);
      const name = /name="([^"]+)"/.exec(header);
      const filename = /filename="([^"]*)"/.exec(header);
      const mime = /Content-Type:\s*([^\r\n]+)/i.exec(header);
      if (name && filename) {
        parts.push({
          kind: "file",
          name: name[1],
          filename: filename[1],
          mime: (mime?.[1] || "application/octet-stream").trim(),
          data,
        });
      } else if (name) {
        parts.push({ kind: "field", name: name[1], value: data.toString("utf8") });
      }
    }
    cursor = next + delim.length;
  }
  return parts;
}

const AUDIO_PREFIXES = ["audio/wav", "audio/wave", "audio/x-wav", "audio/webm", "video/webm", "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/mpeg", "audio/ogg"];

export function isAllowedAudio(mime) {
  const base = String(mime || "").split(";")[0].trim().toLowerCase();
  return AUDIO_PREFIXES.includes(base);
}

export function audioExtension(mime) {
  const base = String(mime || "").split(";")[0].trim().toLowerCase();
  if (base.includes("wav")) return "wav";
  if (base.includes("webm")) return "webm";
  if (base.includes("mp4") || base.includes("m4a")) return "m4a";
  if (base.includes("mpeg")) return "mp3";
  if (base.includes("ogg")) return "ogg";
  return "bin";
}
