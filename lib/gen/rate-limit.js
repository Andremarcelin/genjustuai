export function createRateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return {
    allow(key, now = Date.now()) {
      const id = String(key || "unknown");
      const recent = (hits.get(id) || []).filter((stamp) => now - stamp < windowMs);
      if (recent.length >= limit) {
        hits.set(id, recent);
        return false;
      }
      recent.push(now);
      hits.set(id, recent);
      return true;
    },
  };
}

export function clientIp(req) {
  const forwarded = req?.headers?.["x-forwarded-for"] || req?.headers?.["X-Forwarded-For"] || "";
  const first = String(forwarded).split(",")[0].trim();
  return first || req?.socket?.remoteAddress || "unknown";
}
