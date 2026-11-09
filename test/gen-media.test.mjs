import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { executeHouseTool } from "../lib/gen/executor.js";
import { createMemoryHouseStore } from "../lib/gen/house-store.js";
import { TOOLS, validateToolCall } from "../lib/gen/tools.js";
import { isAllowedMediaUrl, parseArchiveSearch, pickArchiveFile, parseDuckDuckGo } from "../lib/gen/media.js";
import { PROFILE_PLAYLISTS } from "../lib/gen/media-playlists.js";
import { parseHouseIntent, plannedActions } from "../lib/gen/intent.js";
import { createRateLimiter } from "../lib/gen/rate-limit.js";
import { createMediaHandler } from "../api/house/media.js";

function limiter() {
  return createRateLimiter({ limit: 20, windowMs: 60_000 });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function archiveFetch(url) {
  const href = String(url);
  if (href.includes("jamendo.com")) {
    return json({ results: [] });
  }
  if (href.includes("advancedsearch")) {
    return json({
      response: {
        docs: [{
          identifier: "testmp3testfile",
          title: "Test MP3",
          creator: "Internet Archive",
          licenseurl: "https://creativecommons.org/licenses/by/4.0/",
          mediatype: href.includes("movies") ? "movies" : "audio",
        }],
      },
    });
  }
  if (href.includes("/metadata/")) {
    return json({
      metadata: {
        identifier: "testmp3testfile",
        title: "Test MP3",
        creator: "Internet Archive",
        licenseurl: "https://creativecommons.org/licenses/by/4.0/",
      },
      files: [
        { name: "mpthreetest.mp3", format: "VBR MP3" },
        { name: "clip.mp4", format: "h.264" },
      ],
    });
  }
  if (href.includes("duckduckgo.com")) {
    return json({
      Heading: "Jazz",
      AbstractText: "Jazz is a music genre.",
      AbstractURL: "https://en.wikipedia.org/wiki/Jazz",
      RelatedTopics: [{ Text: "Swing", FirstURL: "https://en.wikipedia.org/wiki/Swing_music" }],
    });
  }
  return json({}, 404);
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; this.headersSent = true; return this; },
    end() { this.headersSent = true; return this; },
  };
}

test("only archive and jamendo https urls are allowed", () => {
  assert.equal(isAllowedMediaUrl("https://archive.org/download/a/b.mp3"), true);
  assert.equal(isAllowedMediaUrl("https://mp3d.jamendo.com/download/track/1/mp32/"), true);
  assert.equal(isAllowedMediaUrl("https://youtube.com/watch?v=1"), false);
  assert.equal(isAllowedMediaUrl("http://archive.org/download/a/b.mp3"), false);
});

test("archive parsers pick a direct file", () => {
  const docs = parseArchiveSearch({
    response: { docs: [{ identifier: "foo", title: "Bar", creator: "IA", licenseurl: "http://creativecommons.org/licenses/by/3.0/", mediatype: "audio" }] },
  });
  assert.equal(docs[0].identifier, "foo");
  const file = pickArchiveFile({
    metadata: { identifier: "foo", title: "Bar", creator: "IA", licenseurl: "creativecommons.org/licenses/by/3.0/" },
    files: [{ name: "track.mp3", format: "VBR MP3" }],
  }, "audio");
  assert.equal(file.url, "https://archive.org/download/foo/track.mp3");
});

test("duckduckgo parser keeps abstract", () => {
  const rows = parseDuckDuckGo({ Heading: "Jazz", AbstractText: "A genre.", AbstractURL: "https://example.com", RelatedTopics: [] });
  assert.equal(rows[0].title, "Jazz");
});

test("ZCEA playlists have attribution and no youtube", () => {
  for (const id of ["Zen", "Cyber", "Excentrico", "Acolhedor"]) {
    const pack = PROFILE_PLAYLISTS[id];
    assert.ok(pack.tracks.length >= 1);
    for (const track of pack.tracks) {
      assert.ok(track.title);
      assert.ok(track.artist);
      assert.ok(track.license);
      assert.doesNotMatch(JSON.stringify(track), /youtube/i);
    }
  }
});

test("public tools include media and web_search", () => {
  assert.equal(TOOLS.length, 13);
  assert.deepEqual(TOOLS.map((tool) => tool.name), [
    "get_house_state", "list_devices", "set_device", "set_lights", "set_ambience", "switch_dojo",
    "play_music", "open_video", "stop_media", "web_search",
    "create_routine", "list_routines", "delete_routine",
  ]);
  assert.equal(validateToolCall("play_music", {}).ok, true);
  assert.equal(validateToolCall("open_video", { query: "jazz" }).ok, true);
  assert.equal(validateToolCall("control_media", { playing: false }).ok, true);
});

test("play_music persists clip, turns TV on, stop pauses", async () => {
  const store = createMemoryHouseStore();
  const now = Date.parse("2026-11-09T02:00:00.000Z");
  const played = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "play_music",
    args: { query: "jazz" },
    store,
    limiter: limiter(),
    now,
    fetchImpl: archiveFetch,
    env: {},
    profileId: "Excentrico",
  });
  assert.equal(played.status, "accepted");
  assert.equal(played.state.lights.tv.on, true);
  assert.equal(played.state.media.type, "audio");
  assert.match(played.state.media.url, /^https:\/\/archive\.org\//);
  assert.equal(played.state.media.playing, true);
  assert.equal(played.state.media.device, "tv");
  assert.ok(played.state.media.license);

  const stopped = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "stop_media",
    args: {},
    store,
    limiter: limiter(),
    now: now + 1,
  });
  assert.equal(stopped.state.media.playing, false);
  assert.equal(stopped.state.media.url, played.state.media.url);
});

test("open_video and web_search", async () => {
  const store = createMemoryHouseStore();
  const now = Date.parse("2026-11-09T02:00:00.000Z");
  const video = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "open_video",
    args: { query: "short film" },
    store,
    limiter: limiter(),
    now,
    fetchImpl: archiveFetch,
  });
  assert.equal(video.status, "accepted");
  assert.equal(video.state.media.type, "video");
  assert.match(video.state.media.url, /\.mp4$/);

  const search = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "web_search",
    args: { query: "jazz" },
    store,
    limiter: limiter(),
    now,
    fetchImpl: archiveFetch,
  });
  assert.equal(search.status, "accepted");
  assert.equal(search.search[0].title, "Jazz");
  assert.equal(search.state.version, video.state.version);
});

test("missing clip is rejected without mutating state", async () => {
  const store = createMemoryHouseStore();
  const result = await executeHouseTool({
    sessionId: "AB3K7Q",
    tool: "play_music",
    args: { query: "nothing" },
    store,
    limiter: limiter(),
    now: Date.now(),
    fetchImpl: async () => json({ response: { docs: [] } }),
  });
  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "not_found");
  assert.equal(result.state.media, null);
});

test("intent maps music requests away from the TV toggle", () => {
  const intent = parseHouseIntent("toca jazz na tv");
  assert.equal(intent.media.tool, "play_music");
  assert.equal(intent.device, null);
  const actions = plannedActions(intent, {});
  assert.equal(actions[0].tool, "play_music");
});

test("casa media handler play/pause", async () => {
  const store = createMemoryHouseStore();
  const handler = createMediaHandler({
    loadSession: async () => ({ session: { id: "AB3K7Q", profile_id: "Zen", status: "active" } }),
    store,
    limiter: limiter(),
    now: () => Date.parse("2026-11-09T02:00:00.000Z"),
    fetchImpl: archiveFetch,
    env: {},
  });
  const res = mockRes();
  await handler({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { action: "play_music", query: "lofi" },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "accepted");
  assert.equal(res.body.state.media.playing, true);
});

test("casa page does not play media in the browser", () => {
  const html = fs.readFileSync(new URL("../casa.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../js/casa.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../casa.css", import.meta.url), "utf8");
  assert.doesNotMatch(html, /Agora na TV|id="casa-now"|casa-player-audio|casa-player-video/);
  assert.doesNotMatch(js, /paintNowPlaying|casa-player-audio|\.play\(/);
  assert.doesNotMatch(css, /\.casa-now\b/);
  const sql = fs.readFileSync(new URL("../sql/house_media.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists media jsonb/);
  assert.match(sql, /grant execute on function genjutsu_internal\.media_valid\(jsonb\) to service_role/i);
  const docs = fs.readFileSync(new URL("../docs/gen-api.md", import.meta.url), "utf8");
  assert.match(docs, /play_music/);
});
