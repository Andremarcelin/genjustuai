import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedAudio, audioExtension } from "../lib/gen/multipart.js";
import {
  MIN_BLOB_BYTES,
  MIN_PCM_SAMPLES,
  audioUploadName,
  countPcmSamples,
  nextLiveRetryMs,
  pcm16ToWav,
  routePcm,
  takeBuffered,
} from "../js/gen-mic.js";

function pcm(bytes) {
  const buffer = new ArrayBuffer(bytes);
  const view = new Int16Array(buffer);
  for (let i = 0; i < view.length; i += 1) view[i] = i + 1;
  return buffer;
}

test("pcm is buffered until live is ready, then flushed in order", () => {
  const queue = [];
  const first = pcm(4);
  const second = pcm(4);
  assert.deepEqual(routePcm({ armed: false, liveReady: true, queue }, first), { action: "drop", chunks: [] });
  assert.equal(queue.length, 0);
  assert.equal(routePcm({ armed: true, liveReady: false, queue }, first).action, "buffer");
  assert.equal(routePcm({ armed: true, liveReady: false, queue }, second).action, "buffer");
  assert.equal(queue.length, 2);
  const flushed = routePcm({ armed: true, liveReady: true, queue }, pcm(2));
  assert.equal(flushed.action, "send");
  assert.equal(flushed.chunks.length, 3);
  assert.equal(flushed.chunks[0], first);
  assert.equal(flushed.chunks[1], second);
  assert.equal(queue.length, 0);
  queue.push(pcm(8));
  assert.equal(takeBuffered(queue).length, 1);
  assert.equal(queue.length, 0);
});

test("live retry backs off and caps at 30s", () => {
  assert.equal(nextLiveRetryMs(0), 1000);
  assert.equal(nextLiveRetryMs(1), 2000);
  assert.equal(nextLiveRetryMs(2), 4000);
  assert.equal(nextLiveRetryMs(3), 8000);
  assert.equal(nextLiveRetryMs(8), 30000);
});

test("uploads use the recording mime and ignore tiny clips", () => {
  assert.equal(audioUploadName("audio/mp4"), "fala.m4a");
  assert.equal(audioUploadName("audio/webm;codecs=opus"), "fala.webm");
  assert.equal(audioUploadName("audio/wav"), "fala.wav");
  assert.equal(isAllowedAudio("audio/mp4"), true);
  assert.equal(isAllowedAudio("audio/m4a"), true);
  assert.equal(audioExtension("audio/mp4"), "m4a");
  const short = [pcm(MIN_PCM_SAMPLES - 2)];
  const enough = [pcm(MIN_PCM_SAMPLES * 2)];
  assert.equal(countPcmSamples(short) < MIN_PCM_SAMPLES, true);
  assert.equal(countPcmSamples(enough) >= MIN_PCM_SAMPLES, true);
  assert.equal(MIN_BLOB_BYTES > 0, true);
  const wav = pcm16ToWav(enough, 16000);
  const bytes = new Uint8Array(wav);
  assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...bytes.subarray(8, 12)), "WAVE");
});
