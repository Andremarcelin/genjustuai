(function () {
  var View = window.GenjutsuCasaView || {};
  var DEVICES = [
    { id: "sala_luz", label: "Luz Sala", room: "Sala", kind: "light", overlay: "sala", icon: "bulb" },
    { id: "quarto_luz", label: "Luz Quarto", room: "Quarto", kind: "light", overlay: "quarto", icon: "lamp" },
    { id: "abajur", label: "Abajur", room: "Quarto", kind: "light", overlay: "quarto", icon: "abajur" },
    { id: "fita_led", label: "Fita LED", room: "Sala", kind: "led", overlay: "sala", icon: "led" },
    { id: "tv", label: "TV", room: "Sala", kind: "media", overlay: "sala", icon: "tv" },
    { id: "ambiente", label: "Ambiente", room: "Casa", kind: "ambience", overlay: "casa", icon: "fan" }
  ];
  var SWATCHES = ["#FF1A1A", "#FFF4E0", "#3B82F6", "#7C3AED"];
  var HOUSE_IMG = {
    Zen: "/assets/casa/zen.jpg",
    Cyber: "/assets/casa/cyber.jpg",
    Excentrico: "/assets/casa/excentrico.jpg",
    Acolhedor: "/assets/casa/acolhedor.jpg"
  };
  var ICONS = {
    bulb: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 18h6M10 21h4M8 10a4 4 0 1 1 8 0c0 2-1 3-2 4H10c-1-1-2-2-2-4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    lamp: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 21h8M12 21V10M7 10h10L12 4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    abajur: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 21h8M12 21V12M6 12h12L14 5H10z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    led: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 12h16M7 9v6M12 8v8M17 9v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    tv: '<svg viewBox="0 0 24 24" width="22" height="22"><rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 21h8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    fan: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 4c3 2 4 5 3 7M20 12c-2 3-5 4-7 3M12 20c-3-2-4-5-3-7M4 12c2-3 5-4 7-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  };

  var $ = function (id) { return document.getElementById(id); };
  var state = null;
  var session = null;
  var token = "";
  var sb = null;
  var channel = null;
  var roomFilter = "";
  var suggestions = [];

  function hex(value) {
    return /^#[0-9A-Fa-f]{6}$/.test(String(value || "")) ? String(value).toUpperCase() : "#FF1A1A";
  }

  function clamp(value, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  }

  function deviceFromState(id) {
    var lights = (state && state.lights) || {};
    var raw = lights[id] || {};
    var meta = DEVICES.find(function (item) { return item.id === id; }) || { id: id, label: id, room: "", kind: "light", overlay: "sala" };
    return Object.assign({}, meta, {
      on: !!raw.on,
      color: hex(raw.color),
      intensity: clamp(raw.intensity, 0.35)
    });
  }

  function paintHeader() {
    $("casa-title").textContent = View.houseTitle
      ? View.houseTitle(session && session.display_name)
      : ((session && session.display_name) ? "Casa de " + String(session.display_name).trim() : "Sua casa");
    var profile = session && session.profile_id;
    var photo = $("casa-photo");
    photo.src = HOUSE_IMG[profile] || HOUSE_IMG.Acolhedor;
    $("casa-frame").dataset.profile = profile || "";
    $("casa-profile-caption").textContent = profile ? "Perfil " + profile : "";
    var badges = $("casa-badges");
    badges.replaceChildren();
    ["Zen", "Cyber", "Excentrico", "Acolhedor"].forEach(function (id) {
      var el = document.createElement("span");
      el.className = "casa-badge" + (id === profile ? " is-on" : "");
      el.textContent = id === "Excentrico" ? "Excêntrico" : id;
      badges.appendChild(el);
    });
  }

  function overlayFor(room) {
    var devices = DEVICES.map(function (item) { return deviceFromState(item.id); });
    var on = View.overlayLights ? View.overlayLights(devices, room) : devices.filter(function (item) {
      return item.overlay === room && item.on;
    });
    var el = $("overlay-" + room);
    if (!el) return;
    if (!on.length) {
      el.style.opacity = "0";
      return;
    }
    var mix = on[0];
    var color = mix.color;
    var alpha = 0.32 + mix.intensity * 0.55;
    el.style.background = "radial-gradient(circle at 50% 40%, " + color + " 0%, transparent 70%)";
    el.style.opacity = String(alpha);
    if (room === "sala") {
      var img = $("casa-photo");
      img.style.filter = "brightness(" + (0.55 + mix.intensity * 0.7) + ")";
    }
  }

  function paintOverlays() {
    ["quarto", "sala", "cozinha", "casa"].forEach(overlayFor);
    document.querySelectorAll(".casa-group").forEach(function (btn) {
      var room = btn.getAttribute("data-room");
      var lit = DEVICES.some(function (item) {
        return item.room === room && deviceFromState(item.id).on;
      });
      btn.classList.toggle("is-on", lit);
    });
  }

  function matchesFilters(item) {
    var q = ($("device-search").value || "").trim().toLowerCase();
    var kind = $("device-kind").value;
    if (roomFilter && item.room !== roomFilter) return false;
    if (kind && item.kind !== kind) return false;
    if (q && item.label.toLowerCase().indexOf(q) < 0) return false;
    return true;
  }

  function paintDevices() {
    var list = $("device-list");
    list.replaceChildren();
    var rows = DEVICES.map(function (meta) { return deviceFromState(meta.id); }).filter(matchesFilters);
    if ($("device-sort").value === "name") {
      rows.sort(function (a, b) { return a.label.localeCompare(b.label, "pt-BR"); });
    }
    rows.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "casa-device";
      li.innerHTML = '<div class="casa-device-row">'
        + '<span class="casa-device-icon">' + (ICONS[item.icon] || ICONS.bulb) + "</span>"
        + "<span>" + item.label + "</span>"
        + '<button type="button" class="casa-toggle' + (item.on ? " is-on" : "") + '" data-toggle="' + item.id + '">'
        + (item.on ? "Ativado" : "Desativado") + "</button></div>"
        + '<div class="casa-swatches" aria-label="Cor">'
        + SWATCHES.map(function (color) {
          return '<button type="button" class="casa-swatch' + (item.color === color ? " is-on" : "") + '" data-color="' + item.id + '" data-hex="' + color + '" style="background:' + color + '"></button>';
        }).join("")
        + '<input class="casa-swatch-custom" type="color" data-custom="' + item.id + '" value="' + item.color + '" title="Cor personalizada">'
        + "</div>"
        + '<input class="casa-bright" type="range" min="0" max="1" step="0.05" value="' + item.intensity + '" data-bright="' + item.id + '" aria-label="Brilho de ' + item.label + '">';
      list.appendChild(li);
    });
  }

  function allowedMediaUrl(value) {
    try {
      var url = new URL(String(value || ""));
      var host = url.hostname.toLowerCase();
      return url.protocol === "https:" && (host === "archive.org" || host.slice(-12) === ".archive.org" || host === "jamendo.com" || host.slice(-12) === ".jamendo.com");
    } catch (err) {
      return false;
    }
  }

  function paintNowPlaying() {
    var card = $("casa-now");
    var media = state && state.media;
    var audio = $("casa-player-audio");
    var video = $("casa-player-video");
    if (!media || !allowedMediaUrl(media.url)) {
      card.hidden = true;
      audio.pause();
      video.pause();
      audio.removeAttribute("src");
      video.removeAttribute("src");
      return;
    }
    card.hidden = false;
    $("casa-now-title").textContent = media.title || "Mídia";
    $("casa-now-artist").textContent = media.artist || "";
    $("casa-now-license").textContent = media.license || "";
    $("casa-now-play").textContent = media.playing === false ? "Tocar" : "Pausar";
    var isVideo = media.type === "video";
    audio.hidden = isVideo;
    video.hidden = !isVideo;
    var player = isVideo ? video : audio;
    var other = isVideo ? audio : video;
    other.pause();
    if (player.getAttribute("src") !== media.url) player.src = media.url;
    if (media.playing === false) player.pause();
    else player.play().catch(function () {});
  }

  function paint() {
    paintHeader();
    paintOverlays();
    paintDevices();
    paintNowPlaying();
  }

  function take(next) {
    if (!next || (session && next.session_id && next.session_id !== session.id)) return;
    if (state && typeof next.version === "number" && next.version < state.version) return;
    state = next;
    paint();
  }

  async function authHeaders() {
    var headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }

  async function patchDevice(body) {
    var res = await fetch("/api/house/device", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(body)
    });
    var json = await res.json().catch(function () { return null; });
    if (json && json.state) take(json.state);
    return json;
  }

  function appendBubble(role, text) {
    var thread = $("casa-thread");
    var li = document.createElement("li");
    li.className = "casa-bubble" + (role === "you" ? " is-you" : "");
    li.textContent = text;
    thread.appendChild(li);
    thread.scrollTop = thread.scrollHeight;
  }

  async function sendChat(text) {
    if (!text) return;
    appendBubble("you", text);
    var res = await fetch("/api/gen/chat", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ text: text })
    });
    var json = await res.json().catch(function () { return null; });
    if (json && json.state) take(json.state);
    appendBubble("gen", (json && json.reply_text) || "Não consegui falar agora.");
  }

  function paintChips() {
    var box = $("casa-chips");
    box.replaceChildren();
    suggestions.forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "casa-chip";
      btn.textContent = item.label;
      btn.addEventListener("click", async function () {
        appendBubble("gen", item.message);
        for (var i = 0; i < item.patches.length; i++) await patchDevice(item.patches[i]);
      });
      box.appendChild(btn);
    });
  }

  function openSheet() {
    $("casa-sheet").hidden = false;
    $("casa-text").focus();
  }

  function closeSheet() {
    $("casa-sheet").hidden = true;
  }

  async function loadHistory() {
    if (!token || !session) return;
    try {
      var res = await fetch("/api/gen/history?code=" + encodeURIComponent(session.id), {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store"
      });
      if (!res.ok) return;
      var body = await res.json();
      (body.entries || []).forEach(function (row) {
        if (row.kind === "transcript") appendBubble("you", row.body);
        if (row.kind === "reply") appendBubble("gen", row.body);
      });
    } catch (err) {}
  }

  function subscribe(id) {
    if (channel && sb) sb.removeChannel(channel);
    if (!sb || !id) return;
    channel = sb.channel("house:" + id, { config: { private: false, broadcast: { ack: false, self: false } } });
    channel.on("broadcast", { event: "house_state_changed" }, function (message) {
      var payload = message && message.payload;
      if (payload && payload.payload) payload = payload.payload;
      if (payload && payload.session_id) take(payload);
    });
    channel.subscribe();
  }

  function demoState() {
    session = { id: "DEMO01", display_name: "André", profile_id: "Acolhedor" };
    state = {
      session_id: "DEMO01",
      version: 1,
      lights: {
        sala_luz: { on: true, color: "#FF1A1A", intensity: 0.85 },
        quarto_luz: { on: false, color: "#FF1A1A", intensity: 0.2 },
        abajur: { on: false, color: "#FFAA00", intensity: 0.45 },
        fita_led: { on: false, color: "#7C3AED", intensity: 0.55 },
        tv: { on: true, color: "#3B82F6", intensity: 0.7 },
        ambiente: { on: false, color: "#FF1A1A", intensity: 0.3 },
        main: { intensity: 0.85, color: "#FF1A1A" },
        lanterns: { intensity: 0, color: "#FF1A1A" }
      },
      media: {
        type: "audio",
        url: "https://archive.org/download/testmp3testfile/mpthreetest.mp3",
        title: "Acoustic guitar evening",
        artist: "Internet Archive",
        license: "CC BY",
        device: "tv",
        playing: true,
        updated_at: "2026-11-09T02:00:00.000Z"
      }
    };
    suggestions = window.GenjutsuCasaSuggestions.suggestionsFor("Acolhedor", new Date());
    paint();
    paintChips();
    if (suggestions[0]) appendBubble("gen", suggestions[0].message);
  }

  async function start() {
    if (new URLSearchParams(location.search).get("demo") === "1") {
      demoState();
      return;
    }
    var cfg = await fetch("/api/config", { cache: "no-store" }).then(function (res) { return res.ok ? res.json() : {}; }).catch(function () { return {}; });
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
      location.href = "/";
      return;
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    var auth = await sb.auth.getSession();
    var user = auth && auth.data && auth.data.session && auth.data.session.user;
    token = auth && auth.data && auth.data.session && auth.data.session.access_token;
    if (!user || !token) {
      location.href = "/";
      return;
    }
    var house = await fetch("/api/house/state", { headers: await authHeaders(), cache: "no-store" }).then(function (res) { return res.json(); }).catch(function () { return null; });
    if (!house || !house.session || !house.session.id) {
      location.href = "/";
      return;
    }
    session = house.session;
    state = house.state;
    suggestions = window.GenjutsuCasaSuggestions.suggestionsFor(session.profile_id, new Date());
    paint();
    paintChips();
    if (suggestions[0]) appendBubble("gen", suggestions[0].message);
    subscribe(session.id);
    loadHistory();
  }

  $("device-list").addEventListener("click", function (event) {
    var toggle = event.target.closest("[data-toggle]");
    if (toggle) {
      var id = toggle.getAttribute("data-toggle");
      var current = deviceFromState(id);
      patchDevice({ device_id: id, on: !current.on });
      return;
    }
    var swatch = event.target.closest("[data-color]");
    if (swatch) {
      patchDevice({
        device_id: swatch.getAttribute("data-color"),
        on: true,
        color: swatch.getAttribute("data-hex")
      });
    }
  });
  $("device-list").addEventListener("input", function (event) {
    var bright = event.target.getAttribute("data-bright");
    if (bright) {
      patchDevice({ device_id: bright, intensity: Number(event.target.value), on: Number(event.target.value) > 0.02 });
    }
    var custom = event.target.getAttribute("data-custom");
    if (custom) patchDevice({ device_id: custom, on: true, color: event.target.value });
  });
  $("device-search").addEventListener("input", paintDevices);
  $("device-kind").addEventListener("change", paintDevices);
  $("device-sort").addEventListener("change", paintDevices);
  document.querySelectorAll(".casa-group").forEach(function (btn) {
    btn.addEventListener("click", function () {
      roomFilter = roomFilter === btn.getAttribute("data-room") ? "" : btn.getAttribute("data-room");
      paintDevices();
    });
  });
  $("casa-ask").addEventListener("click", openSheet);
  $("casa-sheet-close").addEventListener("click", closeSheet);
  $("casa-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var text = $("casa-text").value.trim();
    $("casa-text").value = "";
    sendChat(text);
  });
  async function patchMedia(body) {
    var res = await fetch("/api/house/media", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(body)
    });
    var json = await res.json().catch(function () { return null; });
    if (json && json.state) take(json.state);
    return json;
  }

  $("casa-now-play").addEventListener("click", function () {
    var media = state && state.media;
    if (!media) return;
    if (new URLSearchParams(location.search).get("demo") === "1") {
      media.playing = media.playing === false;
      paintNowPlaying();
      return;
    }
    patchMedia({ playing: media.playing === false });
  });
  $("casa-now-stop").addEventListener("click", function () {
    if (new URLSearchParams(location.search).get("demo") === "1") {
      if (state && state.media) state.media.playing = false;
      paintNowPlaying();
      return;
    }
    patchMedia({ stop: true });
  });

  $("casa-voice").addEventListener("click", function () {
    openSheet();
    $("casa-text").placeholder = "Fale ou escreva para o Gen";
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
