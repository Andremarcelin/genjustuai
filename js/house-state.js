(function () {
  var POLL_MS = 2000;
  var SESSION_MS = 4000;
  var DOJOS = { Zen: 1, Cyber: 1, Excentrico: 1, Acolhedor: 1 };
  var sessionId = null;
  var version = -1;
  var client = null;
  var channel = null;
  var pollTimer = null;
  var realtimeOk = false;
  var configReady = null;

  function $(id) { return document.getElementById(id); }

  function safeColor(value) {
    return /^#[0-9A-Fa-f]{6}$/.test(String(value || "")) ? String(value) : "#FF1A1A";
  }

  function clamp(value, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(1, Math.max(0, number));
  }

  function apply(state) {
    var root = $("landing");
    var veil = $("house-veil");
    if (!root || !veil) return;
    if (!state || state.session_id !== sessionId) {
      root.removeAttribute("data-house-mode");
      root.removeAttribute("data-house-dojo");
      veil.hidden = true;
      return;
    }
    var lights = state.lights || {};
    var main = lights.main || {};
    var lanterns = lights.lanterns || {};
    var mainLevel = clamp(main.intensity, 0.35);
    var lanternLevel = clamp(lanterns.intensity, 0.2);
    root.dataset.houseMode = state.mode === "dojo" ? "dojo" : "hub";
    if (state.mode === "dojo" && DOJOS[state.dojo]) root.dataset.houseDojo = state.dojo;
    else root.removeAttribute("data-house-dojo");
    root.style.setProperty("--house-color", safeColor(main.color));
    root.style.setProperty("--house-alpha", String(0.12 + mainLevel * 0.38));
    root.style.setProperty("--lantern-color", safeColor(lanterns.color));
    root.style.setProperty("--lantern-alpha", Math.round(8 + lanternLevel * 22) + "%");
    veil.hidden = false;
  }

  function take(state) {
    if (!state || state.session_id !== sessionId) return;
    if (typeof state.version === "number" && state.version < version) return;
    version = typeof state.version === "number" ? state.version : version;
    apply(state);
  }

  function unwrap(message) {
    if (!message || typeof message !== "object") return null;
    var body = message;
    if (body.payload && typeof body.payload === "object") body = body.payload;
    if (body.payload && typeof body.payload === "object" && body.version != null) body = body.payload;
    if (!body.session_id || body.version == null) return null;
    return body;
  }

  function stopPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function ensurePoll() {
    if (pollTimer || !sessionId) return;
    pollTimer = setInterval(pullState, POLL_MS);
  }

  function pullState() {
    if (!sessionId) return;
    fetch("/api/house/state", { cache: "no-store" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (body) {
        if (!body) return;
        if (!body.state) {
          version = -1;
          apply(null);
          return;
        }
        take(body.state);
      })
      .catch(function () {});
  }

  function closeChannel() {
    realtimeOk = false;
    if (channel && client) {
      client.removeChannel(channel);
    }
    channel = null;
  }

  function openChannel(id) {
    closeChannel();
    if (!client || !id) {
      ensurePoll();
      return;
    }
    channel = client.channel("house:" + id, {
      config: { private: false, broadcast: { ack: false, self: false } },
    });
    channel.on("broadcast", { event: "house_state_changed" }, function (message) {
      var state = unwrap(message);
      if (state) take(state);
    });
    channel.subscribe(function (status) {
      realtimeOk = status === "SUBSCRIBED";
      if (realtimeOk) stopPoll();
      else ensurePoll();
    });
    setTimeout(function () {
      if (!realtimeOk) ensurePoll();
    }, 2500);
  }

  function retarget(id) {
    if (id === sessionId) return;
    sessionId = id || null;
    version = -1;
    stopPoll();
    closeChannel();
    if (!sessionId) {
      apply(null);
      return;
    }
    pullState();
    openChannel(sessionId);
  }

  function loadConfig() {
    if (configReady) return configReady;
    configReady = fetch("/api/config", { cache: "no-store" })
      .then(function (res) { return res.ok ? res.json() : {}; })
      .then(function (cfg) {
        if (cfg && cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
          client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
            realtime: { params: { eventsPerSecond: 8 } },
          });
        }
      })
      .catch(function () {});
    return configReady;
  }

  function refreshSession() {
    fetch("/api/session", { cache: "no-store" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (body) {
        var id = body && body.session && body.session.id ? body.session.id : null;
        retarget(id);
      })
      .catch(function () { ensurePoll(); });
  }

  function start() {
    if (!$("landing")) return;
    loadConfig().then(refreshSession);
    setInterval(refreshSession, SESSION_MS);
  }

  window.HouseStateProvider = {
    start: start,
    apply: apply,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
