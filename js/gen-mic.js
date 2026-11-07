export const MIN_PCM_SAMPLES = 4800;
export const MIN_BLOB_BYTES = 2048;

export function nextLiveRetryMs(attempt) {
  const step = Math.max(0, Number(attempt) || 0);
  return Math.min(30000, 1000 * (2 ** Math.min(step, 5)));
}

export function audioUploadName(mime) {
  const base = String(mime || "").split(";")[0].trim().toLowerCase();
  if (base.includes("mp4") || base.includes("m4a")) return "fala.m4a";
  if (base.includes("wav")) return "fala.wav";
  if (base.includes("ogg")) return "fala.ogg";
  if (base.includes("mpeg") || base.includes("mp3")) return "fala.mp3";
  return "fala.webm";
}

export function countPcmSamples(chunks) {
  return (chunks || []).reduce((total, chunk) => total + Math.floor((chunk?.byteLength || 0) / 2), 0);
}

export function routePcm(state, chunk) {
  if (!state.armed) return { action: "drop", chunks: [] };
  if (state.liveReady) {
    const chunks = state.queue.splice(0, state.queue.length);
    chunks.push(chunk);
    return { action: "send", chunks };
  }
  state.queue.push(chunk);
  return { action: "buffer", chunks: [] };
}

export function takeBuffered(queue) {
  return queue.splice(0, queue.length);
}

export function pcmLevel(chunk) {
  const view = chunk instanceof Int16Array ? chunk : new Int16Array(chunk);
  if (!view.length) return 0;
  let sum = 0;
  for (let i = 0; i < view.length; i += 1) {
    const sample = view[i] / 32768;
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / view.length) * 3);
}

export function pcm16ToWav(chunks, sampleRate = 16000) {
  const samples = countPcmSamples(chunks);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples * 2, true);
  let offset = 44;
  for (const chunk of chunks) {
    const bytes = new Uint8Array(chunk);
    const length = bytes.byteLength - (bytes.byteLength % 2);
    new Uint8Array(buffer, offset, length).set(bytes.subarray(0, length));
    offset += length;
  }
  return buffer;
}
