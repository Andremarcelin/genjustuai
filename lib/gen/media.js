import { PROFILE_PLAYLISTS } from "./media-playlists.js";
import { searchGeminiGrounded } from "./providers.js";

const ARCHIVE_SEARCH = "https://archive.org/advancedsearch.php";
const ARCHIVE_META = "https://archive.org/metadata/";
const JAMENDO_TRACKS = "https://api.jamendo.com/v3.0/tracks/";
const DDG = "https://api.duckduckgo.com/";

const AUDIO_FORMATS = new Set(["vbr mp3", "mp3", "mpeg", "ogg vorbis", "ogg"]);
const VIDEO_FORMATS = new Set(["h.264", "mpeg4", "mp4", "h.264 ia"]);

export function isAllowedMediaUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "archive.org"
      || host.endsWith(".archive.org")
      || host === "jamendo.com"
      || host.endsWith(".jamendo.com");
  } catch {
    return false;
  }
}

export function archiveSearchUrl(query, mediatype) {
  const kind = mediatype === "video" ? "movies" : "audio";
  const q = `mediatype:(${kind}) AND (${String(query || "").trim() || "creative commons"}) AND (licenseurl:(*creativecommons* OR *publicdomain*) OR collection:(opensource_audio OR opensource_movies))`;
  const params = new URLSearchParams({
    q,
    rows: "8",
    page: "1",
    output: "json",
  });
  params.append("fl[]", "identifier");
  params.append("fl[]", "title");
  params.append("fl[]", "creator");
  params.append("fl[]", "licenseurl");
  params.append("fl[]", "mediatype");
  return `${ARCHIVE_SEARCH}?${params.toString()}`;
}

export function parseArchiveSearch(json) {
  const docs = json?.response?.docs;
  if (!Array.isArray(docs)) return [];
  return docs
    .map((doc) => ({
      identifier: String(doc.identifier || "").trim(),
      title: String(doc.title || doc.identifier || "Sem título").slice(0, 160),
      artist: String(Array.isArray(doc.creator) ? doc.creator[0] : (doc.creator || "Internet Archive")).slice(0, 120),
      license: licenseLabel(doc.licenseurl),
      mediatype: doc.mediatype === "movies" ? "video" : "audio",
    }))
    .filter((doc) => doc.identifier && !/youtube/i.test(doc.identifier));
}

export function pickArchiveFile(metadata, type) {
  const id = String(metadata?.metadata?.identifier || metadata?.dir || "").replace(/^\/\d+\//, "").split("/").pop();
  const identifier = String(metadata?.metadata?.identifier || id || "").trim();
  const files = Array.isArray(metadata?.files) ? metadata.files : [];
  const wanted = type === "video" ? VIDEO_FORMATS : AUDIO_FORMATS;
  const ext = type === "video" ? /\.mp4$/i : /\.(mp3|ogg)$/i;
  const match = files.find((file) => {
    const format = String(file.format || "").toLowerCase();
    const name = String(file.name || "");
    if (/\.youtube|youtu\.be/i.test(name)) return false;
    return wanted.has(format) || ext.test(name);
  });
  if (!identifier || !match?.name) return null;
  const license = licenseLabel(metadata?.metadata?.licenseurl || metadata?.metadata?.rights);
  return {
    type: type === "video" ? "video" : "audio",
    url: `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURI(match.name)}`,
    title: String(metadata?.metadata?.title || identifier).slice(0, 160),
    artist: String(metadata?.metadata?.creator || "Internet Archive").slice(0, 120),
    license,
    source: "archive",
  };
}

export function parseJamendoTracks(json) {
  const rows = json?.results;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      type: "audio",
      url: String(row.audio || row.audiodownload || "").split("?")[0],
      title: String(row.name || "Faixa Jamendo").slice(0, 160),
      artist: String(row.artist_name || "Jamendo").slice(0, 120),
      license: licenseLabel(row.license_ccurl || row.license),
      source: "jamendo",
    }))
    .filter((row) => isAllowedMediaUrl(row.url));
}

export function parseDuckDuckGo(json) {
  const results = [];
  const abstract = String(json?.AbstractText || "").trim();
  if (abstract) {
    results.push({
      title: String(json.Heading || "Resumo").slice(0, 160),
      snippet: abstract.slice(0, 400),
      url: String(json.AbstractURL || "").slice(0, 300),
    });
  }
  const topics = Array.isArray(json?.RelatedTopics) ? json.RelatedTopics : [];
  for (const topic of topics) {
    if (results.length >= 5) break;
    const text = String(topic?.Text || "").trim();
    const url = String(topic?.FirstURL || "").trim();
    if (!text || !url) continue;
    results.push({ title: text.slice(0, 120), snippet: text.slice(0, 400), url: url.slice(0, 300) });
  }
  return results;
}

function licenseLabel(value) {
  const raw = String(value || "").toLowerCase();
  if (!raw) return "Licença livre (IA/CC)";
  if (raw.includes("publicdomain") || raw.includes("public domain")) return "Public Domain";
  if (raw.includes("by-sa")) return "CC BY-SA";
  if (raw.includes("by-nc")) return "CC BY-NC";
  if (raw.includes("by")) return "CC BY";
  if (raw.includes("creativecommons")) return "Creative Commons";
  return String(value).slice(0, 80);
}

export function toPublicMedia(clip, device, playing, nowIso) {
  if (!clip || !isAllowedMediaUrl(clip.url)) return null;
  return {
    type: clip.type === "video" ? "video" : "audio",
    url: clip.url,
    title: String(clip.title || "Mídia").slice(0, 160),
    artist: String(clip.artist || "").slice(0, 120),
    license: String(clip.license || "Licença livre").slice(0, 80),
    device: device === "ambiente" ? "ambiente" : "tv",
    playing: playing !== false,
    updated_at: nowIso,
  };
}

async function readJson(fetchImpl, url) {
  const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!res?.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function searchArchive({ fetchImpl, query, type }) {
  const fetchFn = fetchImpl || globalThis.fetch;
  const list = await readJson(fetchFn, archiveSearchUrl(query, type === "video" ? "video" : "audio"));
  const docs = parseArchiveSearch(list);
  for (const doc of docs.slice(0, 5)) {
    const meta = await readJson(fetchFn, `${ARCHIVE_META}${encodeURIComponent(doc.identifier)}`);
    const file = pickArchiveFile(meta || {}, type);
    if (file && isAllowedMediaUrl(file.url)) {
      return {
        ...file,
        title: file.title || doc.title,
        artist: file.artist || doc.artist,
        license: file.license || doc.license,
      };
    }
  }
  return null;
}

export async function searchJamendo({ fetchImpl, env, query }) {
  const clientId = String(env?.JAMENDO_CLIENT_ID || "").trim();
  if (!clientId) return null;
  const fetchFn = fetchImpl || globalThis.fetch;
  const params = new URLSearchParams({
    client_id: clientId,
    format: "json",
    limit: "5",
    search: String(query || "acoustic").slice(0, 80),
    audioformat: "mp32",
    include: "licenses",
  });
  const json = await readJson(fetchFn, `${JAMENDO_TRACKS}?${params.toString()}`);
  return parseJamendoTracks(json)[0] || null;
}

export async function resolveAudio({ fetchImpl, env, query, mood, profileId }) {
  const q = [query, mood].filter(Boolean).join(" ").trim() || playlistQuery(profileId);
  const jamendo = await searchJamendo({ fetchImpl, env, query: q });
  if (jamendo) return jamendo;
  return searchArchive({ fetchImpl, query: q, type: "audio" });
}

export async function resolveVideo({ fetchImpl, query }) {
  return searchArchive({ fetchImpl, query: query || "creative commons short film", type: "video" });
}

export function playlistFor(profileId) {
  return PROFILE_PLAYLISTS[profileId] || PROFILE_PLAYLISTS.Acolhedor;
}

function playlistQuery(profileId) {
  const pack = playlistFor(profileId);
  return pack.tracks[0]?.query || pack.mood;
}

export async function resolvePlaylistTrack({ fetchImpl, env, profileId }) {
  const pack = playlistFor(profileId);
  for (const track of pack.tracks) {
    const q = track.query || pack.mood;
    if (track.source === "jamendo") {
      const jam = await searchJamendo({ fetchImpl, env, query: q });
      if (jam) return { ...jam, title: jam.title || track.title, artist: jam.artist || track.artist, license: jam.license || track.license };
    }
    const found = await searchArchive({ fetchImpl, query: q, type: "audio" });
    if (found) return { ...found, title: found.title || track.title, artist: found.artist || track.artist, license: found.license || track.license };
  }
  return null;
}

async function searchTavily(fetchFn, env, query) {
  const key = String(env?.TAVILY_API_KEY || "").trim();
  if (!key) return [];
  try {
    const res = await fetchFn("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, query, max_results: 5, search_depth: "basic" }),
    });
    const json = await res.json().catch(() => null);
    const list = Array.isArray(json?.results) ? json.results : [];
    return list.slice(0, 5).map((item) => ({
      title: String(item.title || "Fonte").slice(0, 160),
      snippet: String(item.content || "").slice(0, 400),
      url: String(item.url || "").slice(0, 300),
    })).filter((item) => item.url);
  } catch {
    return [];
  }
}

async function searchBrave(fetchFn, env, query) {
  const key = String(env?.BRAVE_API_KEY || "").trim();
  if (!key) return [];
  try {
    const res = await fetchFn(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
      headers: { Accept: "application/json", "X-Subscription-Token": key },
    });
    const json = await res.json().catch(() => null);
    const list = Array.isArray(json?.web?.results) ? json.web.results : [];
    return list.slice(0, 5).map((item) => ({
      title: String(item.title || "Fonte").slice(0, 160),
      snippet: String(item.description || "").slice(0, 400),
      url: String(item.url || "").slice(0, 300),
    })).filter((item) => item.url);
  } catch {
    return [];
  }
}

async function searchWikipedia(fetchFn, query) {
  try {
    const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const json = await readJson(fetchFn, url);
    if (!json || json.type === "https://mediawiki.org/wiki/HyperSwitch/errors/not_found") return [];
    const title = String(json.title || query).slice(0, 160);
    const snippet = String(json.extract || "").slice(0, 400);
    const page = String(json.content_urls?.desktop?.page || json.content_urls?.mobile?.page || "").slice(0, 300);
    if (!snippet) return [];
    return [{ title, snippet, url: page || `https://pt.wikipedia.org/wiki/${encodeURIComponent(title)}` }];
  } catch {
    return [];
  }
}

export async function searchWeb({ fetchImpl, env, query }) {
  const fetchFn = fetchImpl || globalThis.fetch;
  const q = String(query || "").slice(0, 120);
  if (!q) return [];
  try {
    const grounded = await searchGeminiGrounded({ fetchImpl: fetchFn, env, query: q });
    if (grounded.grounded || grounded.text) {
      const hits = (grounded.hits || []).map((hit, index) => ({
        title: hit.title,
        url: hit.url,
        snippet: index === 0 && grounded.text ? grounded.text : (hit.snippet || ""),
      }));
      if (!hits.length && grounded.text) {
        hits.push({ title: "Google", url: "", snippet: grounded.text });
      }
      hits.answer = grounded.text || "";
      hits.grounded = Boolean(grounded.grounded);
      hits.model = grounded.model || "";
      hits.gemini_error = grounded.gemini_error;
      return hits;
    }
  } catch {
    /* cai no DDG/Wikipedia */
  }
  const keyed = await searchTavily(fetchFn, env, q);
  if (keyed.length) return keyed;
  const brave = await searchBrave(fetchFn, env, q);
  if (brave.length) return brave;
  const params = new URLSearchParams({
    q,
    format: "json",
    no_redirect: "1",
    no_html: "1",
    skip_disambig: "1",
  });
  const json = await readJson(fetchFn, `${DDG}?${params.toString()}`);
  const ddg = parseDuckDuckGo(json || {});
  if (ddg.length) return ddg;
  return searchWikipedia(fetchFn, q);
}
