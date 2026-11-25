// Utilidades de WAV PCM 16 bits mono: ler cabeçalho, reamostrar e montar WAV.

export function parseWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }
  let off = 12, fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    const start = off + 8;
    if (id === "fmt ") {
      fmt = {
        format: buf.readUInt16LE(start),
        channels: buf.readUInt16LE(start + 2),
        sampleRate: buf.readUInt32LE(start + 4),
        bits: buf.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      // Streams às vezes gravam 0 ou 0xFFFFFFFF no tamanho: usa o que tiver.
      if (!size || start + size > buf.length) size = buf.length - start;
      if (!fmt) return null;
      return { ...fmt, pcm: buf.subarray(start, start + size) };
    }
    off = start + size + (size & 1);
  }
  return null;
}

export function wavHeader(dataBytes, sampleRate = 16000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);            // PCM
  h.writeUInt16LE(1, 22);            // mono
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

export function makeWav(pcm, sampleRate = 16000) {
  return Buffer.concat([wavHeader(pcm.length, sampleRate), pcm]);
}

// Reamostra PCM16 mono (ex.: 24 kHz do Gemini TTS -> 16 kHz do Mochi).
// Filtro passa-baixa (sinc com janela de Hann, 31 taps) + interpolação no ponto fracionário.
export function resamplePcm16(pcm, fromRate, toRate) {
  if (fromRate === toRate) return Buffer.from(pcm);
  const n = Math.floor(pcm.length / 2);
  const src = new Int16Array(n);
  for (let i = 0; i < n; i += 1) src[i] = pcm.readInt16LE(i * 2);
  const ratio = toRate / fromRate;
  const cutoff = Math.min(1, ratio) * 0.9;          // fração de Nyquist da origem
  const half = 15;
  const outN = Math.floor(n * ratio);
  const out = Buffer.alloc(outN * 2);
  for (let j = 0; j < outN; j += 1) {
    const t = j / ratio;
    const c = Math.floor(t);
    let acc = 0, wsum = 0;
    for (let k = c - half + 1; k <= c + half; k += 1) {
      if (k < 0 || k >= n) continue;
      const x = t - k;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * cutoff * x) / (Math.PI * cutoff * x);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / half);
      const g = sinc * w;
      acc += src[k] * g;
      wsum += g;
    }
    const v = Math.round(wsum ? acc / wsum : 0);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, v)), j * 2);
  }
  return out;
}
