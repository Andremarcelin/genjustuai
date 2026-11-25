// Cronômetro por etapa: vira o campo timing_ms da resposta, o header Server-Timing e o log.

export function createTimer(now = () => performance.now()) {
  const t0 = now();
  const marks = {};
  return {
    async stage(name, fn) {
      const s = now();
      try {
        return await fn();
      } finally {
        marks[name] = Math.round(now() - s);
      }
    },
    set(name, ms) { marks[name] = Math.round(ms); },
    total() { return Math.round(now() - t0); },
    snapshot() { return { ...marks, total: Math.round(now() - t0) }; },
  };
}

// "stt;dur=812, chat;dur=640, ..." (https://www.w3.org/TR/server-timing/)
export function serverTimingHeader(timing) {
  return Object.entries(timing)
    .filter(([, v]) => Number.isFinite(v))
    .map(([k, v]) => `${k.replace(/[^A-Za-z0-9_-]/g, "_")};dur=${v}`)
    .join(", ");
}
